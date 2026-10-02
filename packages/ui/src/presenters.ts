/**
 * Framework-agnostic semantic presenters.
 *
 * These map domain values (score, risk, confidence, document status, model cost)
 * to design-system tokens. Web (DOM) and mobile (React Native) both consume these
 * so the visual meaning of a badge is identical across platforms — one source of
 * truth, no duplicated UI logic. Rendering primitives differ per platform; the
 * meaning does not.
 */
import type { ConfidenceLevel, DocumentStatus, RiskLevel } from '@signalkit/shared';
import { semanticColorsLight, semanticColorsDark, type SemanticColor, type FlatColor } from './tokens.js';

export type ThemeMode = 'light' | 'dark';

/** Resolve a semantic color's flat palette for the given theme. */
export function colorFor(variant: SemanticColor, mode: ThemeMode = 'light'): FlatColor {
  return (mode === 'dark' ? semanticColorsDark : semanticColorsLight)[variant];
}

/** 0–100 opportunity score → semantic variant + coarse band label key. */
export function scoreVariant(score: number): { variant: SemanticColor; bandKey: string } {
  const s = clamp(score, 0, 100);
  if (s >= 75) return { variant: 'opportunity', bandKey: 'score.band.strong' };
  if (s >= 50) return { variant: 'confidence', bandKey: 'score.band.moderate' };
  if (s >= 25) return { variant: 'warning', bandKey: 'score.band.weak' };
  return { variant: 'muted', bandKey: 'score.band.low' };
}

/** Risk level → semantic variant. Lower risk reads as success. */
export function riskVariant(level: RiskLevel): SemanticColor {
  switch (level) {
    case 'low':
      return 'success';
    case 'medium':
      return 'warning';
    case 'high':
      return 'risk';
  }
}

/** Confidence band → semantic variant. */
export function confidenceVariant(level: ConfidenceLevel): SemanticColor {
  switch (level) {
    case 'very_low':
    case 'low':
      return 'risk';
    case 'medium':
      return 'warning';
    case 'high':
    case 'very_high':
      return 'confidence';
  }
}

/** Document/pack status → semantic variant for status pills. */
export function documentStatusVariant(status: DocumentStatus): SemanticColor {
  switch (status) {
    case 'approved':
    case 'locked':
      return 'ready';
    case 'in_review':
    case 'changes_requested':
      return 'warning';
    case 'failed':
      return 'failed';
    case 'generating':
      return 'evidence';
    case 'draft':
    case 'empty':
    case 'archived':
      return 'draft';
  }
}

/**
 * Estimated cost (in USD) → semantic variant: cheap reads neutral, expensive
 * reads as a warning so users notice before committing to a generation.
 */
export function costVariant(estimatedCostUsd: number): SemanticColor {
  if (estimatedCostUsd >= 5) return 'risk';
  if (estimatedCostUsd >= 1) return 'warning';
  return 'muted';
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
