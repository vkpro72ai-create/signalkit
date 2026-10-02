/** Retry and fallback policies for the router. */
import type { LLMError, LLMErrorKind } from './index.js';

export interface RetryPolicy {
  readonly maxRetries: number;
  shouldRetry(error: LLMError, attempt: number): boolean;
  delayMs(attempt: number): number;
}

/** Exponential backoff for transient errors only. */
export class ExponentialRetryPolicy implements RetryPolicy {
  constructor(
    readonly maxRetries = 2,
    private readonly baseDelayMs = 250,
  ) {}

  shouldRetry(error: LLMError, attempt: number): boolean {
    return error.retryable && attempt < this.maxRetries;
  }

  delayMs(attempt: number): number {
    return this.baseDelayMs * 2 ** attempt;
  }
}

/**
 * Error kinds for which switching to the fallback model may help. `auth` is
 * included so a provider with a missing/invalid key falls back to another
 * provider that may have a valid connection. `invalid_request` is excluded — a
 * bad prompt fails the same way on any model.
 */
const FALLBACK_KINDS: ReadonlySet<LLMErrorKind> = new Set<LLMErrorKind>([
  'rate_limit',
  'server',
  'timeout',
  'network',
  'context_length',
  'auth',
]);

export interface FallbackPolicy {
  shouldFallback(error: LLMError): boolean;
}

export class DefaultFallbackPolicy implements FallbackPolicy {
  shouldFallback(error: LLMError): boolean {
    return FALLBACK_KINDS.has(error.kind);
  }
}

/** Thrown when a pre-flight cost estimate exceeds the rule's max cost. */
export class CostLimitError extends Error {
  constructor(
    public readonly estimatedCost: number,
    public readonly maxCost: number,
  ) {
    super(`Estimated cost ${estimatedCost} exceeds limit ${maxCost}`);
    this.name = 'CostLimitError';
  }
}
