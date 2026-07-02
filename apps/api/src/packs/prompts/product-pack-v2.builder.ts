import { PRODUCT_PACK_V2_SECTIONS } from './product-pack-v2.sections';
import {
  PRODUCT_PACK_V2_OUTPUT_CONTRACT,
  PRODUCT_PACK_V2_SYSTEM_PROMPT,
} from './product-pack-v2.system';

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

function sectionsByLayer(): Record<string, string[]> {
  return PRODUCT_PACK_V2_SECTIONS.reduce<Record<string, string[]>>(
    (acc, section) => {
      acc[section.layer] ||= [];
      acc[section.layer].push(`${section.key}: ${section.title}`);
      return acc;
    },
    {},
  );
}

export function buildProductPackV2Prompt(input: BuildProductPackV2PromptInput): {
  system: string;
  user: string;
} {
  const outputLanguage =
    input.outputLanguage ||
    input.searchContext?.language ||
    input.opportunity.language ||
    'en';

  const user = `
Build a complete SignalKit Build-Ready Product Pack.

OUTPUT LANGUAGE:
${outputLanguage}

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

MANDATORY PRODUCT PACK SECTIONS:
${stableJson(PRODUCT_PACK_V2_SECTIONS)}

MANDATORY SECTION LAYERS:
${stableJson(sectionsByLayer())}

CRITICAL NON-DESTRUCTIVE INSTRUCTIONS:
1. Do not reduce this idea to MVP first.
2. Do not shrink the founder's ambition before expanding it.
3. Do not replace useful execution/build documents with only high-level strategy.
4. Preserve and enrich execution documents such as Product Vision, Market Context, ICP, JTBD, UX Flow, Screen Map, Designer Pack, Frontend Pack, Backend Pack, Data Model, API Requirements, AI Agent Pack, QA Pack, Growth Pack, Execution Phasing, and Team Handoff.
5. Add the missing venture-grade upper layer before build/execution: Founder & Investor Vision, Category & Market Strategy, Competitive Attack & Switching Strategy, Strategic Product Paths, Product Ecosystem Vision, Largest Upside Scenario, Hidden Opportunities & Underrated Features, and Expansion Paths.
6. Use MVP Scope only as one execution/build section, not as the main product answer.
7. Build the pack in layers: Vision, Build, Execution, Evidence.

VISION LAYER INSTRUCTIONS:
1. First expand and strengthen the full vision.
2. Find hidden opportunities inside the idea.
3. Find underrated features.
4. Find competitor gaps and switching opportunities.
5. Generate multiple possible product paths.
6. Recommend a strategic path, but explain alternatives.
7. Explain the largest upside scenario without fabricating TAM, revenue, clinical proof, laws, or sources.
8. Explain category creation or category attack potential.

BUILD LAYER INSTRUCTIONS:
1. Make the pack understandable to a cold reader.
2. Create separate useful packages for founder/investor, designer, frontend, backend, AI engineer, QA, growth, and legal/privacy.
3. Include screen storyboard and navigation/information architecture.
4. Include UX flow and screen map.
5. Include data model and API contracts.
6. Include AI agent behavior rules, memory rules, forbidden outputs, and evaluation rules.
7. Include acceptance criteria and QA scenarios.
8. Include privacy/trust boundaries.

EXECUTION LAYER INSTRUCTIONS:
1. Include phases only as execution planning, not as a way to shrink the idea.
2. Include Team & AI-Agent Handoff.
3. Include a Qira-ready Backlog Draft, but do not assume or call any Qira API.
4. Include an AI Agent Prompt Bundle Draft with self-contained prompts.
5. Each AI-agent prompt must work without previous chat context.
6. Every AI-agent prompt must include: Context, Scope, Open only, Do not, Task, Acceptance, Tests, Final report.
7. If exact files are unknown, say: inspect only the smallest relevant files first.

EVIDENCE LAYER INSTRUCTIONS:
1. Include risks, assumptions, evidence needs, and claims that must not be made yet.
2. Do not invent TAM/revenue/statistics/sources.
3. If sources are missing, mark the pack as strategic starter / starter hypothesis for evidence.
4. If a claim lacks evidence, mark it as assumption, source needed, or research question.
5. If text would say "according to reports/agencies/data", it must have evidenceRefs. Otherwise rewrite as an assumption or source need.
6. Missing sources should not make the whole pack structurally failed if the documents are complete. Use evidenceGate = "weak" or "starter_hypothesis".

QUALITY AND NAMING:
1. Never call this a Preview. It is a Build-Ready Product Pack.
2. Every document must include whatThisIs, whyItExists, howToUse, connections, doneDefinition.
3. Do not output generic bullet-point startup docs.
4. Do not output only short bullet lines.
5. Make every section readable and useful to someone with zero prior context.

${PRODUCT_PACK_V2_OUTPUT_CONTRACT}
`;

  return {
    system: PRODUCT_PACK_V2_SYSTEM_PROMPT,
    user,
  };
}

export const PRODUCT_PACK_V2_JSON_REPAIR_SYSTEM_PROMPT = `
You repair invalid JSON for SignalKit Product Pack generation.

Return valid JSON only.
Do not add markdown.
Do not add commentary.
Do not remove required fields.
Do not downgrade the pack into MVP-first output.
Do not remove Vision Layer, Build Layer, Execution Layer, or Evidence Layer.
If content is truncated, preserve what is available and mark missing parts in quality.missingInputs.
`;

export function buildProductPackV2RepairPrompt(rawOutput: string): {
  system: string;
  user: string;
} {
  return {
    system: PRODUCT_PACK_V2_JSON_REPAIR_SYSTEM_PROMPT,
    user: `
Repair this invalid Product Pack JSON so it matches the required contract.

REQUIRED CONTRACT:
${PRODUCT_PACK_V2_OUTPUT_CONTRACT}

REQUIRED SECTION DEFINITIONS:
${stableJson(PRODUCT_PACK_V2_SECTIONS)}

RAW OUTPUT:
${rawOutput.slice(0, 120000)}
`,
  };
}