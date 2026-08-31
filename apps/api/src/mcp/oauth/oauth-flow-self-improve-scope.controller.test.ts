import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { AuthService } from '../../auth/auth.service';
import type { WorkspacesService } from '../../workspaces/workspaces.service';
import type { PermissionsService } from '../../permissions/permissions.service';
import type { OAuthClientService } from './oauth-client.service';
import type { OAuthCodeService } from './oauth-code.service';
import type { OAuthTokenService } from './oauth-token.service';
import type { OAuthConsentService, PendingAuthorizeRequest } from './oauth-consent.service';
import type { SelfImproveAuthzService } from '../../self-improve/self-improve-authz.service';
import { OAuthFlowController } from './oauth-flow.controller';
import { SELF_IMPROVE_SCOPE, MCP_SUPPORTED_SCOPES } from '../mcp.constants';

const CLIENT = { id: 'client1', clientName: 'Ops Console', redirectUris: ['https://ops.example/callback'] };
const WORKSPACES = [{ id: 'ws1', name: 'Acme Lab', role: 'owner' }];

function makeRes() {
  const res: Partial<Response> & { _status?: number; _sent?: string; _redirect?: string; _json?: unknown } = {};
  res.status = vi.fn().mockImplementation((code: number) => {
    res._status = code;
    return res as Response;
  });
  res.send = vi.fn().mockImplementation((body: string) => {
    res._sent = body;
    return res as Response;
  });
  res.redirect = vi.fn().mockImplementation((url: string) => {
    res._redirect = url;
    return res as Response;
  });
  res.json = vi.fn().mockImplementation((body: unknown) => {
    res._json = body;
    return res as Response;
  });
  return res as Response & { _status?: number; _sent?: string; _redirect?: string; _json?: unknown };
}

function makeController(opts: { isSuperadmin?: boolean; permissionsAllowed?: boolean } = {}) {
  const auth = {} as AuthService;
  const workspaces = { listForUser: vi.fn().mockResolvedValue(WORKSPACES) } as unknown as WorkspacesService;
  const permissions = { can: vi.fn().mockResolvedValue(opts.permissionsAllowed ?? true) } as unknown as PermissionsService;
  const clients = { findById: vi.fn().mockResolvedValue(CLIENT) } as unknown as OAuthClientService;
  const codes = { issueCode: vi.fn().mockResolvedValue('raw-code') } as unknown as OAuthCodeService;
  const tokens = {} as OAuthTokenService;
  const consentService = {
    readSessionCookie: vi.fn().mockReturnValue({ userId: 'user1', email: 'a@b.com' }),
    issueTicket: vi.fn().mockReturnValue('signed-ticket'),
    verifyTicket: vi.fn(),
  } as unknown as OAuthConsentService;
  const selfImproveAuthz = { isSuperadmin: vi.fn().mockReturnValue(opts.isSuperadmin ?? false) } as unknown as SelfImproveAuthzService;

  const controller = new OAuthFlowController(auth, workspaces, permissions, clients, codes, tokens, consentService, selfImproveAuthz);
  return { controller, permissions, codes, consentService, selfImproveAuthz };
}

function query(scope?: string) {
  return {
    response_type: 'code' as const,
    client_id: 'client1',
    redirect_uri: 'https://ops.example/callback',
    scope,
    state: 'xyz',
    code_challenge: 'challenge',
    code_challenge_method: 'S256' as const,
  };
}

