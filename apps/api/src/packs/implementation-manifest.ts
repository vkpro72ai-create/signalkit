/**
 * Deterministic implementation-prompt manifest.
 *
 * The Product Pack's `ai_agent_bundle` step already emits a flat *sequence* of
 * self-contained task prompts (aiAgentPromptBundleDraft). This module is a pure,
 * deterministic post-processor that organizes that sequence into
 * workstreams / sprints with ordering + dependencies and renders an exportable
 * file tree. It NEVER calls an LLM and does not touch generation or its quality
 * gates — a coding agent completes one bounded prompt per session, so the count
 * is whatever the bundle produced (10, 50, 100+ — no fixed maximum).
 */

export interface AiAgentPromptInput {
  title: string;
  targetAgent: string;
  purpose: string;
  promptBody: string;
  relatedSections: string[];
  expectedFiles: string[];
  tests: string[];
  finalReportFormat: string[];
}

export type Workstream =
  | 'frontend'
  | 'backend'
  | 'data'
  | 'ai'
  | 'qa'
  | 'security'
  | 'devops'
  | 'analytics'
  | 'integrations'
  | 'mobile';

export type GroupingConfidence = 'low' | 'medium' | 'high';

export interface ManifestPrompt {
  promptId: string;
  title: string;
  workstream: Workstream;
  /** How sure the keyword classifier is about the workstream (surface low ones for review). */
  groupingConfidence: GroupingConfidence;
  phase: number; // sprint number (1-based)
  sequence: number; // order within its workstream (1-based)
  targetAgent: string;
  objective: string;
  why: string;
  dependsOn: string[];
  blocks: string[];
  parallelizable: string[];
  requiredContext: string[];
  expectedFiles: string[];
  instructions: string; // the full promptBody — self-contained
  acceptanceCriteria: string[];
  verification: string[];
  forbiddenShortcuts: string[];
  expectedArtifacts: string[];
  handoffNotes: string;
  status: 'todo';
}

export interface ImplementationManifest {
  totalPrompts: number;
  workstreams: Workstream[];
  sprints: number[];
  prompts: ManifestPrompt[];
}

// Ordered so the highest-priority workstream wins ties deterministically.
const WORKSTREAM_ORDER: Workstream[] = [
  'frontend', 'backend', 'data', 'ai', 'qa', 'security', 'devops', 'analytics', 'integrations', 'mobile',
];

// Keyword signals per workstream. Multi-word phrases are matched as substrings.
const WORKSTREAM_KEYWORDS: Record<Workstream, string[]> = {
  frontend: ['frontend', 'front-end', 'ui', 'screen', 'component', 'onboarding', 'design system', 'page', 'react', 'next.js', 'nextjs', 'css', 'layout', 'navigation', 'form', 'button', 'empty state', 'loading state'],
  backend: ['backend', 'back-end', 'api', 'endpoint', 'server', 'controller', 'service', 'route', 'job', 'queue', 'background', 'business logic'],
  data: ['data model', 'database schema', 'schema', 'database', 'entity', 'table', 'prisma', 'sql', 'migration', 'seed'],
  ai: ['ai', 'llm', 'agent', 'prompt', 'model router', 'embedding', 'rag', 'structured generation', 'evaluation harness', 'inference'],
  qa: ['qa', 'test suite', 'testing', 'acceptance', 'regression', 'e2e', 'unit test', 'contract test', 'coverage'],
  security: ['security', 'privacy', 'permission', 'rbac', 'authorization', 'encryption', 'gdpr', 'compliance', 'secrets'],
  devops: ['devops', 'deploy', 'deployment', 'ci/cd', 'ci', 'docker', 'infrastructure', 'infra', 'pipeline', 'staging', 'environment setup', 'bootstrap'],
  analytics: ['analytics', 'tracking', 'telemetry', 'metric', 'instrumentation', 'events'],
  integrations: ['integration', 'webhook', 'third-party', 'external provider', 'oauth', 'connector'],
  mobile: ['mobile', 'ios', 'android', 'expo', 'react native'],
};

const DEFAULT_PROMPTS_PER_SPRINT = 5;

