/**
 * Output validators. The router runs these after generation: JSON validity,
 * required markdown sections, non-empty output, output language, and the
 * unsupported-claims policy. Issues are surfaced (never silently swallowed).
 */
import { franc } from 'franc-min';
import { LOCALE_TO_ISO6393, type LocaleCode } from '@signalkit/shared';
import type { GenerationContract, ValidationIssue, ValidationOutcome } from './contract.js';

const ISO6393_TO_LOCALE: Partial<Record<string, LocaleCode>> = Object.fromEntries(
  Object.entries(LOCALE_TO_ISO6393).map(([locale, iso]) => [iso, locale as LocaleCode]),
);

/**
 * Detect the dominant language of a piece of text using `franc-min` (ISO
 * 639-3 detector), mapped back to our LocaleCode. Returns `null` when the
 * text is too short/ambiguous to call (never guess on thin evidence).
 */
export function detectLocale(text: string): LocaleCode | null {
  const trimmed = text.trim();
  if (trimmed.length < 40) return null;
  const iso = franc(trimmed, { minLength: 40 });
  if (iso === 'und') return null;
  return ISO6393_TO_LOCALE[iso] ?? null;
}

/** True when `text` is confidently in a known language other than `expected`. */
export function looksLikeWrongLanguage(text: string, expected: LocaleCode): boolean {
  const detected = detectLocale(text);
  return detected !== null && detected !== expected;
}

const OVERCONFIDENT = /\b(guaranteed|definitely|always works|proven fact|certainly will|100%)\b/i;
const GROUNDING_MARKERS = /\b(assumption|assume|evidence|source|unverified|hypothesis)\b/i;

export function validateNonEmpty(content: string): ValidationIssue | null {
  return content.trim().length === 0
    ? { code: 'empty_output', message: 'Generated output is empty', severity: 'error' }
    : null;
}

export function validateJson(content: string): ValidationIssue | null {
  try {
    JSON.parse(content);
    return null;
  } catch {
    return { code: 'invalid_json', message: 'Output is not valid JSON', severity: 'error' };
  }
}

export function validateRequiredSections(content: string, sections: string[]): ValidationIssue[] {
  const lower = content.toLowerCase();
  return sections
    .filter((s) => !lower.includes(s.toLowerCase()))
    .map((s) => ({ code: 'missing_section', message: `Missing required section: ${s}`, severity: 'error' as const }));
}

export function validateOutputLanguage(content: string, locale: LocaleCode): ValidationIssue | null {
  if (looksLikeWrongLanguage(content, locale)) {
    return {
      code: 'output_language_mismatch',
      message: `Output does not appear to be in ${locale}`,
      severity: 'error',
    };
  }
  return null;
}

/**
 * When evidence is required, unsupported absolute claims must be marked as
 * assumptions. Flags overconfident language that lacks any grounding marker.
 */
export function validateUnsupportedClaims(
  content: string,
  contract: GenerationContract,
): ValidationIssue | null {
  if (contract.evidenceRequirement !== 'required') return null;
  if (OVERCONFIDENT.test(content) && !GROUNDING_MARKERS.test(content)) {
    return {
      code: 'unsupported_claims',
      message: 'Overconfident claims without evidence/assumption markers',
      severity: contract.unsupportedClaimsPolicy === 'forbid' ? 'error' : 'warning',
    };
  }
  return null;
}

/** Run the applicable validators and produce a single outcome. */
export function validateOutput(
  content: string,
  options: { contract: GenerationContract; jsonRequired: boolean },
): ValidationOutcome {
  const issues: ValidationIssue[] = [];
  const empty = validateNonEmpty(content);
  if (empty) issues.push(empty);

  // No point running content checks on empty output.
  if (!empty) {
    if (options.jsonRequired) {
      const json = validateJson(content);
      if (json) issues.push(json);
    }
    if (options.contract.requiredSections?.length) {
      issues.push(...validateRequiredSections(content, options.contract.requiredSections));
    }
    const lang = validateOutputLanguage(content, options.contract.outputLanguage);
    if (lang) issues.push(lang);
    const claims = validateUnsupportedClaims(content, options.contract);
    if (claims) issues.push(claims);
  }

  return { ok: !issues.some((i) => i.severity === 'error'), issues };
}
