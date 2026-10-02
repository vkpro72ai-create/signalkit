import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';

export const OAUTH_SESSION_COOKIE = 'sk_oauth_session';
const OAUTH_SESSION_TTL_SECONDS = 15 * 60;
const OAUTH_TICKET_TTL_SECONDS = 10 * 60;

interface OAuthSessionCookiePayload {
  sub: string;
  email: string;
  aud: 'oauth_consent';
}

/** The validated /oauth/authorize request, bound into a signed ticket the consent form round-trips. */
export interface PendingAuthorizeRequest {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state?: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

interface OAuthTicketPayload extends PendingAuthorizeRequest {
  sub: string;
  aud: 'oauth_ticket';
}

/**
 * Two short-lived, purpose-scoped JWTs (never touches the login-session
 * used by the SPA):
 *  - a browser cookie proving "this browser is logged in for the OAuth
 *    consent flow" (separate from the SPA's own bearer-token auth, since a
 *    top-level page navigation can't carry an Authorization header);
 *  - a per-authorize-request "ticket" embedded as a hidden form field so a
 *    forged cross-site POST to /oauth/consent can't approve a client it
 *    never actually saw the real consent page for (the ticket is only ever
 *    delivered inside a same-origin GET response body).
 */
@Injectable()
export class OAuthConsentService {
  constructor(private readonly jwt: JwtService) {}

  setSessionCookie(res: Response, userId: string, email: string): void {
    const payload: OAuthSessionCookiePayload = { sub: userId, email, aud: 'oauth_consent' };
    const token = this.jwt.sign(payload, { expiresIn: OAUTH_SESSION_TTL_SECONDS });
    res.cookie(OAUTH_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: OAUTH_SESSION_TTL_SECONDS * 1000,
      path: '/oauth',
    });
  }

  /** Returns the logged-in user for the consent flow, or null if there is no valid cookie. */
  readSessionCookie(req: Request): { userId: string; email: string } | null {
    const raw = (req.cookies as Record<string, string> | undefined)?.[OAUTH_SESSION_COOKIE];
    if (!raw) return null;
    try {
      const payload = this.jwt.verify<OAuthSessionCookiePayload>(raw);
      if (payload.aud !== 'oauth_consent') return null;
      return { userId: payload.sub, email: payload.email };
    } catch {
      return null;
    }
  }

  issueTicket(userId: string, request: PendingAuthorizeRequest): string {
    const payload: OAuthTicketPayload = { sub: userId, aud: 'oauth_ticket', ...request };
    return this.jwt.sign(payload, { expiresIn: OAUTH_TICKET_TTL_SECONDS });
  }

  /** Verifies the ticket and that it was issued to the still-logged-in user presenting it. */
  verifyTicket(raw: string, expectedUserId: string): PendingAuthorizeRequest {
    let payload: OAuthTicketPayload;
    try {
      payload = this.jwt.verify<OAuthTicketPayload>(raw);
    } catch {
      throw new UnauthorizedException('Consent request expired — please try connecting again.');
    }
    if (payload.aud !== 'oauth_ticket' || payload.sub !== expectedUserId) {
      throw new UnauthorizedException('Consent request does not match the logged-in user.');
    }
    const { clientId, redirectUri, scopes, state, codeChallenge, codeChallengeMethod } = payload;
    return { clientId, redirectUri, scopes, state, codeChallenge, codeChallengeMethod };
  }
}
