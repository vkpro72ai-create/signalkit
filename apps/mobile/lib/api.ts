/**
 * Mobile API client. All calls go through the backend NestJS API.
 * Never calls LLM providers directly. Never logs tokens.
 *
 * Base URL: EXPO_PUBLIC_API_URL (set in .env or EAS secrets)
 * For local dev: http://localhost:3000
 * For production: https://api.yourdomain.com
 */

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export type ApiError = {
  status: number;
  message: string;
  code?: string;
};

export class ApiException extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiException';
  }
}

let _token: string | null = null;
export function setApiToken(token: string | null) {
  _token = token;
}
export function getApiToken() {
  return _token;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...extraHeaders,
  };
  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiException(0, 'Network unavailable. Check your connection.');
  }

  if (res.status === 204) return undefined as T;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiException(res.status, `Non-JSON response from server (status ${res.status})`);
  }

  if (!res.ok) {
    const e = json as { message?: string; error?: string; statusCode?: number };
    throw new ApiException(
      res.status,
      e.message ?? e.error ?? `Request failed with status ${res.status}`,
    );
  }

  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// ─── Typed API helpers ───────────────────────────────────────────────────────

export type AuthTokens = { accessToken: string };
export type MeResponse = {
  id: string;
  email: string;
  name?: string;
  workspaces: Array<{ id: string; name: string; role: string }>;
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthTokens>('/auth/login', { email, password }),
  register: (email: string, password: string, name?: string) =>
    api.post<AuthTokens>('/auth/register', { email, password, name }),
  me: () => api.get<MeResponse>('/me'),
};

export type WorkspaceProjects = Array<{ id: string; name: string; createdAt: string }>;

export const workspaceApi = {
  projects: (wsId: string) => api.get<WorkspaceProjects>(`/workspaces/${wsId}/projects`),
  niches: (wsId: string) =>
    api.get<Array<{
      id: string;
      name: string;
      opportunityScore: number;
      confidence: { level: string; value: number };
      ventureScaleScore?: number;
      buildReadinessScore?: number;
    }>>(`/workspaces/${wsId}/niches`),
};

export type PackSummary = {
  id: string;
  depth: string;
  language: string;
  status: string;
  documentCount: number;
  approvedCount: number;
  inReviewCount: number;
  changesRequestedCount: number;
  createdAt: string;
  updatedAt: string;
};

export const packApi = {
  list: (wsId: string, nicheId: string) =>
    api.get<PackSummary[]>(`/workspaces/${wsId}/niches/${nicheId}/packs`),
  get: (wsId: string, packId: string) =>
    api.get<PackSummary & { documents?: unknown[] }>(`/workspaces/${wsId}/packs/${packId}`),
  exports: (wsId: string, packId: string) =>
    api.get<Array<{
      id: string;
      type: string;
      status: string;
      language?: string;
      roleBrief?: string;
      fileSize?: number;
      fileName?: string;
      createdAt: string;
      error?: string;
    }>>(`/workspaces/${wsId}/packs/${packId}/exports`),
};
