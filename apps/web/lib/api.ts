/**
 * Minimal typed API client for the web app. Reads the bearer token saved at
 * login. Server stays the single source of truth; this never imports server-only
 * packages (e.g. @signalkit/llm pulls node:crypto and must not reach the browser).
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('signalkit_token') : null;
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return (await res.json()) as T;
}

async function apiSend<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      const data = (await res.json()) as { code?: string };
      if (data.code) code = data.code;
    } catch {
      /* ignore */
    }
    throw new Error(code);
  }
  return (await res.json()) as T;
}

export const apiPost = <T>(path: string, body?: unknown) => apiSend<T>('POST', path, body);
export const apiPut = <T>(path: string, body?: unknown) => apiSend<T>('PUT', path, body);
export const apiDelete = <T>(path: string) => apiSend<T>('DELETE', path);

export interface CountryView {
  code: string;
  primaryLanguage: string;
  names: Record<string, string>;
}
export interface MeWorkspaces {
  memberships: { workspace: { id: string; name: string } }[];
  settings: {
    countryOfResidence: string | null;
    geoConsentStatus: string;
    detectedCountry: string | null;
  } | null;
}

export async function firstWorkspaceId(): Promise<string | null> {
  const me = await apiGet<MeWorkspaces>('/me');
  return me.memberships[0]?.workspace.id ?? null;
}

/** Catalog model shape returned by GET /llm/models (subset used by the UI). */
export interface CatalogModelView {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  contextWindow: number;
  inputTokenPrice: number;
  outputTokenPrice: number;
  currency: string;
  pricingSource: string | null;
  ratingOverall: number | null;
  speedRating: number | null;
  privacyRating: number | null;
  strengths: string[];
  weaknesses: string[];
  bestUseCases: string[];
  supportedLanguages: string[];
}

export interface ProviderView {
  type: string;
  displayName: string;
  defaultBaseUrl: string | null;
  requiresBaseUrl: boolean;
}

/** Browser-side pack-cost estimate (mirrors @signalkit/llm; kept node-free). */
const PACK_TOKENS: Record<string, { input: number; output: number }> = {
  quick_opportunity: { input: 8_000, output: 6_000 },
  build_ready: { input: 40_000, output: 60_000 },
  investor_grade: { input: 30_000, output: 42_000 },
  agency_client: { input: 35_000, output: 48_000 },
  ai_agent_engineering: { input: 45_000, output: 72_000 },
};

export function estimatePackCostUsd(
  model: Pick<CatalogModelView, 'inputTokenPrice' | 'outputTokenPrice'>,
  depth: keyof typeof PACK_TOKENS,
): number {
  const b = PACK_TOKENS[depth]!;
  return (b.input / 1e6) * model.inputTokenPrice + (b.output / 1e6) * model.outputTokenPrice;
}

export const PACK_DEPTHS = Object.keys(PACK_TOKENS) as (keyof typeof PACK_TOKENS)[];

// ── Export Center API ─────────────────────────────────────────────────────────

export interface ExportJobView {
  id: string;
  packId: string;
  workspaceId: string;
  type: string;
  language: string;
  roleBrief: string | null;
  applyBranding: boolean;
  status: 'queued' | 'processing' | 'ready' | 'failed' | 'expired';
  errorCode: string | null;
  retries: number;
  createdAt: string;
  updatedAt: string;
  artifact: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    checksum: string;
  } | null;
}

export interface CreateExportInput {
  type: string;
  language?: string;
  roleBrief?: string | null;
  applyBranding?: boolean;
}

export const EXPORT_TYPES = [
  { id: 'full_pdf_pack', label: 'Full Product Pack PDF', format: 'pdf', category: 'pdf' },
  { id: 'founder_summary_pdf', label: 'Founder Summary PDF', format: 'pdf', category: 'pdf' },
  { id: 'investor_memo_pdf', label: 'Investor Memo PDF', format: 'pdf', category: 'pdf' },
  { id: 'roadmap_pdf', label: 'Roadmap PDF', format: 'pdf', category: 'pdf' },
  { id: 'client_agency_export', label: 'Client-Ready Agency Export', format: 'pdf', category: 'pdf' },
  { id: 'markdown_zip', label: 'Markdown ZIP', format: 'zip', category: 'bundle' },
  { id: 'ai_agent_engineering_bundle', label: 'AI-Agent Engineering Bundle', format: 'zip', category: 'bundle' },
  { id: 'json_bundle', label: 'JSON Bundle', format: 'zip', category: 'bundle' },
  { id: 'pm_brief', label: 'PM Brief', format: 'md', category: 'brief' },
  { id: 'designer_brd', label: 'Designer BRD', format: 'md', category: 'brief' },
  { id: 'frontend_brd', label: 'Frontend BRD', format: 'md', category: 'brief' },
  { id: 'backend_brd', label: 'Backend BRD', format: 'md', category: 'brief' },
  { id: 'growth_brief', label: 'Growth Brief', format: 'md', category: 'brief' },
  { id: 'sales_brief', label: 'Sales Brief', format: 'md', category: 'brief' },
  { id: 'evidence_appendix', label: 'Evidence Appendix', format: 'md', category: 'evidence' },
  { id: 'source_appendix', label: 'Source Appendix', format: 'md', category: 'evidence' },
] as const;

export const ROLE_BRIEF_TYPES = [
  { id: 'founder', label: 'Founder' },
  { id: 'pm', label: 'Product Manager' },
  { id: 'designer', label: 'Designer' },
  { id: 'frontend', label: 'Frontend Dev' },
  { id: 'backend', label: 'Backend Dev' },
  { id: 'growth', label: 'Growth / Marketing' },
  { id: 'sales', label: 'Sales' },
  { id: 'investor', label: 'Investor' },
  { id: 'ai_agent', label: 'AI Coding Agent' },
] as const;

export type ExportTypeId = typeof EXPORT_TYPES[number]['id'];
export type RoleBriefId = typeof ROLE_BRIEF_TYPES[number]['id'];
