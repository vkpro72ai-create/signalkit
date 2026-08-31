import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { Permission } from '@signalkit/shared';
import { Public } from '../../auth/decorators/public.decorator';
import { AuthService } from '../../auth/auth.service';
import { WorkspacesService } from '../../workspaces/workspaces.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { MCP_SUPPORTED_SCOPES, SELF_IMPROVE_SCOPE, parseRequestedScopes } from '../mcp.constants';
import { SelfImproveAuthzService } from '../../self-improve/self-improve-authz.service';
import { OAuthClientService } from './oauth-client.service';
import { OAuthCodeService } from './oauth-code.service';
import { OAuthTokenService } from './oauth-token.service';
import { OAuthConsentService, type PendingAuthorizeRequest } from './oauth-consent.service';
import { verifyPkce } from './oauth-crypto.util';
import { AuthorizeQueryDto } from './dto/authorize-query.dto';
import { OAuthLoginDto } from './dto/login.dto';
import { ConsentDto } from './dto/consent.dto';
import { TokenRequestDto } from './dto/token-request.dto';
import { consentPage, loginPage, oauthErrorPage } from './oauth-pages';

function withState(redirectUri: string, params: Record<string, string | undefined>): string {
  const query = Object.entries(params)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `${redirectUri}${redirectUri.includes('?') ? '&' : '?'}${query}`;
}

/**
 * The interactive OAuth 2.1 Authorization Code + PKCE flow. GET /oauth/authorize
 * is public but redirects to nothing unresolved: an unregistered client_id or
 * unregistered redirect_uri renders an error page rather than redirecting, since
 * redirecting to an unverified URI is the open-redirect risk PKCE doesn't cover.
 */
@ApiExcludeController()
@Controller('oauth')
export class OAuthFlowController {
  constructor(
    private readonly auth: AuthService,
    private readonly workspaces: WorkspacesService,
    private readonly permissions: PermissionsService,
    private readonly clients: OAuthClientService,
    private readonly codes: OAuthCodeService,
    private readonly tokens: OAuthTokenService,
    private readonly consentService: OAuthConsentService,
    private readonly selfImproveAuthz: SelfImproveAuthzService,
  ) {}

  @Public()
  @Get('authorize')
  async authorize(@Query() query: AuthorizeQueryDto, @Req() req: Request, @Res() res: Response): Promise<void> {
    const client = await this.clients.findById(query.client_id);
    if (!client) {
      res.status(400).send(oauthErrorPage('Unknown client_id — this MCP client may need to reconnect.'));
      return;
    }
    if (!client.redirectUris.includes(query.redirect_uri)) {
      res.status(400).send(oauthErrorPage('redirect_uri is not registered for this client.'));
      return;
    }

    // Session is resolved before scope resolution because granting
    // SELF_IMPROVE_SCOPE depends on who is logged in (the platform-superadmin
    // allowlist), not on workspace membership — so we need the userId first.
    const session = this.consentService.readSessionCookie(req);
    if (!session) {
      const queryIndex = req.originalUrl.indexOf('?');
      const continueQuery = queryIndex >= 0 ? req.originalUrl.slice(queryIndex + 1) : '';
      res.send(loginPage({ continueQuery }));
      return;
    }

    const requestedTokens = (query.scope ?? '').trim() ? query.scope!.trim().split(/\s+/) : null;
    const wantsSelfImprove = requestedTokens?.includes(SELF_IMPROVE_SCOPE) ?? false;
    const nonSelfImproveTokens = requestedTokens?.filter((t) => t !== SELF_IMPROVE_SCOPE) ?? null;

    let scopes: string[];
    if (requestedTokens === null) {
      // No `scope` param at all — default to every ordinary (non-superadmin) scope.
      scopes = [...MCP_SUPPORTED_SCOPES];
    } else if (nonSelfImproveTokens && nonSelfImproveTokens.length > 0) {
      try {
        scopes = parseRequestedScopes(nonSelfImproveTokens.join(' '));
      } catch {
        res.redirect(withState(query.redirect_uri, { error: 'invalid_scope', state: query.state }));
        return;
      }
    } else {
      // The client asked ONLY for signalkit:self:propose — grant nothing else.
      scopes = [];
    }

    if (wantsSelfImprove) {
      if (!this.selfImproveAuthz.isSuperadmin(session.userId)) {
        res.redirect(
          withState(query.redirect_uri, {
            error: 'access_denied',
            error_description: 'not_platform_superadmin',
            state: query.state,
          }),
        );
        return;
      }
      scopes = [...scopes, SELF_IMPROVE_SCOPE];
    }

    const pending: PendingAuthorizeRequest = {
      clientId: client.id,
      redirectUri: query.redirect_uri,
      scopes,
      state: query.state,
      codeChallenge: query.code_challenge,
      codeChallengeMethod: query.code_challenge_method,
    };

    const memberships = await this.workspaces.listForUser(session.userId);
    if (memberships.length === 0) {
      res.status(400).send(oauthErrorPage('Your account has no workspace to grant access to.'));
      return;
    }

    const ticket = this.consentService.issueTicket(session.userId, pending);
    res.send(
      consentPage({
        clientName: client.clientName,
        scopes,
        ticket,
        workspaces: memberships.map((w) => ({ id: w.id, name: w.name })),
      }),
    );
  }

