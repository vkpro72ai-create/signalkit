export type ProductPackV2Layer =
  | 'vision'
  | 'build'
  | 'execution'
  | 'evidence';

export type ProductPackV2SectionKey =
  // Vision Layer
  | 'founder_investor_vision'
  | 'category_and_market_strategy'
  | 'competitive_attack_switching_strategy'
  | 'strategic_product_paths'
  | 'product_ecosystem_vision'
  | 'largest_upside_scenario'
  | 'hidden_opportunities_underrated_features'
  | 'expansion_paths'

  // Build Layer
  | 'product_vision'
  | 'market_context'
  | 'user_buyer_role_model'
  | 'target_audience_icp'
  | 'jobs_to_be_done'
  | 'problem_map'
  | 'user_scenarios'
  | 'feature_checklist'
  | 'mvp_scope'
  | 'post_mvp_scope'
  | 'ux_storyboard'
  | 'ux_flow'
  | 'navigation_information_architecture'
  | 'screen_map'
  | 'designer_pack'
  | 'frontend_pack'
  | 'backend_pack'
  | 'data_model'
  | 'api_integration_requirements'
  | 'ai_agent_pack'
  | 'data_privacy_trust_pack'
  | 'qa_acceptance_pack'
  | 'growth_monetization_pack'

  // Execution Layer
  | 'execution_phasing'
  | 'team_handoff'
  | 'qira_ready_backlog_draft'
  | 'ai_agent_prompt_bundle_draft'
  | 'deployment_operations_plan'

  // Evidence Layer
  | 'risks_assumptions_evidence'
  | 'open_questions_source_needs'
  | 'what_not_to_build_or_claim';

export interface ProductPackV2SectionDefinition {
  key: ProductPackV2SectionKey;
  layer: ProductPackV2Layer;
  title: string;
  audience: string[];
  purpose: string;
  mustExplain: string[];
  mustInclude: string[];
}

