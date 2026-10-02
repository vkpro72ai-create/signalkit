import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { GitHubAppClient, signGitHubAppJwt } from './github-app-client.service';

let privateKey: string;
let publicKey: string;

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
});

describe('signGitHubAppJwt', () => {
  it('produces a JWT whose signature verifies against the App\'s public key', () => {
    const jwt = signGitHubAppJwt('app-123', privateKey, new Date('2026-09-01T00:00:00Z'));
    const [headerB64, payloadB64, signatureB64] = jwt.split('.');
    const signingInput = `${headerB64}.${payloadB64}`;

    const verifier = createVerify('RSA-SHA256');
    verifier.update(signingInput);
    expect(verifier.verify(publicKey, Buffer.from(signatureB64, 'base64url'))).toBe(true);
  });

  it('carries iss=appId and a short (~9min) expiry window', () => {
    const now = new Date('2026-09-01T00:00:00Z');
    const jwt = signGitHubAppJwt('app-123', privateKey, now);
    const [, payloadB64] = jwt.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as { iss: string; iat: number; exp: number };
    expect(payload.iss).toBe('app-123');
    expect(payload.exp - payload.iat).toBe(60 * 9);
  });
});

describe('GitHubAppClient — configuration', () => {
  const keys = [
    'SELF_IMPROVEMENT_GITHUB_APP_ID',
    'SELF_IMPROVEMENT_GITHUB_APP_PRIVATE_KEY',
    'SELF_IMPROVEMENT_GITHUB_APP_INSTALLATION_ID',
    'SELF_IMPROVEMENT_GITHUB_REPO',
  ];
  const originals = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of keys) {
      if (originals[k] === undefined) delete process.env[k];
      else process.env[k] = originals[k];
    }
  });

  it('refuses to dispatch when not configured, without attempting any network call', async () => {
    for (const k of keys) delete process.env[k];
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const client = new GitHubAppClient();
    await expect(client.dispatch({ runId: 'r1', baseSha: 'abc' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('GitHubAppClient — dispatch payload', () => {
  const keys = {
    SELF_IMPROVEMENT_GITHUB_APP_ID: 'app-123',
    SELF_IMPROVEMENT_GITHUB_APP_PRIVATE_KEY: '',
    SELF_IMPROVEMENT_GITHUB_APP_INSTALLATION_ID: 'inst-456',
    SELF_IMPROVEMENT_GITHUB_REPO: 'signalkit/signalkit',
  };
  const originals: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const k of Object.keys(keys)) {
      if (originals[k] === undefined) delete process.env[k];
      else process.env[k] = originals[k];
    }
    vi.restoreAllMocks();
  });

  function setEnv() {
    for (const [k, v] of Object.entries(keys)) {
      originals[k] = process.env[k];
      process.env[k] = k === 'SELF_IMPROVEMENT_GITHUB_APP_PRIVATE_KEY' ? privateKey : v;
    }
  }

  it('the repository_dispatch call body contains ONLY {event_type, client_payload: {runId, baseSha}} — no patch, prompt, or credential', async () => {
    setEnv();
    const calls: Array<{ url: string; body?: string; headers?: Record<string, string> }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = String(url);
      calls.push({ url: urlStr, body: init?.body as string | undefined, headers: init?.headers as never });
      if (urlStr.includes('/access_tokens')) {
        return new Response(JSON.stringify({ token: 'ghs_fake_installation_token' }), { status: 201 });
      }
      if (urlStr.includes('/dispatches')) {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fetch to ${urlStr}`);
    });

    const client = new GitHubAppClient();
    await client.dispatch({ runId: 'run-abc123', baseSha: 'deadbeefcafe' });

    const dispatchCall = calls.find((c) => c.url.includes('/dispatches'));
    expect(dispatchCall).toBeDefined();
    const body = JSON.parse(dispatchCall!.body!) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['client_payload', 'event_type']);
    expect(body.event_type).toBe('self_improve_propose');
    expect(Object.keys(body.client_payload as object).sort()).toEqual(['baseSha', 'runId']);
    expect(body.client_payload).toEqual({ runId: 'run-abc123', baseSha: 'deadbeefcafe' });
  });

  it('getBranchSha returns the commit sha reported by GitHub for the requested branch', async () => {
    setEnv();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/access_tokens')) {
        return new Response(JSON.stringify({ token: 'ghs_fake' }), { status: 201 });
      }
      if (urlStr.includes('/branches/main')) {
        return new Response(JSON.stringify({ commit: { sha: 'sha-main-tip' } }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${urlStr}`);
    });
    const client = new GitHubAppClient();
    await expect(client.getBranchSha('main')).resolves.toBe('sha-main-tip');
  });

  it('surfaces a clear error if the installation token exchange fails', async () => {
    setEnv();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    const client = new GitHubAppClient();
    await expect(client.getBranchSha('main')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
