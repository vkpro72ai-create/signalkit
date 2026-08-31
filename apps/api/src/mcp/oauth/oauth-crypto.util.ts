import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** SHA-256 hex digest — used so raw opaque tokens/codes are never persisted. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** A random, URL-safe opaque token (authorization code, refresh token, session cookie value). */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function timingSafeHashEquals(hashA: string, hashB: string): boolean {
  const a = Buffer.from(hashA, 'hex');
  const b = Buffer.from(hashB, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** RFC 7636 PKCE verification. Only S256 is supported (A1 does not accept `plain`). */
export function verifyPkce(codeVerifier: string, codeChallenge: string, method: string): boolean {
  if (method !== 'S256') return false;
  const computed = createHash('sha256').update(codeVerifier).digest('base64url');
  return computed === codeChallenge;
}