  @Public()
  @Post('login')
  async login(@Body() dto: OAuthLoginDto, @Res() res: Response): Promise<void> {
    try {
      const { userId } = await this.auth.login({ email: dto.email, password: dto.password });
      this.consentService.setSessionCookie(res, userId, dto.email);
      res.redirect(`/oauth/authorize?${dto.continue}`);
    } catch {
      res.status(401).send(loginPage({ continueQuery: dto.continue, error: 'Invalid email or password.' }));
    }
  }

  @Public()
  @Post('consent')
  async consent(@Body() dto: ConsentDto, @Req() req: Request, @Res() res: Response): Promise<void> {
    const session = this.consentService.readSessionCookie(req);
    if (!session) {
      res.status(401).send(oauthErrorPage('Your sign-in expired — please try connecting again.'));
      return;
    }

    let pending: PendingAuthorizeRequest;
    try {
      pending = this.consentService.verifyTicket(dto.ticket, session.userId);
    } catch (error) {
      res.status(401).send(oauthErrorPage(error instanceof Error ? error.message : 'Invalid consent request.'));
      return;
    }

    if (dto.decision === 'deny') {
      res.redirect(withState(pending.redirectUri, { error: 'access_denied', state: pending.state }));
      return;
    }

    const memberships = await this.workspaces.listForUser(session.userId);
    const workspace = memberships.find((w) => w.id === dto.workspaceId);
    if (!workspace) {
      res.status(403).send(oauthErrorPage('You are not a member of the selected workspace.'));
      return;
    }
    // SELF_IMPROVE_SCOPE is not workspace RBAC — it was already gated by the
    // superadmin allowlist in authorize(). Re-check it here too (defense in
    // depth against a stale/replayed ticket) instead of feeding it into the
    // workspace permission check, where it would never match any role.
    const hasSelfImprove = pending.scopes.includes(SELF_IMPROVE_SCOPE);
    const workspaceScopes = pending.scopes.filter((s) => s !== SELF_IMPROVE_SCOPE) as Permission[];
    const allowed = await this.permissions.can(session.userId, dto.workspaceId, workspaceScopes);
    if (!allowed || (hasSelfImprove && !this.selfImproveAuthz.isSuperadmin(session.userId))) {
      res.redirect(withState(pending.redirectUri, { error: 'access_denied', state: pending.state }));
      return;
    }

    const code = await this.codes.issueCode({
      clientId: pending.clientId,
      workspaceId: dto.workspaceId,
      userId: session.userId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      codeChallengeMethod: pending.codeChallengeMethod,
      scopes: pending.scopes,
    });
    res.redirect(withState(pending.redirectUri, { code, state: pending.state }));
  }

  @Public()
  @Post('token')
  async token(@Body() dto: TokenRequestDto, @Res() res: Response): Promise<void> {
    try {
      if (dto.grant_type === 'authorization_code') {
        if (!dto.code || !dto.redirect_uri || !dto.code_verifier) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const record = await this.codes.consumeCode(dto.code, dto.client_id, dto.redirect_uri);
        if (!verifyPkce(dto.code_verifier, record.codeChallenge, record.codeChallengeMethod)) {
          res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
          return;
        }
        const client = await this.clients.findById(dto.client_id);
        if (!client) {
          res.status(400).json({ error: 'invalid_client' });
          return;
        }
        const tokens = await this.tokens.issueForNewSession({
          clientId: client.id,
          clientName: client.clientName,
          workspaceId: record.workspaceId,
          userId: record.userId,
          scopes: record.scopes as Permission[],
        });
        res.json(tokens);
        return;
      }

      if (!dto.refresh_token) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const tokens = await this.tokens.refresh(dto.refresh_token, dto.client_id);
      res.json(tokens);
    } catch (error) {
      res.status(400).json({ error: 'invalid_grant', error_description: error instanceof Error ? error.message : 'Token request failed' });
    }
  }
}
