/**
 * Minimal typed API client for the web app. Reads the bearer token saved at
 * login. Server stays the single source of truth; this never imports server-only
 * packages (e.g. @signalkit/llm pulls node:crypto and must not reach the browser).
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL?.trim() || '';

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('signalkit_token') : null;
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * No token, or the API rejected it (expired/invalid) — every page's fetch
 * would otherwise show a generic "something went wrong". Send the user to
 * sign in instead, once per navigation.
 */
function redirectToLogin() {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/login') return;
  window.location.href = '/login';
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error('http_401');
  }
  if (!res.ok) throw new Error(`http_${res.status}`);
  return (await res.json()) as T;
}

async function apiSend<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error('http_401');
  }
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
  user: { id: string; email: string; displayName: string | null };
  memberships: { workspace: { id: string; name: string }; role: string; billingPlan: string }[];
  settings: {
    countryOfResidence: string | null;
    geoConsentStatus: string;
    detectedCountry: string | null;
    interfaceLocale?: string;
    defaultDocumentLanguage?: string;
    fallbackLanguage?: string;
  } | null;
}

export async function firstWorkspaceId(): Promise<string | null> {
  const me = await apiGet<MeWorkspaces>('/me');
  return me.memberships[0]?.workspace.id ?? null;
}

// ── Workspace / project bootstrap ────────────────────────────────────────────

export interface ProjectView {
  id: string;
  name: string;
  goal: string;
  status: string;
  marketScope: string;
  targetCountry: string | null;
  createdAt: string;
}

export const workspaceApi = {
  create: (name: string) =>
    apiPost<{ id: string; name: string }>('/workspaces', {
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    }),
  listProjects: (workspaceId: string) => apiGet<ProjectView[]>(`/workspaces/${workspaceId}/projects`),
  createProject: (workspaceId: string, name: string, goal?: string) =>
    apiPost<ProjectView>(`/workspaces/${workspaceId}/projects`, { name, goal, marketScope: 'global' }),
};

export interface NicheSummary {
  id: string;
  projectId: string;
  title: string;
  oneLiner: string;
  riskLevel: string;
  scores: { totalScore: number; confidenceLevel: string; confidenceValue: number }[];
}

/** Opportunity card shape — workspace-wide, evidence-backed, no fabricated fields. */
export interface OpportunityCard {
  id: string;
  name: string;
  oneLiner: string;
  riskLevel: string;
  projectId: string;
  targetMarket: string | null;
  evidenceCount: number;
  opportunityScore: number;
  confidence: { level: string; value: number };
  ventureScaleScore: number | null;
  buildReadinessScore: number | null;
}

export interface AiRunMetadata {
  provider: string;
  model: string;
  task: string;
  status: string;
  durationMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCost?: number | null;
  generatedAt: string;
  usageLogId?: string | null;
  mode?: string | null;
}

export interface GeneratedOpportunityCard extends OpportunityCard {
  assumptions?: string[];
  risks?: string[];
  validationQuestions?: string[];
  generationMetadata?: AiRunMetadata | null;
}

export interface DiscoverOpportunitiesInput {
  market?: string;
  marketScope?: string;
  locations?: string[];
  directions?: string[];
  subthemes?: string[];
  audiences?: string[];
  buyerType?: 'consumer' | 'smb' | 'enterprise' | 'agency' | 'government' | 'mixed';
  productFormats?: string[];
  riskTolerance?: 'low' | 'medium' | 'high';
  mvpTimeline?: '2_weeks' | '6_weeks' | '3_months';
  evidenceMode?: 'starter_hypothesis' | 'source_backed' | 'deep_research';
  investorLens?: boolean;
  verticals?: string[];
  language?: string;
  role?: string;
  mode?: 'find_opportunities';
}

export interface DiscoverOpportunitiesResult {
  niches: number;
  opportunities: GeneratedOpportunityCard[];
  generation: AiRunMetadata;
}

export const opportunityApi = {
  list: (workspaceId: string, projectId: string) =>
    apiGet<NicheSummary[]>(`/workspaces/${workspaceId}/projects/${projectId}/niches`),
  listAll: (workspaceId: string) => apiGet<OpportunityCard[]>(`/workspaces/${workspaceId}/niches`),
  discover: (workspaceId: string, projectId: string, body?: DiscoverOpportunitiesInput) =>
    apiPost<DiscoverOpportunitiesResult>(`/workspaces/${workspaceId}/projects/${projectId}/discover-niches`, body ?? {}),
  createFromIdea: (workspaceId: string, projectId: string, body: {
    founderIdea: string;
    targetMarket?: string;
    targetAudience?: string;
    productFormat?: string;
    outputLanguage?: 'ru' | 'en' | string;
    executionMode?: 'team_studio' | 'ai_agent_bundle' | 'both';
    evidenceMode?: 'starter_hypothesis' | 'source_backed' | 'deep_research';
    riskTolerance?: 'low' | 'medium' | 'high';
    notes?: string;
  }) =>
    apiPost<GeneratedOpportunityCard>(`/workspaces/${workspaceId}/projects/${projectId}/niches/from-idea`, body),
};