function classifyWorkstream(prompt: AiAgentPromptInput): { workstream: Workstream; confidence: GroupingConfidence } {
  const haystack = [prompt.title, prompt.purpose, ...prompt.relatedSections, ...prompt.expectedFiles]
    .join(' ')
    .toLowerCase();
  const scores = new Map<Workstream, number>();
  for (const ws of WORKSTREAM_ORDER) {
    let score = 0;
    for (const kw of WORKSTREAM_KEYWORDS[ws]) {
      if (haystack.includes(kw)) score += 1;
    }
    scores.set(ws, score);
  }
  // Highest score wins; WORKSTREAM_ORDER breaks ties deterministically.
  let best: Workstream = 'backend';
  let bestScore = -1;
  let secondScore = -1;
  for (const ws of WORKSTREAM_ORDER) {
    const s = scores.get(ws) ?? 0;
    if (s > bestScore) {
      secondScore = bestScore;
      bestScore = s;
      best = ws;
    } else if (s > secondScore) {
      secondScore = s;
    }
  }
  let confidence: GroupingConfidence;
  if (bestScore <= 0) confidence = 'low'; // nothing matched — a guess
  else if (bestScore >= 2 && bestScore - secondScore >= 2) confidence = 'high';
  else if (bestScore - secondScore >= 1) confidence = 'medium';
  else confidence = 'low'; // a near-tie between two workstreams — flag for review
  return { workstream: best, confidence };
}

