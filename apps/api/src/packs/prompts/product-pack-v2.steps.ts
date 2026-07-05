import { PRODUCT_PACK_V2_SECTIONS, type ProductPackV2SectionKey } from './product-pack-v2.sections';

/**
 * Product Pack V2 used to be generated as ONE LLM call returning the entire
 * ~39-section pack as a single JSON object (up to 48,000 output tokens
 * requested). Almost no model reliably returns that much valid JSON in one
 * shot, so generation truncated far more often than it completed — see
 * apps/api/src/packs/pack.service.ts's history for the truncation-detection
 * work that made this failure mode visible instead of silent.
 *
 * This file splits that single call into a sequence of smaller, realistic
 * calls — one per step below, run in order (never in parallel, so each step
 * can be told what earlier steps already decided and stay consistent with
 * it). `build` (23 of the 39 sections) is too much for one call on its own,
 * so it is split into three steps by audience area.
 */

export type ProductPackV2StepId =
  | 'vision'
  | 'build_product'
  | 'build_design'
  | 'build_engineering'
  | 'execution'
  | 'qira_backlog'
  | 'ai_agent_bundle'
  | 'evidence';

export interface ProductPackV2Step {
  id: ProductPackV2StepId;
  title: string;
  sectionKeys: ProductPackV2SectionKey[];
  /** Realistic per-step output budget — the actual fix for truncation, not a bigger single number. */
  maxOutputTokens: number;
  /** Layer-specific reinforcement carried over from the original single-shot prompt. */
  layerInstructions: string;
  /** JSON shape for the extra top-level fields this step owns, beyond the universal `documents[]` array. */
  extraFieldsContract: string;
}

const VISION_INSTRUCTIONS = `
VISION LAYER INSTRUCTIONS:
1. First expand and strengthen the full vision.
2. Find hidden opportunities inside the idea.
3. Find underrated features.
4. Find competitor gaps and switching opportunities.
5. Generate multiple possible product paths.
6. Recommend a strategic path, but explain alternatives.
7. Explain the largest upside scenario without fabricating TAM, revenue, clinical proof, laws, or sources.
8. Explain category creation or category attack potential.`;

const BUILD_INSTRUCTIONS = `
BUILD LAYER INSTRUCTIONS:
1. Make the pack understandable to a cold reader.
2. Create separate useful packages for founder/investor, designer, frontend, backend, AI engineer, QA, growth, and legal/privacy — whichever apply to the sections in THIS step.
3. Include screen storyboard and navigation/information architecture where relevant to this step's sections.
4. Include UX flow and screen map where relevant to this step's sections.
5. Include data model and API contracts where relevant to this step's sections.
6. Include AI agent behavior rules, memory rules, forbidden outputs, and evaluation rules where relevant to this step's sections.
7. Include acceptance criteria and QA scenarios where relevant to this step's sections.
8. Include privacy/trust boundaries where relevant to this step's sections.`;

const EXECUTION_INSTRUCTIONS = `
EXECUTION LAYER INSTRUCTIONS:
1. Include phases only as execution planning, not as a way to shrink the idea.
2. Team & AI-Agent Handoff must give every role (founder, designer, frontend, backend, AI engineer, QA, growth, legal/privacy) concrete next actions and a definition of done.
3. Deployment/operations planning must not block or narrow the product vision.`;

const QIRA_INSTRUCTIONS = `
QIRA-READY BACKLOG INSTRUCTIONS:
1. This is a full, real project backlog — not a placeholder. Cover the ENTIRE path from project start to release.
2. Include concrete epics and sprints derived from the actual product (not generic "Vision/Build/Execution" labels) and enough tasks to actually build the product end to end.
3. Every task must be owned by a specific role: founder, designer, frontend developer, backend developer, AI engineer, QA, growth, or legal/privacy — cover ALL of these roles across the backlog, not just engineering.
4. Do not assume or call any real Qira API. This is a neutral structured plan a later adapter can send to Qira.
5. Never call this a preview or a sample — it must be usable as-is by a delivery team.`;

const AI_AGENT_INSTRUCTIONS = `
AI AGENT PROMPT BUNDLE INSTRUCTIONS:
1. Produce enough self-contained prompts to actually build the product end to end via AI-assisted ("vibe") coding — one prompt per meaningful implementation task, not a handful of generic role summaries.
2. Each prompt must be fully self-contained and executable in a brand-new coding-agent session with zero prior chat context.
3. Each prompt must include, explicitly labeled: Context, Scope, Open only, Do not, Task, Implementation rules, Acceptance, Tests, Final report.
4. When exact files are unknown, instruct the agent to inspect only the smallest relevant files first, not the whole workspace.
5. Prompts must be high-quality and specific to THIS product — never generic boilerplate that could apply to any app.`;

