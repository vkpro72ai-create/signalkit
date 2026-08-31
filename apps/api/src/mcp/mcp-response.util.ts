/**
 * Shapes existing service results into product-level DTOs for MCP tool
 * responses. Never returns a raw Prisma row — every field here is chosen
 * because an AI client reading it needs it, not because the database has it.
 */

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  settings?: {
    defaultLocale: string;
    defaultMarketCountry: string | null;
    defaultMarketRegion: string | null;
    billingPlan: string;
    aiEngineName: string | null;
  } | null;
}

export function toWorkspaceContextDto(workspace: WorkspaceRow) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    defaultLocale: workspace.settings?.defaultLocale ?? 'en',
    defaultMarketCountry: workspace.settings?.defaultMarketCountry ?? null,
    defaultMarketRegion: workspace.settings?.defaultMarketRegion ?? null,
    billingPlan: workspace.settings?.billingPlan ?? 'free',
  };
}

interface ResearchProjectRow {
  id: string;
  name: string;
  goal: string;
  status: string;
  marketScope: string;
  targetCountry: string | null;
  targetRegion: string | null;
  targetCountries: string[];
  targetRegions: string[];
  marketLanguage: string;
  defaultOutputLanguage: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toResearchDto(project: ResearchProjectRow) {
  return {
    id: project.id,
    name: project.name,
    goal: project.goal,
    status: project.status,
    market: {
      scope: project.marketScope,
      targetCountry: project.targetCountry,
      targetRegion: project.targetRegion,
      targetCountries: project.targetCountries,
      targetRegions: project.targetRegions,
      marketLanguage: project.marketLanguage,
    },
    defaultOutputLanguage: project.defaultOutputLanguage,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

interface OpportunitySummaryRow {
  id: string;
  name: string;
  oneLiner: string;
  whyNow: string;
  riskLevel: string;
  projectId: string;
  targetMarket: string | null;
  evidenceCount: number;
  opportunityScore: number;
  confidence: { level: string; value: number };
  ventureScaleScore: number | null;
  ventureScaleLevel: string | null;
  buildReadinessScore: number | null;
}

export function toOpportunitySummaryDto(niche: OpportunitySummaryRow) {
  return {
    id: niche.id,
    title: niche.name,
    oneLiner: niche.oneLiner,
    whyNow: niche.whyNow,
    riskLevel: niche.riskLevel,
    projectId: niche.projectId,
    targetMarket: niche.targetMarket,
    evidenceCount: niche.evidenceCount,
    opportunityScore: niche.opportunityScore,
    confidence: niche.confidence,
    ventureScaleScore: niche.ventureScaleScore,
    ventureScaleLevel: niche.ventureScaleLevel,
    buildReadinessScore: niche.buildReadinessScore,
  };
}

interface OpportunityDetailRow {
  id: string;
  projectId: string;
  title: string;
  oneLiner: string;
  problem: string;
  targetAudience: string;
  whyNow: string;
  useCases: string[];
  competitors: string[];
  mvpConcept: string;
  monetization: string;
  recommendedProductFormat: string;
  riskLevel: string;
  language: string;
  intakeMode: string;
  founderIdeaText: string;
  scores: Array<{ totalScore: number; confidenceValue: number; confidenceLevel: string; explanation: string }>;
}

interface VentureThesisRow {
  thesis: unknown;
  ventureScaleScore: number;
  ventureScaleConfidence: number;
  ventureScaleLevel: string;
  whatMustBeTrue: unknown;
}

export function toOpportunityDetailDto(niche: OpportunityDetailRow, venture: VentureThesisRow | null) {
  const latestScore = niche.scores[0] ?? null;
  const thesis = venture?.thesis as Record<string, unknown> | undefined;
  return {
    id: niche.id,
    projectId: niche.projectId,
    title: niche.title,
    oneLiner: niche.oneLiner,
    problem: niche.problem,
    targetAudience: niche.targetAudience,
    whyNow: niche.whyNow,
    useCases: niche.useCases,
    competitors: niche.competitors,
    mvpConcept: niche.mvpConcept,
    monetization: niche.monetization,
    recommendedProductFormat: niche.recommendedProductFormat,
    riskLevel: niche.riskLevel,
    language: niche.language,
    intakeMode: niche.intakeMode,
    founderIdeaText: niche.intakeMode === 'founder_idea' ? niche.founderIdeaText : null,
    latestScore: latestScore
      ? {
          totalScore: latestScore.totalScore,
          confidenceValue: latestScore.confidenceValue,
          confidenceLevel: latestScore.confidenceLevel,
          explanation: latestScore.explanation,
        }
      : null,
    ventureThesis: venture
      ? {
          breakoutThesis: typeof thesis?.breakoutThesis === 'string' ? thesis.breakoutThesis : null,
          ventureScaleScore: venture.ventureScaleScore,
          ventureScaleConfidence: venture.ventureScaleConfidence,
          ventureScaleLevel: venture.ventureScaleLevel,
          whatMustBeTrue: venture.whatMustBeTrue,
        }
      : null,
  };
}

interface ProductPackRow {
  id: string;
  nicheId: string;
  projectId: string;
  title: string;
  depth: string;
  verticalTemplate: string;
  primaryLanguage: string;
  status: string;
  confidenceValue: number;
  confidenceLevel: string;
  version: number;
  qualityGate: { status: string; passedCount: number; warnCount: number; failCount: number } | null;
  documents: Array<{
    id: string;
    docType: string;
    title: string;
    body: string;
    status: string;
    confidenceValue: number;
    confidenceLevel: string;
    qualityGateStatus: string;
    version: number;
  }>;
}

export function toProductPackDto(pack: ProductPackRow) {
  return {
    id: pack.id,
    nicheId: pack.nicheId,
    projectId: pack.projectId,
    title: pack.title,
    depth: pack.depth,
    verticalTemplate: pack.verticalTemplate,
    primaryLanguage: pack.primaryLanguage,
    status: pack.status,
    confidenceValue: pack.confidenceValue,
    confidenceLevel: pack.confidenceLevel,
    version: pack.version,
    qualityGate: pack.qualityGate
      ? {
          status: pack.qualityGate.status,
          passedCount: pack.qualityGate.passedCount,
          warnCount: pack.qualityGate.warnCount,
          failCount: pack.qualityGate.failCount,
        }
      : null,
    documents: pack.documents.map((d) => ({
      id: d.id,
      docType: d.docType,
      title: d.title,
      body: d.body,
      status: d.status,
      confidenceValue: d.confidenceValue,
      confidenceLevel: d.confidenceLevel,
      qualityGateStatus: d.qualityGateStatus,
      version: d.version,
    })),
  };
}

interface GenerationJobRow {
  id: string;
  packId: string;
  status: string;
  generationMode: string;
  currentStep: string | null;
  progressPercent: number;
  readyDocumentCount: number;
  totalExpectedDocumentCount: number;
  buildReady: boolean;
  errorCode: string | null;
  errorReason: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  steps: Array<{
    stepKey: string;
    status: string;
    provider: string | null;
    model: string | null;
    attemptCount: number;
    repairCount: number;
    startedAt: Date | null;
    completedAt: Date | null;
    durationMs: number | null;
    errorCode: string | null;
    errorReason: string | null;
  }>;
}

export function toGenerationStatusDto(job: GenerationJobRow, contextChanged: boolean) {
  return {
    jobId: job.id,
    packId: job.packId,
    status: job.status,
    generationMode: job.generationMode,
    currentStep: job.currentStep,
    progressPercent: job.progressPercent,
    readyDocumentCount: job.readyDocumentCount,
    totalExpectedDocumentCount: job.totalExpectedDocumentCount,
    buildReady: job.buildReady,
    errorCode: job.errorCode,
    errorReason: job.errorReason,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    contextChanged,
    steps: job.steps.map((s) => ({
      stepKey: s.stepKey,
      status: s.status,
      provider: s.provider,
      model: s.model,
      attemptCount: s.attemptCount,
      repairCount: s.repairCount,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      durationMs: s.durationMs,
      errorCode: s.errorCode,
      errorReason: s.errorReason,
    })),
  };
}

interface ImplementationProjectRow {
  id: string;
  status: string;
  ambitionMode: string;
  founderRatingSnapshot: number | null;
  founderCommentSnapshot: string;
  buildReadySnapshot: boolean;
  ventureReadySnapshot: boolean;
  unicornPotentialSnapshot: boolean;
  topRisksSnapshot: unknown;
  committedAt: Date;
  lineage: {
    research: { id: string; name: string } | null;
    opportunity: { id: string; title: string };
    pack: { id: string; title: string; status: string };
  };
}

interface DiscoveryOpportunityRow {
  id: string;
  name: string;
  oneLiner: string;
  riskLevel: string;
  projectId: string;
  targetMarket: string | null;
  evidenceCount: number;
  opportunityScore: number;
  confidence: { level: string; value: number };
}

interface DiscoveryResultRow {
  niches: number;
  opportunities: DiscoveryOpportunityRow[];
  generation: { provider: string; model: string; mode: string };
}

export function toDiscoveryResultDto(result: DiscoveryResultRow) {
  return {
    opportunityCount: result.niches,
    opportunities: result.opportunities.map((o) => ({
      id: o.id,
      title: o.name,
      oneLiner: o.oneLiner,
      riskLevel: o.riskLevel,
      projectId: o.projectId,
      targetMarket: o.targetMarket,
      evidenceCount: o.evidenceCount,
      opportunityScore: o.opportunityScore,
      confidence: o.confidence,
    })),
    generation: { provider: result.generation.provider, model: result.generation.model, mode: result.generation.mode },
  };
}

interface FounderVerdictRow {
  rating: number | null;
  comment: string;
  decision: string;
  updatedAt: Date;
}

export function toFounderVerdictDto(verdict: FounderVerdictRow) {
  return { rating: verdict.rating, comment: verdict.comment, decision: verdict.decision, updatedAt: verdict.updatedAt };
}

interface ResearchNoteRow {
  id: string;
  title: string;
  type: string;
  content: string;
  language: string;
  createdAt: Date;
}

export function toResearchNoteDto(note: ResearchNoteRow) {
  return { id: note.id, title: note.title, type: note.type, content: note.content, language: note.language, createdAt: note.createdAt };
}

interface ExportJobRow {
  id: string;
  packId: string;
  type: string;
  language: string;
  status: string;
  errorCode: string | null;
  createdAt: Date;
  artifact?: { fileName: string; mimeType: string; sizeBytes: number } | null;
}

export function toExportJobDto(job: ExportJobRow) {
  return {
    id: job.id,
    packId: job.packId,
    type: job.type,
    language: job.language,
    status: job.status,
    errorCode: job.errorCode,
    createdAt: job.createdAt,
    artifact: job.artifact
      ? { fileName: job.artifact.fileName, mimeType: job.artifact.mimeType, sizeBytes: job.artifact.sizeBytes }
      : null,
  };
}

export function toImplementationProjectDto(project: ImplementationProjectRow) {
  return {
    id: project.id,
    status: project.status,
    ambitionMode: project.ambitionMode,
    founderRatingSnapshot: project.founderRatingSnapshot,
    founderCommentSnapshot: project.founderCommentSnapshot,
    buildReadySnapshot: project.buildReadySnapshot,
    ventureReadySnapshot: project.ventureReadySnapshot,
    unicornPotentialSnapshot: project.unicornPotentialSnapshot,
    topRisksSnapshot: project.topRisksSnapshot,
    committedAt: project.committedAt,
    lineage: project.lineage,
  };
}
