import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createSign } from 'node:crypto';
import { optionalEnv, requireEnv } from '@signalkit/config';

/**
 * RS256 GitHub App JWT (RFC 7519), signed with the App's private key.
 * Pure function — independently testable with any RSA keypair, no network.
 */
export function signGitHubAppJwt(appId: string, privateKeyPem: string, now = new Date()): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const issuedAt = Math.floor(now.getTime() / 1000) - 60; // clock drift tolerance
  const payload = { iat: issuedAt, exp: issuedAt + 60 * 9, iss: appId };

  const base64url = (input: object): string =>
    Buffer.from(JSON.stringify(input)).toString('base64url');

  const signingInput = `${base64url(header)}.${base64url(payload)}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKeyPem).toString('base64url');
  return `${signingInput}.${signature}`;
}

export interface RepositoryDispatchPayload {
  runId: string;
  baseSha: string;
}

/**
 * Minimal GitHub App REST client — only what Phase L2.1 needs: read the base
 * branch SHA, and fire a repository_dispatch event. Never sends a code patch,
 * a prompt, or a secret in the dispatch payload — see dispatch() below.
 *
 * Credentials come exclusively from platform env vars (GitHub Secrets in CI,
 * ops-managed env in the API's own deployment) — never from a workspace's
 * UserLLMConnection or any per-user credential.
 */
@Injectable()
export class GitHubAppClient {
  private readonly apiBase = optionalEnv('SELF_IMPROVEMENT_GITHUB_API_BASE', 'https://api.github.com');

  private isConfigured(): boolean {
    return Boolean(
      optionalEnv('SELF_IMPROVEMENT_GITHUB_APP_ID', '') &&
        optionalEnv('SELF_IMPROVEMENT_GITHUB_APP_PRIVATE_KEY', '') &&
        optionalEnv('SELF_IMPROVEMENT_GITHUB_APP_INSTALLATION_ID', '') &&
        optionalEnv('SELF_IMPROVEMENT_GITHUB_REPO', ''),
    );
  }

  private async getInstallationToken(): Promise<string> {
    const appId = requireEnv('SELF_IMPROVEMENT_GITHUB_APP_ID');
    const privateKey = requireEnv('SELF_IMPROVEMENT_GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n');
    const installationId = requireEnv('SELF_IMPROVEMENT_GITHUB_APP_INSTALLATION_ID');
    const jwt = signGitHubAppJwt(appId, privateKey);

    const res = await fetch(`${this.apiBase}/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(`GitHub App installation token exchange failed: ${res.status}`);
    }
    const body = (await res.json()) as { token: string };
    return body.token;
  }

  /** The current tip of `main` — recorded as this run's baseSha before dispatch. */
  async getBranchSha(branch = 'main'): Promise<string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Self-improvement GitHub App is not configured in this environment');
    }
    const repo = requireEnv('SELF_IMPROVEMENT_GITHUB_REPO');
    const token = await this.getInstallationToken();
    const res = await fetch(`${this.apiBase}/repos/${repo}/branches/${branch}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(`GitHub branch lookup failed: ${res.status}`);
    }
    const body = (await res.json()) as { commit: { sha: string } };
    return body.commit.sha;
  }

  /**
   * Fires `repository_dispatch` with ONLY identifiers — never a patch, prompt,
   * or credential. The workflow fetches the actual objective/constraints from
   * the SignalKit API (authenticated with the CI token) using `runId`.
   */
  async dispatch(payload: RepositoryDispatchPayload): Promise<void> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Self-improvement GitHub App is not configured in this environment');
    }
    const repo = requireEnv('SELF_IMPROVEMENT_GITHUB_REPO');
    const token = await this.getInstallationToken();
    const res = await fetch(`${this.apiBase}/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event_type: 'self_improve_propose', client_payload: payload }),
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(`GitHub repository_dispatch failed: ${res.status}`);
    }
  }
}
