/**
 * Deterministic cost estimation. Used before expensive generations so users see
 * an estimate (and a high-cost warning) before committing. Prices are per 1M
 * tokens; there are no hardcoded "facts" here — callers pass catalog prices that
 * carry their own `pricingSource`/`pricingFetchedAt`.
 */
import type { LLMCostEstimate, LLMTaskType, ProductPackDepth } from '@signalkit/shared';
import type { LLMCostEstimator } from './index.js';

export interface ModelPrice {
  inputTokenPrice: number; // per 1M tokens
  outputTokenPrice: number; // per 1M tokens
  currency: string;
}

/** Threshold (in the model's currency) above which we warn the user. */
export const HIGH_COST_THRESHOLD = 1.0;

/** Compute raw cost for a token usage at given prices. */
export function computeCost(
  inputTokens: number,
  outputTokens: number,
  price: ModelPrice,
): number {
  const cost = (inputTokens / 1_000_000) * price.inputTokenPrice + (outputTokens / 1_000_000) * price.outputTokenPrice;
  return Math.round(cost * 1e6) / 1e6;
}

/** Rough token budgets for a full Product Document Pack, by depth. Estimates. */
export const PACK_TOKEN_ESTIMATES: Record<ProductPackDepth, { input: number; output: number }> = {
  quick_opportunity: { input: 8_000, output: 6_000 },
  build_ready: { input: 40_000, output: 60_000 },
  investor_grade: { input: 30_000, output: 42_000 },
  agency_client: { input: 35_000, output: 48_000 },
  ai_agent_engineering: { input: 45_000, output: 72_000 },
};

/** Estimate the cost of generating a full pack at a given depth with a model. */
export function estimateProductPackCost(
  modelId: string,
  price: ModelPrice,
  depth: ProductPackDepth,
  fallbackModelId: string | null = null,
): LLMCostEstimate {
  const budget = PACK_TOKEN_ESTIMATES[depth];
  const estimatedCost = computeCost(budget.input, budget.output, price);
  return {
    modelId,
    fallbackModelId,
    estimatedInputTokens: budget.input,
    estimatedOutputTokens: budget.output,
    estimatedCost,
    currency: price.currency,
    confidence: 0.6, // token budgets are heuristic
    highCostWarning: estimatedCost >= HIGH_COST_THRESHOLD,
  };
}

/** A cost estimator backed by a catalog price lookup. */
export class CatalogCostEstimator implements LLMCostEstimator {
  constructor(private readonly priceFor: (modelId: string) => ModelPrice | null) {}

  estimate(input: {
    taskType: LLMTaskType;
    modelId: string;
    fallbackModelId: string | null;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
  }): LLMCostEstimate {
    const price = this.priceFor(input.modelId) ?? { inputTokenPrice: 0, outputTokenPrice: 0, currency: 'USD' };
    const estimatedCost = computeCost(input.estimatedInputTokens, input.estimatedOutputTokens, price);
    return {
      modelId: input.modelId,
      fallbackModelId: input.fallbackModelId,
      estimatedInputTokens: input.estimatedInputTokens,
      estimatedOutputTokens: input.estimatedOutputTokens,
      estimatedCost,
      currency: price.currency,
      confidence: 0.7,
      highCostWarning: estimatedCost >= HIGH_COST_THRESHOLD,
    };
  }
}