export interface PackListItem {
  id: string;
  title: string;
  depth: string;
  status: string;
  documents: { id: string }[];
  qualityGate: { status: string } | null;
}

export const packListApi = {
  listForNiche: (workspaceId: string, nicheId: string) =>
    apiGet<PackListItem[]>(`/workspaces/${workspaceId}/niches/${nicheId}/packs`),
};

// ── LLM connections (AI Engine) ──────────────────────────────────────────────

export interface LlmConnectionView {
  id: string;
  workspaceId: string;
  userId: string | null;
  provider: string;
  label: string;
  maskedKey: string;
  baseUrl: string | null;
  status: string;
  createdAt: string;
}

export interface LlmSettingsView {
  id: string;
  workspaceId: string;
  mode: 'byok' | 'platform';
  defaultModelId: string | null;
  fallbackModelId: string | null;
}

export interface LlmSmokeResult {
  ok: boolean;
  provider?: string;
  modelId?: string;
  task?: string;
  text?: string;
  usageLogged?: boolean;
  latencyMs?: number;
  latency?: number;
  inputTokens?: number;
  outputTokens?: number;
  tokens?: { inputTokens: number; outputTokens: number };
  estimatedCost?: number;
  code?: string;
  message?: string;
}

export interface UsageSummary {
  recent: Array<{
    id: string;
    provider: string;
    model: string;
    taskType: string;
    estimatedCost: number;
    latencyMs: number;
    status: string;
    errorCode: string | null;
    createdAt: string;
  }>;
  totals: { _count: number; _sum: { estimatedCost: number | null; inputTokens: number | null; outputTokens?: number | null } };
  byProvider: Array<{ provider?: string; _count: number; _sum: { estimatedCost: number | null } }>;
  byModel: Array<{ model?: string; _count: number; _sum: { estimatedCost: number | null } }>;
  byTask: Array<{ taskType?: string; _count: number; _sum: { estimatedCost: number | null } }>;
  failures: number;
  mostExpensive: Array<{ id: string; model: string; taskType: string; estimatedCost: number }>;
}

export const llmApi = {
  connections: (workspaceId: string) => apiGet<LlmConnectionView[]>(`/llm/connections?workspaceId=${workspaceId}`),
  models: () => apiGet<CatalogModelView[]>('/llm/models'),
  refreshModels: (workspaceId?: string) =>
    apiPost<{ refreshed: number; byProvider: Record<string, number>; failures: Record<string, string>; message: string }>(
      workspaceId ? `/llm/models/refresh?workspaceId=${encodeURIComponent(workspaceId)}` : '/llm/models/refresh',
    ),
  providers: () => apiGet<ProviderView[]>('/llm/providers'),
  connect: (input: { workspaceId: string; provider: string; apiKey: string; label: string; baseUrl?: string; defaultModelId?: string }) =>
    apiPost<LlmConnectionView>('/llm/providers/connect', input),
  testStored: (id: string, workspaceId: string) =>
    apiPost<{ ok: boolean; message?: string }>(`/llm/connections/${id}/test?workspaceId=${workspaceId}`),
  remove: (id: string, workspaceId: string) => apiDelete(`/llm/connections/${id}?workspaceId=${workspaceId}`),
  settings: (workspaceId: string) => apiGet<LlmSettingsView>(`/llm/settings?workspaceId=${workspaceId}`),
  updateSettings: (input: { workspaceId: string; mode?: 'byok' | 'platform'; defaultModelId?: string; fallbackModelId?: string }) =>
    apiPut<LlmSettingsView>('/llm/settings', input),
  smoke: (input: { workspaceId: string; prompt?: string }) => apiPost<LlmSmokeResult>('/llm/smoke', input),
  usage: (workspaceId: string) => apiGet<UsageSummary>(`/llm/usage?workspaceId=${workspaceId}`),
};

// ── Account / entitlements ────────────────────────────────────────────────────

export interface EntitlementsView {
  plan: string;
  isPro: boolean;
  canExportPDF: boolean;
  canExportBundle: boolean;
  canExportMarkdown: boolean;
  canFullPack: boolean;
  canBuildBlueprint: boolean;
  canVentureThesis: boolean;
  canMultiMarket: boolean;
  canAdvancedBlueprintDetails: boolean;
  canDiscovery: boolean;
  canCreateWorkspace: boolean;
  canCreateProject: boolean;
}

export const accountApi = {
  entitlements: () => apiGet<EntitlementsView>('/me/entitlements'),
};

export const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
  mistral: 'Mistral',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
  openai_compatible: 'Custom OpenAI-compatible',
  custom: 'Custom',
};

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