describe('OAuthFlowController.authorize — signalkit:self:propose scope', () => {
  it('a non-superadmin requesting the scope is redirected with access_denied, and no ticket is ever issued', async () => {
    const { controller, consentService } = makeController({ isSuperadmin: false });
    const res = makeRes();
    await controller.authorize(query(`workspace:read ${SELF_IMPROVE_SCOPE}`), {} as Request, res);

    expect(res._redirect).toContain('error=access_denied');
    expect(res._redirect).toContain('not_platform_superadmin');
    expect(consentService.issueTicket).not.toHaveBeenCalled();
  });

  it('a superadmin requesting the scope gets a ticket whose pending scopes include it', async () => {
    const { controller, consentService } = makeController({ isSuperadmin: true });
    const res = makeRes();
    await controller.authorize(query(`workspace:read ${SELF_IMPROVE_SCOPE}`), {} as Request, res);

    expect(consentService.issueTicket).toHaveBeenCalledWith(
      'user1',
      expect.objectContaining({ scopes: expect.arrayContaining(['workspace:read', SELF_IMPROVE_SCOPE]) }),
    );
  });

  it('requesting ONLY signalkit:self:propose grants nothing else — no ordinary MCP scopes leak in', async () => {
    const { controller, consentService } = makeController({ isSuperadmin: true });
    const res = makeRes();
    await controller.authorize(query(SELF_IMPROVE_SCOPE), {} as Request, res);

    const pending = (consentService.issueTicket as ReturnType<typeof vi.fn>).mock.calls[0][1] as PendingAuthorizeRequest;
    expect(pending.scopes).toEqual([SELF_IMPROVE_SCOPE]);
  });

  it('no scope param at all defaults to every ordinary scope but NEVER includes the superadmin scope, even for a superadmin', async () => {
    const { controller, consentService } = makeController({ isSuperadmin: true });
    const res = makeRes();
    await controller.authorize(query(undefined), {} as Request, res);

    const pending = (consentService.issueTicket as ReturnType<typeof vi.fn>).mock.calls[0][1] as PendingAuthorizeRequest;
    expect(pending.scopes.sort()).toEqual([...MCP_SUPPORTED_SCOPES].sort());
    expect(pending.scopes).not.toContain(SELF_IMPROVE_SCOPE);
  });
});

describe('OAuthFlowController.consent — defense-in-depth re-check', () => {
  function pendingWith(scopes: string[]): PendingAuthorizeRequest {
    return {
      clientId: 'client1',
      redirectUri: 'https://ops.example/callback',
      scopes,
      state: 'xyz',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
    };
  }

  it('rejects a ticket carrying SELF_IMPROVE_SCOPE if the user is no longer on the superadmin allowlist (e.g. revoked since the ticket was issued)', async () => {
    const { controller, consentService, codes, selfImproveAuthz } = makeController({ isSuperadmin: false, permissionsAllowed: true });
    (consentService.verifyTicket as ReturnType<typeof vi.fn>).mockReturnValue(pendingWith(['workspace:read', SELF_IMPROVE_SCOPE]));
    const res = makeRes();

    await controller.consent({ ticket: 't', workspaceId: 'ws1', decision: 'allow' }, {} as Request, res);

    expect(selfImproveAuthz.isSuperadmin).toHaveBeenCalledWith('user1');
    expect(res._redirect).toContain('error=access_denied');
    expect(codes.issueCode).not.toHaveBeenCalled();
  });

  it('issues the code with the self-improve scope intact when the superadmin re-check passes', async () => {
    const { controller, consentService, codes } = makeController({ isSuperadmin: true, permissionsAllowed: true });
    (consentService.verifyTicket as ReturnType<typeof vi.fn>).mockReturnValue(pendingWith(['workspace:read', SELF_IMPROVE_SCOPE]));
    const res = makeRes();

    await controller.consent({ ticket: 't', workspaceId: 'ws1', decision: 'allow' }, {} as Request, res);

    expect(codes.issueCode).toHaveBeenCalledWith(expect.objectContaining({ scopes: expect.arrayContaining(['workspace:read', SELF_IMPROVE_SCOPE]) }));
  });

  it('the workspace RBAC check (permissions.can) never receives SELF_IMPROVE_SCOPE as one of the permissions to check — it would never match any role', async () => {
    const { controller, consentService, permissions } = makeController({ isSuperadmin: true, permissionsAllowed: true });
    (consentService.verifyTicket as ReturnType<typeof vi.fn>).mockReturnValue(pendingWith(['workspace:read', SELF_IMPROVE_SCOPE]));
    const res = makeRes();

    await controller.consent({ ticket: 't', workspaceId: 'ws1', decision: 'allow' }, {} as Request, res);

    expect(permissions.can).toHaveBeenCalledWith('user1', 'ws1', ['workspace:read']);
  });

  it('ordinary workspace-scope consent (no self-improve involved) is unaffected', async () => {
    const { controller, consentService, permissions, codes } = makeController({ permissionsAllowed: true });
    (consentService.verifyTicket as ReturnType<typeof vi.fn>).mockReturnValue(pendingWith(['workspace:read', 'pack:read']));
    const res = makeRes();

    await controller.consent({ ticket: 't', workspaceId: 'ws1', decision: 'allow' }, {} as Request, res);

    expect(permissions.can).toHaveBeenCalledWith('user1', 'ws1', ['workspace:read', 'pack:read']);
    expect(codes.issueCode).toHaveBeenCalled();
  });
});
