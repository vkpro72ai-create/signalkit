import { PRODUCT_PACK_V2_SYSTEM_PROMPT } from './product-pack-v2.system';
import {
  PRODUCT_PACK_V2_DOCUMENT_CONTRACT,
  sectionsForStep,
  type ProductPackV2Step,
} from './product-pack-v2.steps';

export interface ProductPackV2OpportunityInput {
  id?: string;
  title?: string;
  oneLineThesis?: string;
  description?: string;
  market?: string;
  direction?: string;
  subthemes?: string[];
  audience?: string;
  buyerType?: string;
  productFormat?: string | string[];
  riskTolerance?: string;
  language?: string;
  evidenceMode?: string;
  investorLens?: boolean;
  scores?: Record<string, unknown>;
  assumptions?: string[];
  risks?: string[];
  validationQuestions?: string[];
}

export interface ProductPackV2SearchContextInput {
  marketScope?: string;
  locations?: string[];
  directions?: string[];
  subthemes?: string[];
  audiences?: string[];
  buyerType?: string;
  productFormats?: string[];
  riskTolerance?: string;
  mvpTimeline?: string;
  language?: string;
  evidenceMode?: string;
  investorLens?: boolean;
}

export interface ProductPackV2EvidenceInput {
  claims?: Array<{
    claim: string;
    status?: 'source_backed' | 'weak_signal' | 'assumption' | 'unknown';
    sourceTitle?: string;
    sourceUrl?: string;
    confidence?: number;
    notes?: string;
  }>;
  sources?: Array<{
    title: string;
    url?: string;
    date?: string;
    type?: string;
    relevance?: string;
  }>;
  assumptions?: string[];
  contradictions?: string[];
}

export interface BuildProductPackV2PromptInput {
  opportunity: ProductPackV2OpportunityInput;
  searchContext?: ProductPackV2SearchContextInput;
  evidence?: ProductPackV2EvidenceInput;
  outputLanguage?: string;
  founderRequest?: string;
  existingPackNotes?: string;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

/** Merge a step's extra-fields contract (its own `{ ... }` object) with the universal `documents[]` shape. */
function buildStepOutputContract(step: ProductPackV2Step): string {
  const trimmed = step.extraFieldsContract.trim();
  const body = trimmed.length > 2 ? trimmed.slice(1, -1).trim() : '';
  const extra = body ? `,\n${body}` : '';
  return `{
  "documents": [
    ${PRODUCT_PACK_V2_DOCUMENT_CONTRACT}
  ]${extra}
}`;
}

/**
 * Build the prompt for ONE step of the sequential Product Pack V2 pipeline
 * (see product-pack-v2.steps.ts for why this replaced a single 39-section
 * mega-call). Steps run in order, never in parallel, and each one is told
 * what earlier steps already decided via `priorSummary` so the pack stays
 * coherent without re-sending the full prior JSON (which would balloon
 * tokens right back up).
 */
export function buildProductPackV2StepPrompt(
  step: ProductPackV2Step,
  input: BuildProductPackV2PromptInput,
  priorSummary: string,
): { system: string; user: string } {
  const outputLanguage =
    input.outputLanguage ||
    input.searchContext?.language ||
    input.opportunity.language ||
    'en';

  const user = `
Build ONE step of a SignalKit Build-Ready Product Pack: "${step.title}".
This pack is generated step by step across several calls. Produce ONLY the sections and fields listed for THIS step — do not attempt the rest of the pack, and do not repeat sections from other steps.

OUTPUT LANGUAGE:
${outputLanguage} (this is only the language to write in — it says nothing about the target market or audience nationality; do not narrow the market based on it).

FOUNDER RAW REQUEST:
${input.founderRequest || 'No raw founder request provided. Use the opportunity and search context.'}

OPPORTUNITY:
${stableJson(input.opportunity)}

OPPORTUNITY SEARCH CONTEXT:
${stableJson(input.searchContext)}

EVIDENCE / SOURCES / ASSUMPTIONS:
${stableJson(input.evidence)}

EXISTING PACK NOTES:
${input.existingPackNotes || 'None'}

${
  priorSummary
    ? `PRIOR LAYERS (already decided in earlier steps of this same pack — stay consistent with them; do not contradict, shrink, or silently repeat them):\n${priorSummary}`
    : 'This is the first step of this pack — nothing has been decided yet.'
}

CRITICAL NON-DESTRUCTIVE INSTRUCTIONS (apply across the whole pack, not just this step):
1. Do not reduce this idea to MVP first.
2. Do not shrink the founder's ambition before expanding it.
3. Do not replace useful execution/build documents with only high-level strategy.
4. Use MVP Scope only as one execution/build section, not as the main product answer.
${step.layerInstructions}

SECTIONS TO PRODUCE IN THIS STEP (produce exactly one document per section below, no more, no fewer):
${stableJson(sectionsForStep(step))}

QUALITY AND NAMING:
1. Never call this a Preview. It is part of a Build-Ready Product Pack.
2. Every document must include whatThisIs, whyItExists, howToUse, connections, doneDefinition.
3. Do not output generic bullet-point startup docs.
4. Do not output only short bullet lines.
5. Make every section readable and useful to someone with zero prior context.

Return JSON only, no markdown fences, no commentary, in exactly this shape:
${buildStepOutputContract(step)}
`;

  return {
    system: PRODUCT_PACK_V2_SYSTEM_PROMPT,
    user,
  };
}

export const PRODUCT_PACK_V2_JSON_REPAIR_SYSTEM_PROMPT = `
You repair invalid JSON for one step of a SignalKit Product Pack generation pipeline.

Return valid JSON only.
Do not add markdown.
Do not add commentary.
Do not remove required fields.
Do not downgrade the pack into MVP-first output.
If content is truncated, preserve what is available and mark missing parts by leaving the rest of the array/object empty rather than inventing content.
`;

export function buildProductPackV2StepRepairPrompt(
  step: ProductPackV2Step,
  rawOutput: string,
): { system: string; user: string } {
  return {
    system: PRODUCT_PACK_V2_JSON_REPAIR_SYSTEM_PROMPT,
    user: `
Repair this invalid JSON for the "${step.title}" step of a SignalKit Build-Ready Product Pack so it matches the required contract.

REQUIRED CONTRACT FOR THIS STEP:
${buildStepOutputContract(step)}

REQUIRED SECTION DEFINITIONS FOR THIS STEP:
${stableJson(sectionsForStep(step))}

RAW OUTPUT:
${rawOutput.slice(0, 120000)}
`,
  };
}