const EVIDENCE_INSTRUCTIONS = `
EVIDENCE LAYER INSTRUCTIONS:
1. Include risks, assumptions, evidence needs, and claims that must not be made yet.
2. Do not invent TAM/revenue/statistics/sources.
3. If sources are missing, mark the pack as strategic starter / starter hypothesis for evidence.
4. If a claim lacks evidence, mark it as assumption, source needed, or research question.
5. If text would say "according to reports/agencies/data", it must have evidenceRefs. Otherwise rewrite as an assumption or source need.
6. Missing sources should not make the whole pack structurally failed if the documents are complete. Use evidenceGate = "weak" or "starter_hypothesis".`;

export const PRODUCT_PACK_V2_STEPS: ProductPackV2Step[] = [
  {
    id: 'vision',
    title: 'Vision Layer',
    sectionKeys: [
      'founder_investor_vision',
      'category_and_market_strategy',
      'competitive_attack_switching_strategy',
      'strategic_product_paths',
      'product_ecosystem_vision',
      'largest_upside_scenario',
      'hidden_opportunities_underrated_features',
      'expansion_paths',
    ],
    // Live-tested: 8 rich documents (whatThisIs/whyItExists/howToUse/
    // doneDefinition + multi-field sections) naturally ran past 23k tokens
    // even before finishing — budget with real headroom, not a guess.
    maxOutputTokens: 30000,
    layerInstructions: VISION_INSTRUCTIONS,
    extraFieldsContract: `{
  "packTitle": string,
  "oneLineThesis": string,
  "language": string,
  "packType": "build_ready_product_pack",
  "ideaAmplification": {
    "fullVision": string,
    "hiddenOpportunities": string[],
    "underratedFeatures": string[],
    "competitorGaps": string[],
    "categoryCreationPotential": string,
    "largestUpsideScenario": string,
    "expansionPaths": string[]
  },
  "recommendedStrategy": {
    "name": string,
    "whyThisPath": string,
    "whyNotOnlyMvp": string,
    "strategicWedge": string,
    "expansionPath": string[],
    "whatMustNotBeLost": string[]
  }
}`,
  },
  {
    id: 'build_product',
    title: 'Build Layer — Product & Strategy',
    sectionKeys: [
      'product_vision',
      'market_context',
      'user_buyer_role_model',
      'target_audience_icp',
      'jobs_to_be_done',
      'problem_map',
      'user_scenarios',
      'feature_checklist',
      'mvp_scope',
      'post_mvp_scope',
    ],
    // 10 documents at the same rich per-document schema as vision — see the
    // vision step's budget note for why this needs real headroom.
    maxOutputTokens: 36000,
    layerInstructions: BUILD_INSTRUCTIONS,
    extraFieldsContract: `{}`,
  },
  {
    id: 'build_design',
    title: 'Build Layer — Design & Frontend',
    sectionKeys: [
      'ux_storyboard',
      'ux_flow',
      'navigation_information_architecture',
      'screen_map',
      'designer_pack',
      'frontend_pack',
    ],
    maxOutputTokens: 26000,
    layerInstructions: BUILD_INSTRUCTIONS,
    extraFieldsContract: `{
  "screenStoryboard": [
    {
      "scenario": string, "userState": string, "screen": string, "whatUserSees": string[],
      "primaryAction": string, "systemBehavior": string[], "dataUsed": string[],
      "successState": string, "failureState": string
    }
  ],
  "navigation": {
    "home": { "purpose": string, "mainContent": string[], "primaryCta": string, "secondaryActions": string[] },
    "mainNavigation": [ { "label": string, "purpose": string, "contains": string[] } ],
    "settings": string[], "emptyStates": string[], "loadingStates": string[], "errorStates": string[]
  }
}`,
  },
  {
    id: 'build_engineering',
    title: 'Build Layer — Engineering & Growth',
    sectionKeys: [
      'backend_pack',
      'data_model',
      'api_integration_requirements',
      'ai_agent_pack',
      'data_privacy_trust_pack',
      'qa_acceptance_pack',
      'growth_monetization_pack',
    ],
    // Live-tested: 28,000 truncated mid-document generating in Russian —
    // 7 rich documents plus structured apiContracts/dataModel need more.
    maxOutputTokens: 42000,
    layerInstructions: BUILD_INSTRUCTIONS,
    extraFieldsContract: `{
  "apiContracts": [
    { "name": string, "method": string, "path": string, "auth": string, "request": object, "response": object, "sideEffects": string[], "errorCodes": string[] }
  ],
  "dataModel": [
    { "entity": string, "purpose": string, "fields": [ { "name": string, "type": string, "description": string, "sensitivity": "public" | "internal" | "personal" | "sensitive" | "regulated" } ], "relations": string[] }
  ]
}`,
  },
  {
    id: 'execution',
    title: 'Execution Layer — Phasing & Handoff',
    sectionKeys: ['execution_phasing', 'team_handoff', 'deployment_operations_plan'],
    maxOutputTokens: 20000,
    layerInstructions: EXECUTION_INSTRUCTIONS,
    extraFieldsContract: `{
  "executionPhases": [
    { "phase": string, "goal": string, "whatItBuilds": string[], "whatItProvesOrUnlocks": string[], "mustNotLoseFromFullVision": string[], "definitionOfDone": string[] }
  ],
  "roleBriefs": {
    "founder": string[], "investor": string[], "designer": string[], "frontend": string[], "backend": string[],
    "aiEngineer": string[], "qa": string[], "growth": string[], "legalPrivacy": string[]
  }
}`,
  },
  {
    id: 'qira_backlog',
    title: 'Execution Layer — Qira-ready Backlog',
    sectionKeys: ['qira_ready_backlog_draft'],
    // A real, full-project backlog (epics × tasks, covering every role,
    // start to release) is the single most content-heavy deliverable —
    // budget accordingly rather than treating it like a normal section.
    maxOutputTokens: 42000,
    layerInstructions: QIRA_INSTRUCTIONS,
    extraFieldsContract: `{
  "executionHandoff": {
    "qiraBacklogDraft": {
      "projectTitle": string,
      "projectDescription": string,
      "epics": [
        {
          "title": string, "description": string, "sourceSections": string[], "priority": "low" | "medium" | "high", "sprintHint": string,
          "tasks": [
            {
              "title": string, "description": string, "ownerRole": string, "taskType": string, "sourceSections": string[],
              "implementationNotes": string[], "filesHint": string[], "dependencies": string[],
              "acceptanceCriteria": string[], "qaChecks": string[], "doneDefinition": string[]
            }
          ],
          "acceptanceCriteria": string[], "dependencies": string[], "doneDefinition": string[]
        }
      ],
      "sprints": [ { "name": string, "goal": string, "epicTitles": string[], "taskTitles": string[], "definitionOfDone": string[] } ],
      "dependencies": string[], "ownerRoles": string[], "labels": string[], "acceptanceCriteria": string[], "doneDefinition": string[]
    }
  }
}`,
  },
  {
    id: 'ai_agent_bundle',
    title: 'Execution Layer — AI Agent Prompt Bundle',
    sectionKeys: ['ai_agent_prompt_bundle_draft'],
    // "Enough self-contained prompts to build the product end to end" is
    // meant to be many prompts with full promptBody text each — the other
    // content-heaviest deliverable alongside the Qira backlog.
    maxOutputTokens: 48000,
    layerInstructions: AI_AGENT_INSTRUCTIONS,
    extraFieldsContract: `{
  "executionHandoff": {
    "aiAgentPromptBundleDraft": [
      {
        "title": string, "targetAgent": "cursor" | "vscode" | "claude_code" | "generic", "purpose": string,
        "promptBody": string, "relatedSections": string[], "expectedFiles": string[], "tests": string[], "finalReportFormat": string[]
      }
    ]
  }
}`,
  },
  {
    id: 'evidence',
    title: 'Evidence Layer',
    sectionKeys: ['risks_assumptions_evidence', 'open_questions_source_needs', 'what_not_to_build_or_claim'],
    maxOutputTokens: 20000,
    layerInstructions: EVIDENCE_INSTRUCTIONS,
    extraFieldsContract: `{
  "quality": {
    "completenessScore": number, "confidenceScore": number, "assumptionCount": number, "evidenceCount": number,
    "riskLevel": "low" | "medium" | "high", "structureGate": "pass" | "warn" | "fail", "evidenceGate": "strong" | "source_backed" | "weak" | "starter_hypothesis" | "fail",
    "safetyGate": "pass" | "warn" | "fail", "buildabilityGate": "pass" | "warn" | "fail", "exportGate": "pass" | "warn" | "fail", "missingInputs": string[]
  },
  "risks": [ { "risk": string, "type": "market" | "product" | "technical" | "legal" | "privacy" | "ai" | "distribution" | "monetization", "severity": "low" | "medium" | "high", "likelihood": "low" | "medium" | "high", "mitigation": string, "validationStep": string } ],
  "exportAssets": [ { "asset": string, "audience": string[], "purpose": string, "content": string[] } ]
}`,
  },
];

export function sectionsForStep(step: ProductPackV2Step) {
  return PRODUCT_PACK_V2_SECTIONS.filter((section) => step.sectionKeys.includes(section.key));
}

/** The shared per-document shape every step returns `documents` in — unchanged from the original single-shot contract. */
export const PRODUCT_PACK_V2_DOCUMENT_CONTRACT = `{
  "type": string (MUST be copied verbatim from this section's "key" in SECTIONS TO PRODUCE below — e.g. "founder_investor_vision", never a made-up or descriptive slug like "vision_document" — and MUST stay in English even when "title" and everything else is written in the output language),
  "layer": "vision" | "build" | "execution" | "evidence",
  "title": string,
  "audience": string[],
  "purpose": string,
  "whatThisIs": string,
  "whyItExists": string,
  "howToUse": string,
  "connections": string[],
  "doneDefinition": string[],
  "sections": [
    {
      "heading": string,
      "content": string,
      "examples": string[],
      "implementationNotes": string[],
      "assumptions": string[],
      "risks": string[],
      "evidenceRefs": string[],
      "sourceNeeds": string[]
    }
  ],
  "acceptanceCriteria": string[]
}`;
