/**
 * Generation contract — the envelope every AI generation must carry.
 *
 * No feature module calls a provider directly; it builds a GenerationRequest and
 * hands it to the LLMRouter. The contract makes language, market, evidence and
 * claims policy explicit on every call (an engineering & product law).
 */
import type {
  CountryCode,
  DocumentType,
  LLMProviderType,
  LLMTaskType,
  LocaleCode,
  ProductPackDepth,
  RegionCode,
  VerticalTemplate,
} from '@signalkit/shared';
import type { LLMMessage } from './index.js';

/** How strongly a task must be grounded in evidence. */
export type EvidenceRequirement = 'none' | 'preferred' | 'required';

/** What to do with claims that lack supporting evidence. */
export type UnsupportedClaimsPolicy = 'forbid' | 'mark_as_assumption';

export interface GenerationContract {
  interfaceLanguage: LocaleCode;
  outputLanguage: LocaleCode;
  marketLanguage: LocaleCode;
  targetCountry: CountryCode | null;
  targetRegion: RegionCode | null;
  evidenceRequirement: EvidenceRequirement;
  /** Unsupported claims must be surfaced as assumptions, never asserted. */
  unsupportedClaimsPolicy: UnsupportedClaimsPolicy;
  documentType?: DocumentType;
  packDepth?: ProductPackDepth;
  verticalTemplate?: VerticalTemplate;
  /** Required markdown section headings (for document tasks). */
  requiredSections?: string[];
}

/** A unit of work for the router. */
export interface GenerationRequest {
  taskType: LLMTaskType;
  workspaceId: string;
  userId?: string | null;
  projectId?: string | null;
  packId?: string | null;
  documentId?: string | null;
  contract: GenerationContract;
  messages: LLMMessage[];
  /** Force JSON output regardless of the routing rule default. */
  jsonMode?: boolean;
  /** Override the rough output-token budget used for the cost estimate. */
  estimatedOutputTokens?: number;
  /** Override the router/model timeout for this request. */
  timeoutMs?: number;
}

export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationOutcome {
  ok: boolean;
  issues: ValidationIssue[];
}

/** Result returned by the router after a successful (possibly retried) run. */
export interface GenerationResult {
  content: string;
  taskType: LLMTaskType;
  modelId: string;
  provider: LLMProviderType;
  usedFallback: boolean;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCost: number;
  validation: ValidationOutcome;
}

/** Make a default contract from a locale; callers refine per task. */
export function baseContract(language: LocaleCode): GenerationContract {
  return {
    interfaceLanguage: language,
    outputLanguage: language,
    marketLanguage: language,
    targetCountry: null,
    targetRegion: null,
    evidenceRequirement: 'preferred',
    unsupportedClaimsPolicy: 'mark_as_assumption',
  };
}