/** Pull the bullet lines under a labeled section of a prompt body (best-effort, never throws). */
function extractSection(promptBody: string, labels: string[]): string[] {
  const lines = promptBody.split(/\r?\n/);
  const lowered = labels.map((l) => l.toLowerCase());
  const out: string[] = [];
  let capturing = false;
  for (const raw of lines) {
    const line = raw.trim();
    const headingMatch = line.replace(/[*#:_-]/g, '').trim().toLowerCase();
    const isHeading = /[:*#]/.test(line) || /^[A-Z][A-Za-z ]+$/.test(line);
    if (isHeading && lowered.some((l) => headingMatch.startsWith(l))) {
      capturing = true;
      continue;
    }
    if (capturing) {
      // Stop at the next heading-like line.
      if (line.length > 0 && isHeading && !line.startsWith('-') && !line.startsWith('•') && !/^\d+[.)]/.test(line)) {
        break;
      }
      const bullet = line.replace(/^[-•]\s?/, '').replace(/^\d+[.)]\s?/, '').trim();
      if (bullet.length > 0) out.push(bullet);
    }
  }
  return out;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'prompt';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Build the manifest from the raw prompt bundle. Ordering is preserved from the
 * bundle; sprint bands group the Nth prompts of every workstream together so a
 * single sprint spans many prompts across many workstreams (never one prompt
 * per workstream).
 */
export function buildImplementationManifest(
  bundle: AiAgentPromptInput[],
  options: { promptsPerSprint?: number } = {},
): ImplementationManifest {
  const promptsPerSprint = Math.max(1, options.promptsPerSprint ?? DEFAULT_PROMPTS_PER_SPRINT);
  const perWorkstreamCount = new Map<Workstream, number>();

  const prompts: ManifestPrompt[] = bundle.map((raw) => {
    const { workstream, confidence } = classifyWorkstream(raw);
    const sequence = (perWorkstreamCount.get(workstream) ?? 0) + 1;
    perWorkstreamCount.set(workstream, sequence);
    const phase = Math.ceil(sequence / promptsPerSprint);
    const promptId = `${workstream}-${pad2(sequence)}`;
    const forbidden = extractSection(raw.promptBody, ['do not', 'forbidden', 'forbidden shortcuts', 'out of scope']);
    const acceptance = extractSection(raw.promptBody, ['acceptance', 'acceptance criteria']);
    return {
      promptId,
      title: raw.title,
      workstream,
      groupingConfidence: confidence,
      phase,
      sequence,
      targetAgent: raw.targetAgent,
      objective: raw.purpose,
      why: raw.purpose,
      dependsOn: [], // filled below
      blocks: [],
      parallelizable: [],
      requiredContext: raw.relatedSections,
      expectedFiles: raw.expectedFiles,
      instructions: raw.promptBody,
      acceptanceCriteria: acceptance.length > 0 ? acceptance : raw.tests,
      verification: raw.tests,
      forbiddenShortcuts: forbidden,
      expectedArtifacts: raw.expectedFiles,
      handoffNotes: raw.finalReportFormat.join('; '),
      status: 'todo',
    };
  });

  // Dependencies: sequential within a workstream (each depends on the previous,
  // and blocks the next); parallelizable = same sprint, different workstream.
  const byWorkstream = new Map<Workstream, ManifestPrompt[]>();
  for (const p of prompts) {
    const list = byWorkstream.get(p.workstream) ?? [];
    list.push(p);
    byWorkstream.set(p.workstream, list);
  }
  for (const list of byWorkstream.values()) {
    for (let i = 0; i < list.length; i++) {
      if (i > 0) list[i]!.dependsOn.push(list[i - 1]!.promptId);
      if (i < list.length - 1) list[i]!.blocks.push(list[i + 1]!.promptId);
    }
  }
  for (const p of prompts) {
    p.parallelizable = prompts
      .filter((o) => o.phase === p.phase && o.workstream !== p.workstream)
      .map((o) => o.promptId);
  }

  const workstreams = WORKSTREAM_ORDER.filter((ws) => byWorkstream.has(ws));
  const sprints = [...new Set(prompts.map((p) => p.phase))].sort((a, b) => a - b);
  return { totalPrompts: prompts.length, workstreams, sprints, prompts };
}

export interface ManifestFile {
  path: string;
  content: string;
}

/** Render the manifest into an exportable `implementation/` file tree. */
export function renderManifestFiles(manifest: ImplementationManifest): ManifestFile[] {
  const files: ManifestFile[] = [];
  files.push({ path: 'implementation/manifest.json', content: JSON.stringify(manifest, null, 2) });
  files.push({ path: 'implementation/manifest.md', content: renderManifestIndex(manifest) });
  for (const p of manifest.prompts) {
    const sprintDir = `sprint-${pad2(p.phase)}`;
    const fileName = `${pad2(p.sequence)}-${slugify(p.title)}.md`;
    files.push({
      path: `implementation/${sprintDir}/${p.workstream}/${fileName}`,
      content: renderPromptFile(p),
    });
  }
  return files;
}

function renderManifestIndex(manifest: ImplementationManifest): string {
  const lines: string[] = [
    '# Implementation Prompt Manifest',
    '',
    `Total prompts: **${manifest.totalPrompts}** across ${manifest.workstreams.length} workstream(s) and ${manifest.sprints.length} sprint(s).`,
    '',
    'Each prompt is one bounded step for one coding-agent session. Complete them in',
    'sprint order; within a sprint, different workstreams can run in parallel.',
    '',
  ];
  for (const sprint of manifest.sprints) {
    lines.push(`## Sprint ${sprint}`, '');
    for (const ws of manifest.workstreams) {
      const inSprint = manifest.prompts.filter((p) => p.phase === sprint && p.workstream === ws);
      if (inSprint.length === 0) continue;
      lines.push(`### ${ws}`, '');
      for (const p of inSprint) {
        const conf = p.groupingConfidence === 'low' ? ' ⚠️ low-confidence grouping — verify' : '';
        lines.push(`- \`${p.promptId}\` **${p.title}**${conf}`);
        if (p.dependsOn.length > 0) lines.push(`  - depends on: ${p.dependsOn.join(', ')}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

function renderPromptFile(p: ManifestPrompt): string {
  const section = (title: string, items: string[]): string[] =>
    items.length > 0 ? [`## ${title}`, ...items.map((i) => `- ${i}`), ''] : [];
  return [
    `# ${p.promptId} — ${p.title}`,
    '',
    `- **Workstream:** ${p.workstream}${p.groupingConfidence === 'low' ? ' (⚠️ low-confidence grouping — verify before trusting the sprint layout)' : ''}`,
    `- **Sprint:** ${p.phase}  •  **Sequence:** ${p.sequence}  •  **Target agent:** ${p.targetAgent}`,
    `- **Depends on:** ${p.dependsOn.length ? p.dependsOn.join(', ') : 'none'}`,
    `- **Can run in parallel with:** ${p.parallelizable.length ? p.parallelizable.join(', ') : 'none'}`,
    '',
    `## Objective`,
    p.objective,
    '',
    ...section('Required context (read these first)', p.requiredContext),
    ...section('Files likely to change', p.expectedFiles),
    `## Task`,
    p.instructions,
    '',
    ...section('Acceptance criteria', p.acceptanceCriteria),
    ...section('Verification', p.verification),
    ...section('Do NOT', p.forbiddenShortcuts),
    ...(p.handoffNotes ? [`## Handoff to next step`, p.handoffNotes, ''] : []),
  ].join('\n');
}