export const PRODUCT_PACK_V2_SECTIONS: ProductPackV2SectionDefinition[] = [
  // ---------------------------------------------------------------------------
  // VISION LAYER
  // ---------------------------------------------------------------------------
  {
    key: 'founder_investor_vision',
    layer: 'vision',
    title: 'Founder & Investor Vision',
    audience: ['founder', 'investor', 'venture studio', 'strategic partner'],
    purpose:
      'Explain the full ambition of the idea before any MVP narrowing. This is the founder/investor-grade vision of why the product can matter, why now, and why it can become a meaningful company or category.',
    mustExplain: [
      'what is being built at full ambition level',
      'why the idea matters',
      'why now',
      'why this can become a category or defensible company',
      'why users or customers may switch from current alternatives',
      'what makes the idea bigger than a feature',
      'what could make investors care',
      'what must be true for this to become a large outcome',
    ],
    mustInclude: [
      'one-line thesis',
      'full vision',
      'category creation potential',
      'market capture logic',
      'investor narrative',
      'strategic wedge without shrinking the vision',
      'largest upside scenario summary',
      'main risks',
      'what must be proven',
      'what must not be reduced to a narrow MVP too early',
    ],
  },
  {
    key: 'category_and_market_strategy',
    layer: 'vision',
    title: 'Category & Market Strategy',
    audience: ['founder', 'investor', 'growth lead', 'strategy lead'],
    purpose:
      'Define what category this product is trying to create, enter, or attack, and where the strongest market opportunity sits.',
    mustExplain: [
      'existing category',
      'new category possibility',
      'market entry logic',
      'local vs global potential',
      'buyer/user distinction',
      'market timing',
      'why this category may be expanding now',
    ],
    mustInclude: [
      'category thesis',
      'market segments',
      'priority beachheads',
      'expansion markets',
      'budget owner or paying user',
      'adoption drivers',
      'barriers to adoption',
      'category risks',
      'category naming options',
    ],
  },
  {
    key: 'competitive_attack_switching_strategy',
    layer: 'vision',
    title: 'Competitive Attack & Switching Strategy',
    audience: ['founder', 'investor', 'product strategist', 'growth lead'],
    purpose:
      'Explain how this product can win against incumbents, substitutes, user habits, spreadsheets, agencies, manual work, or non-consumption.',
    mustExplain: [
      'who the real competitors are',
      'which customer habits must be replaced',
      'where incumbents are weak',
      'what users are underserved by',
      'why users would switch',
      'what switching trigger can unlock adoption',
      'what should not be attacked first',
    ],
    mustInclude: [
      'direct competitors',
      'indirect competitors',
      'non-consumption and workaround competitors',
      'competitor weaknesses',
      'underserved features',
      'switching triggers',
      'attack wedge',
      'defensibility hypotheses',
      'how to steal users or customers from alternatives',
    ],
  },
  {
    key: 'strategic_product_paths',
    layer: 'vision',
    title: 'Strategic Product Paths',
    audience: ['founder', 'investor', 'product lead'],
    purpose:
      'Show that the same raw idea can become different products, then compare the paths and recommend the strongest path without pretending the others do not exist.',
    mustExplain: [
      'multiple possible realizations of the idea',
      'pros and cons of each path',
      'monetization differences',
      'risk differences',
      'distribution differences',
      'why the recommended path is strongest',
      'why not the other paths first',
    ],
    mustInclude: [
      '3 to 5 possible product strategies',
      'target user for each path',
      'buyer for each path',
      'business model for each path',
      'key risk for each path',
      'distribution motion for each path',
      'recommended path',
      'why not the other paths first',
      'later expansion from recommended path into other paths',
    ],
  },
  {
    key: 'product_ecosystem_vision',
    layer: 'vision',
    title: 'Product Ecosystem Vision',
    audience: ['founder', 'product lead', 'designer', 'engineering lead'],
    purpose:
      'Describe the complete product ecosystem, not just the first release or first feature set.',
    mustExplain: [
      'the full system',
      'core product loops',
      'long-term product expansion',
      'roles and permissions',
      'what the product should become over time',
      'what the product must never become',
      'what ecosystem modules reinforce each other',
    ],
    mustInclude: [
      'core product promise',
      'main product loops',
      'primary user modes',
      'secondary user modes',
      'ecosystem modules',
      'retention loops',
      'trust loops',
      'data loops',
      'long-term expansion map',
      'what must remain coherent across the ecosystem',
    ],
  },
  {
    key: 'largest_upside_scenario',
    layer: 'vision',
    title: 'Largest Upside Scenario',
    audience: ['founder', 'investor', 'venture studio'],
    purpose:
      'Describe the biggest believable outcome if the idea works, without fabricating market size or unsupported financial claims.',
    mustExplain: [
      'what the company becomes if the idea works',
      'what category or behavior changes',
      'how the product expands beyond the first use case',
      'what data, workflow, trust, network, or distribution advantage may compound',
      'what assumptions must become true',
    ],
    mustInclude: [
      'largest credible product outcome',
      'largest credible business outcome',
      'possible category leadership path',
      'compounding advantages',
      'expansion sequence',
      'key assumptions',
      'what evidence is needed before claiming this externally',
    ],
  },
  {
    key: 'hidden_opportunities_underrated_features',
    layer: 'vision',
    title: 'Hidden Opportunities & Underrated Features',
    audience: ['founder', 'product lead', 'designer', 'growth lead'],
    purpose:
      'Find non-obvious product opportunities inside the idea that could become adoption, retention, monetization, or defensibility advantages.',
    mustExplain: [
      'which user needs are easy to miss',
      'which features may look small but create strong retention',
      'which workflows could become wedge features',
      'which trust or personalization moments can differentiate the product',
      'which underserved segments or edge cases may unlock adoption',
    ],
    mustInclude: [
      'hidden opportunities',
      'underrated features',
      'overlooked user needs',
      'possible wedge features',
      'retention features',
      'trust-building features',
      'monetization-enabling features',
      'features to test but not overbuild immediately',
    ],
  },
  {
    key: 'expansion_paths',
    layer: 'vision',
    title: 'Expansion Paths',
    audience: ['founder', 'investor', 'product lead', 'growth lead'],
    purpose:
      'Explain how the product can expand across users, roles, markets, workflows, platforms, or business models after the first focused launch.',
    mustExplain: [
      'what expansion can happen after the first launch',
      'which expansion paths are natural',
      'which expansion paths are dangerous or distracting',
      'what must be built early to avoid blocking expansion later',
      'how expansion supports the full vision',
    ],
    mustInclude: [
      'user expansion',
      'role expansion',
      'market expansion',
      'workflow expansion',
      'platform expansion',
      'monetization expansion',
      'data/AI expansion',
      'what to postpone',
      'what architectural decisions must preserve optionality',
    ],
  },

  // ---------------------------------------------------------------------------
  // BUILD LAYER
  // ---------------------------------------------------------------------------
  {
    key: 'product_vision',
    layer: 'build',
    title: 'Product Vision',
    audience: ['founder', 'product manager', 'designer', 'engineering lead'],
    purpose:
      'Translate the full founder vision into a clear product direction without collapsing it into only the first MVP.',
    mustExplain: [
      'product promise',
      'primary user value',
      'core product behavior',
      'what the product is',
      'what the product is not',
      'how the build layer supports the larger vision',
    ],
    mustInclude: [
      'product promise',
      'primary user',
      'primary use case',
      'core value loop',
      'success definition',
      'non-goals',
      'connection to the Founder & Investor Vision',
    ],
  },
  {
    key: 'market_context',
    layer: 'build',
    title: 'Market Context',
    audience: ['founder', 'product manager', 'growth lead', 'investor'],
    purpose:
      'Explain the market, timing, alternatives, local/global context, and evidence limits behind the product direction.',
    mustExplain: [
      'market context',
      'why now',
      'current alternatives',
      'local/global considerations',
      'buyer behavior',
      'evidence limits',
    ],
    mustInclude: [
      'market narrative',
      'timing signals',
      'alternatives',
      'competitor context',
      'local context if relevant',
      'global analogy if relevant',
      'assumptions',
      'research questions',
    ],
  },
  {
    key: 'user_buyer_role_model',
    layer: 'build',
    title: 'User, Buyer & Role Model',
    audience: ['product lead', 'designer', 'backend developer', 'growth lead'],
    purpose:
      'Define who uses, pays, approves, influences, administers, and receives value from the product.',
    mustExplain: [
      'primary user',
      'secondary users',
      'buyer',
      'decision maker',
      'administrator if any',
      'external roles',
      'permission boundaries',
      'role-specific value',
    ],
    mustInclude: [
      'primary ICP',
      'secondary ICPs',
      'buyer types',
      'role permissions',
      'role-specific jobs',
      'role-specific risks',
      'role-specific value moments',
      'access boundaries',
    ],
  },
  {
    key: 'target_audience_icp',
    layer: 'build',
    title: 'Target Audience / ICP',
    audience: ['founder', 'product manager', 'growth lead', 'sales lead'],
    purpose:
      'Define the first target audience precisely enough for product, positioning, sales, and growth decisions.',
    mustExplain: [
      'who the first user is',
      'who the first buyer is',
      'what pain they have',
      'why they might pay or adopt',
      'why this segment is the first beachhead',
    ],
    mustInclude: [
      'primary ICP',
      'buyer',
      'daily user',
      'budget owner if different',
      'pains',
      'current workaround',
      'objections',
      'adoption triggers',
      'why this ICP first',
    ],
  },
  {
    key: 'jobs_to_be_done',
    layer: 'build',
    title: 'Jobs To Be Done',
    audience: ['product manager', 'designer', 'growth lead'],
    purpose:
      'Convert the idea into functional, emotional, and social jobs users are hiring the product to do.',
    mustExplain: [
      'functional job',
      'emotional job',
      'social job',
      'trigger moments',
      'desired outcomes',
      'current workaround',
    ],
    mustInclude: [
      'main functional jobs',
      'emotional jobs',
      'social jobs',
      'triggers',
      'success outcomes',
      'failure outcomes',
      'current alternatives',
    ],
  },
  {
    key: 'problem_map',
    layer: 'build',
    title: 'Problem Map',
    audience: ['founder', 'product manager', 'designer'],
    purpose:
      'Break the user/customer pain into concrete problem areas with severity, frequency, and current workaround.',
    mustExplain: [
      'problem areas',
      'severity',
      'frequency',
      'current workaround',
      'cost of inaction',
      'which problems the product should solve first',
    ],
    mustInclude: [
      'pain areas',
      'severity',
      'frequency',
      'current workaround',
      'who feels the pain',
      'business or emotional cost',
      'what to validate',
    ],
  },
  {
    key: 'user_scenarios',
    layer: 'build',
    title: 'User Scenarios',
    audience: ['product manager', 'designer', 'frontend developer', 'QA'],
    purpose:
      'Describe real user behavior and edge cases so the team can design and test the product correctly.',
    mustExplain: [
      'actors',
      'triggers',
      'steps',
      'expected result',
      'edge cases',
      'failure states',
    ],
    mustInclude: [
      'main scenario',
      'onboarding scenario',
      'repeat-use scenario',
      'power-user scenario',
      'failure scenario',
      'permission/access scenario',
      'success state',
    ],
  },
  {
    key: 'feature_checklist',
    layer: 'build',
    title: 'Feature Checklist',
    audience: ['product manager', 'designer', 'frontend developer', 'backend developer'],
    purpose:
      'Turn the product vision into a prioritized feature inventory without pretending every feature must be built immediately.',
    mustExplain: [
      'feature purpose',
      'priority',
      'user value',
      'dependencies',
      'risk',
      'phase',
      'what should not be overbuilt',
    ],
    mustInclude: [
      'must-have features',
      'should-have features',
      'later features',
      'feature dependencies',
      'feature risks',
      'phase mapping',
      'what not to build yet',
    ],
  },
  {
    key: 'mvp_scope',
    layer: 'build',
    title: 'MVP Scope',
    audience: ['founder', 'product manager', 'engineering lead', 'investor'],
    purpose:
      'Define the first launchable scope as an execution phase, not as a replacement for the full product vision.',
    mustExplain: [
      'what enters the first version',
      'what is intentionally excluded',
      'why the MVP still preserves the full vision',
      'what the MVP proves or unlocks',
      'what must not be lost from the full ambition',
    ],
    mustInclude: [
      'included in MVP',
      'excluded from MVP',
      'rationale',
      'success metric',
      'risks',
      'dependencies',
      'what the MVP must preserve from the full vision',
    ],
  },
  {
    key: 'post_mvp_scope',
    layer: 'build',
    title: 'Post-MVP Scope',
    audience: ['founder', 'product manager', 'engineering lead'],
    purpose:
      'Define what comes after the first launch so the team does not accidentally architect the MVP as a dead end.',
    mustExplain: [
      'what comes after MVP',
      'why it matters',
      'what dependencies exist',
      'what must be prepared early',
    ],
    mustInclude: [
      'v1.1 scope',
      'v1.2 scope',
      'v2 scope',
      'ecosystem scope',
      'dependencies',
      'architecture implications',
      'risks',
    ],
  },
  {
    key: 'ux_storyboard',
    layer: 'build',
    title: 'UX Storyboard',
    audience: ['founder', 'designer', 'frontend developer', 'product manager'],
    purpose:
      'Make the product understandable as lived user scenarios, not abstract feature lists.',
    mustExplain: [
      'what happens in the first session',
      'what happens on day one',
      'what happens in week one',
      'what happens after repeated use',
      'what happens during key lifecycle moments',
      'what happens when something fails',
    ],
    mustInclude: [
      'first session storyboard',
      'day 1 storyboard',
      'week 1 storyboard',
      'month 3 storyboard',
      'power user storyboard',
      'critical event storyboard',
      'handoff/export storyboard',
      'failure/error storyboard',
    ],
  },
  {
    key: 'ux_flow',
    layer: 'build',
    title: 'UX Flow',
    audience: ['designer', 'frontend developer', 'product manager'],
    purpose:
      'Define how users move through the product, what states they encounter, and where the key value moments happen.',
    mustExplain: [
      'entry points',
      'main flows',
      'screen transitions',
      'states',
      'success paths',
      'failure paths',
    ],
    mustInclude: [
      'primary flow',
      'secondary flows',
      'onboarding flow',
      'repeat-use flow',
      'error flow',
      'empty state flow',
      'upgrade/paywall flow if relevant',
    ],
  },
  {
    key: 'navigation_information_architecture',
    layer: 'build',
    title: 'Navigation & Information Architecture',
    audience: ['designer', 'frontend developer', 'product manager'],
    purpose:
      'Define the product structure: home, navigation, key screens, tabs, sidebars, settings, and object relationships.',
    mustExplain: [
      'home screen purpose',
      'bottom or sidebar navigation',
      'main sections',
      'object hierarchy',
      'where users go for each job',
      'how screens connect',
    ],
    mustInclude: [
      'home screen content',
      'main navigation',
      'secondary navigation',
      'settings structure',
      'object hierarchy',
      'screen list',
      'screen relationships',
      'empty states',
      'error states',
      'loading states',
    ],
  },
  {
    key: 'screen_map',
    layer: 'build',
    title: 'Screen Map',
    audience: ['designer', 'frontend developer', 'AI coding agent'],
    purpose:
      'Map product screens to purpose, components, data, actions, states, and API needs.',
    mustExplain: [
      'screen purpose',
      'components',
      'data needed',
      'user actions',
      'states',
      'API dependencies',
    ],
    mustInclude: [
      'screen list',
      'screen purpose',
      'components per screen',
      'data per screen',
      'actions per screen',
      'empty/loading/error states',
      'API calls per screen',
    ],
  },
  {
    key: 'designer_pack',
    layer: 'build',
    title: 'Designer Pack',
    audience: ['designer', 'product designer', 'UX researcher'],
    purpose:
      'Give the designer enough context to design the product without guessing.',
    mustExplain: [
      'desired product feeling',
      'visual principles',
      'information hierarchy',
      'trust and safety patterns',
      'key screens',
      'components',
      'states',
    ],
    mustInclude: [
      'design principles',
      'screen-by-screen content',
      'component list',
      'interaction notes',
      'trust indicators',
      'privacy indicators',
      'empty/loading/error states',
      'premium moments',
      'what to avoid',
    ],
  },
  {
    key: 'frontend_pack',
    layer: 'build',
    title: 'Frontend Developer Pack',
    audience: ['frontend developer', 'mobile developer', 'web developer', 'AI coding agent'],
    purpose:
      'Give frontend enough implementation detail to build the UI and connect it to APIs.',
    mustExplain: [
      'routes',
      'pages',
      'components',
      'client state',
      'API calls per screen',
      'loading states',
      'error states',
      'role/access states',
    ],
    mustInclude: [
      'route map',
      'page responsibilities',
      'component map',
      'form fields',
      'API integration list',
      'state model',
      'permission logic',
      'i18n requirements',
      'responsive behavior',
      'acceptance checks',
    ],
  },
  {
    key: 'backend_pack',
    layer: 'build',
    title: 'Backend Developer Pack',
    audience: ['backend developer', 'architect', 'AI coding agent'],
    purpose:
      'Define backend modules, data objects, workflows, permissions, jobs, errors, and integrations.',
    mustExplain: [
      'backend modules',
      'business logic',
      'entities',
      'relationships',
      'jobs',
      'permissions',
      'audit logs',
      'error handling',
    ],
    mustInclude: [
      'module list',
      'entity list',
      'data relationships',
      'workflow descriptions',
      'API endpoints',
      'background jobs',
      'LLM tasks',
      'auth and permissions',
      'audit requirements',
      'error codes',
    ],
  },
  {
    key: 'data_model',
    layer: 'build',
    title: 'Data Model',
    audience: ['backend developer', 'AI coding agent', 'architect'],
    purpose:
      'Define the core data objects, fields, sensitivity levels, relationships, validation rules, and persistence needs.',
    mustExplain: [
      'entities',
      'fields',
      'relationships',
      'sensitivity',
      'validation',
      'retention',
      'audit needs',
    ],
    mustInclude: [
      'entity list',
      'fields per entity',
      'relations',
      'validation rules',
      'sensitivity labels',
      'audit requirements',
      'delete/export considerations',
    ],
  },
  {
    key: 'api_integration_requirements',
    layer: 'build',
    title: 'API / Integration Requirements',
    audience: ['frontend developer', 'backend developer', 'AI coding agent'],
    purpose:
      'Define frontend/backend contracts and external integrations needed to support the product.',
    mustExplain: [
      'endpoints',
      'request payloads',
      'response payloads',
      'auth',
      'error codes',
      'side effects',
      'integrations',
    ],
    mustInclude: [
      'endpoint list',
      'request examples',
      'response examples',
      'error codes',
      'auth requirements',
      'integration requirements',
      'rate limits if relevant',
      'webhooks/jobs if relevant',
    ],
  },
  {
    key: 'ai_agent_pack',
    layer: 'build',
    title: 'AI Agent Pack',
    audience: ['AI engineer', 'prompt engineer', 'backend developer', 'AI coding agent'],
    purpose:
      'Define AI agent behavior, memory rules, task types, structured outputs, evaluation rules, and forbidden behavior.',
    mustExplain: [
      'agent identity',
      'agent responsibilities',
      'what makes it not just a chat',
      'memory rules',
      'planning rules',
      'safety boundaries',
      'structured output contracts',
      'failure handling',
    ],
    mustInclude: [
      'agent role',
      'agent task types',
      'memory policy',
      'proactive behavior',
      'output formats',
      'forbidden outputs',
      'evaluation rules',
      'failure handling',
      'handoff rules',
    ],
  },
  {
    key: 'data_privacy_trust_pack',
    layer: 'build',
    title: 'Data, Privacy & Trust Pack',
    audience: ['backend developer', 'legal/privacy lead', 'founder', 'security engineer'],
    purpose:
      'Define sensitive data, consent, privacy scopes, retention, deletion, sharing, audit, and trust boundaries.',
    mustExplain: [
      'what data is collected',
      'why it is collected',
      'sensitivity levels',
      'consent model',
      'sharing model',
      'deletion/export',
      'audit trail',
    ],
    mustInclude: [
      'data categories',
      'sensitivity levels',
      'consent flows',
      'privacy scopes',
      'access controls',
      'retention policy assumptions',
      'delete/export requirements',
      'audit log requirements',
      'trust risks',
    ],
  },
  {
    key: 'qa_acceptance_pack',
    layer: 'build',
    title: 'QA & Acceptance Pack',
    audience: ['QA engineer', 'product manager', 'engineering lead', 'AI coding agent'],
    purpose:
      'Define how the product is tested and what “done” means.',
    mustExplain: [
      'core test scenarios',
      'role-based tests',
      'AI output tests',
      'privacy tests',
      'failure tests',
      'performance expectations',
    ],
    mustInclude: [
      'acceptance criteria',
      'scenario tests',
      'API tests',
      'UI tests',
      'permission tests',
      'AI safety tests',
      'no infinite loading tests',
      'export tests',
      'definition of done',
    ],
  },
  {
    key: 'growth_monetization_pack',
    layer: 'build',
    title: 'Growth & Monetization Pack',
    audience: ['founder', 'growth lead', 'sales lead', 'investor'],
    purpose:
      'Define positioning, pricing, paywall moments, acquisition channels, retention loops, and switching strategy.',
    mustExplain: [
      'who pays',
      'why they pay',
      'when they pay',
      'how users are acquired',
      'what drives retention',
      'how to steal users from alternatives',
      'how monetization can expand',
    ],
    mustInclude: [
      'positioning',
      'pricing hypotheses',
      'tiers',
      'paywall moments',
      'activation moment',
      'retention loops',
      'channels',
      'switching strategy',
      'expansion revenue',
    ],
  },

  // ---------------------------------------------------------------------------
  // EXECUTION LAYER
  // ---------------------------------------------------------------------------
  {
    key: 'execution_phasing',
    layer: 'execution',
    title: 'Execution Phasing',
    audience: ['founder', 'product manager', 'engineering lead', 'investor'],
    purpose:
      'Break the full vision into execution stages without shrinking the ambition or pretending the MVP is the whole product.',
    mustExplain: [
      'full vision remains primary',
      'why each phase exists',
      'what each phase proves or unlocks',
      'what must not be lost in early phases',
      'how later phases connect to the ecosystem vision',
    ],
    mustInclude: [
      'phase 0 prototype',
      'phase 1 launchable product',
      'phase 2 expansion',
      'phase 3 ecosystem',
      'phase 4 defensibility',
      'dependencies',
      'risks per phase',
      'definition of done per phase',
    ],
  },
  {
    key: 'team_handoff',
    layer: 'execution',
    title: 'Team & AI-Agent Handoff',
    audience: ['founder', 'designer', 'frontend developer', 'backend developer', 'QA', 'AI agent'],
    purpose:
      'Convert the pack into role-specific next actions, responsibilities, outputs, and definitions of done.',
    mustExplain: [
      'who does what',
      'what each role needs',
      'what each role must avoid',
      'how outputs connect',
      'what done means',
    ],
    mustInclude: [
      'founder brief',
      'designer brief',
      'frontend brief',
      'backend brief',
      'AI engineer brief',
      'QA brief',
      'growth brief',
      'legal/privacy brief if relevant',
      'AI coding agent instructions',
    ],
  },
  {
    key: 'qira_ready_backlog_draft',
    layer: 'execution',
    title: 'Qira-ready Backlog Draft',
    audience: ['founder', 'product manager', 'studio lead', 'delivery manager'],
    purpose:
      'Create a neutral project backlog draft that can later be sent to Qira or another delivery system. This is not a real API integration.',
    mustExplain: [
      'how Product Pack sections become epics',
      'how epics become sprint candidates',
      'how tasks depend on each other',
      'which roles own which tasks',
      'how acceptance criteria connect to QA',
    ],
    mustInclude: [
      'project title',
      'epics',
      'sprint suggestions',
      'tasks',
      'dependencies',
      'owner roles',
      'labels',
      'acceptance criteria',
      'definition of done',
      'notes that this is a draft, not an API call',
    ],
  },
  {
    key: 'ai_agent_prompt_bundle_draft',
    layer: 'execution',
    title: 'AI Agent Prompt Bundle Draft',
    audience: ['founder', 'AI coding agent', 'engineering lead', 'developer'],
    purpose:
      'Create self-contained prompts for Cursor, VS Code agents, Claude Code, or similar tools. Each prompt must work without prior chat context.',
    mustExplain: [
      'why prompts must be self-contained',
      'how prompts map to implementation tasks',
      'what files/folders should be opened',
      'what must not be scanned or changed',
      'how tests and reports should be constrained',
    ],
    mustInclude: [
      'prompt list',
      'target agent',
      'context block',
      'scope block',
      'open only block',
      'do not block',
      'task block',
      'acceptance block',
      'tests block',
      'final report block',
    ],
  },
  {
    key: 'deployment_operations_plan',
    layer: 'execution',
    title: 'Deployment / Operations Plan',
    audience: ['engineering lead', 'backend developer', 'DevOps', 'AI coding agent'],
    purpose:
      'Define how the product should be deployed, configured, observed, rolled back, and operated safely.',
    mustExplain: [
      'deployment target',
      'environment variables',
      'build/release flow',
      'health checks',
      'logs',
      'rollback',
      'what must not be touched',
    ],
    mustInclude: [
      'deployment environments',
      'required env vars',
      'build commands',
      'migration rules',
      'health checks',
      'monitoring/logs',
      'rollback plan',
      'operational risks',
    ],
  },

  // ---------------------------------------------------------------------------
  // EVIDENCE LAYER
  // ---------------------------------------------------------------------------
  {
    key: 'risks_assumptions_evidence',
    layer: 'evidence',
    title: 'Risks, Assumptions & Evidence',
    audience: ['founder', 'investor', 'product manager', 'legal/privacy lead'],
    purpose:
      'Separate what is known, what is assumed, what is risky, and what must be researched.',
    mustExplain: [
      'evidence-backed claims',
      'weak signals',
      'assumptions',
      'unknowns',
      'contradictions',
      'validation needs',
    ],
    mustInclude: [
      'evidence-backed claims',
      'assumptions',
      'unknowns',
      'risks',
      'mitigations',
      'validation questions',
      'claims that must not be made yet',
      'research backlog',
    ],
  },
  {
    key: 'open_questions_source_needs',
    layer: 'evidence',
    title: 'Open Questions & Source Needs',
    audience: ['founder', 'researcher', 'product manager', 'investor'],
    purpose:
      'List what must be researched before the product can be treated as evidence-backed rather than a strategic hypothesis.',
    mustExplain: [
      'which claims need sources',
      'which assumptions need validation',
      'which interviews or data sources are needed',
      'which legal/privacy questions remain open',
      'which market questions could change strategy',
    ],
    mustInclude: [
      'source needs',
      'research questions',
      'customer interview questions',
      'competitor research needs',
      'legal/privacy research needs',
      'go/no-go questions',
      'priority of each question',
    ],
  },
  {
    key: 'what_not_to_build_or_claim',
    layer: 'evidence',
    title: 'What Not To Build / What Not To Claim',
    audience: ['founder', 'product manager', 'designer', 'engineering lead', 'growth lead', 'legal/privacy lead'],
    purpose:
      'Protect the product from overbuilding, unsafe claims, misleading marketing, and features that undermine trust or strategy.',
    mustExplain: [
      'what not to build now',
      'what not to promise',
      'what not to claim without evidence',
      'what user trust boundaries must not be crossed',
      'what feature ideas may look attractive but are dangerous or distracting',
    ],
    mustInclude: [
      'do-not-build list',
      'do-not-claim list',
      'unsafe claims',
      'privacy/trust boundaries',
      'overbuilt features to avoid',
      'AI outputs to forbid',
      'marketing claims that need proof',
    ],
  },
];