/**
 * Mobile API client. All calls go through the backend NestJS API (port 4000).
 *
 * Base URL: EXPO_PUBLIC_API_URL — set by apk-debug.js in .env.local (auto LAN-IP),
 *           or manually in .env. Default: http://10.0.2.2:4000 (Android emulator).
 *
 * For physical device: apk-debug.js detects the host machine LAN IP automatically.
 * If connecting manually, set EXPO_PUBLIC_API_URL=http://<your-machine-ip>:4000
 */

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000').replace(/\/$/, '');

const TIMEOUT_MS = 15_000;

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
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...extraHeaders,
  };
  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ApiException(
        0,
        `Request timed out after ${TIMEOUT_MS / 1000}s reaching ${BASE}. Is the API server running?`,
      );
    }
    // Distinguish common causes for the developer
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes('cleartext') || msg.toLowerCase().includes('ssl')) {
      throw new ApiException(
        0,
        `Cleartext HTTP blocked by Android. URL: ${BASE}. Enable usesCleartextTraffic in app.config.ts or use HTTPS.`,
      );
    }
    throw new ApiException(
      0,
      `Cannot reach API at ${BASE}. Check:\n• Wi-Fi on device\n• API server running (port 4000)\n• Correct LAN IP in EXPO_PUBLIC_API_URL\n\nError: ${msg}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiException(res.status, `Non-JSON response from ${url} (HTTP ${res.status})`);
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
  displayName?: string;
  /** Backend billingPlan from first workspace (free | founder_pro | agency | studio | enterprise). */
  billingPlan: string;
  workspaces: Array<{ id: string; name: string; role: string; billingPlan: string }>;
};

/** Raw shape returned by GET /me on the NestJS backend. */
type MeRaw = {
  user: { id: string; email: string; displayName?: string | null };
  memberships: Array<{
    workspace: { id: string; name: string };
    role: string;
    billingPlan: string;
  }>;
};

export const authApi = {
  login: (email: string, password: string) =>
    api.post<AuthTokens>('/auth/login', { email, password }),

  // Backend RegisterDto expects { email, password, displayName? }
  register: (email: string, password: string, displayName?: string) =>
    api.post<AuthTokens>('/auth/register', { email, password, displayName }),

  me: async (): Promise<MeResponse> => {
    const raw = await api.get<MeRaw>('/me');
    const workspaces = (raw.memberships ?? []).map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      role: m.role,
      billingPlan: m.billingPlan ?? 'free',
    }));
    return {
      id: raw.user.id,
      email: raw.user.email,
      name: raw.user.displayName ?? raw.user.email,
      displayName: raw.user.displayName ?? undefined,
      billingPlan: workspaces[0]?.billingPlan ?? 'free',
      workspaces,
    };
  },
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
