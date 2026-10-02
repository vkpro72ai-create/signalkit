import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ClaimType, SignalType, SourceAdapterType } from '@signalkit/shared';
import { assessClaim, isClaimGrounded } from '@signalkit/evidence';
import { PrismaService } from '../prisma/prisma.service';
import { listAdapterDescriptors } from '../sources/adapters';
import type {
  CreateClaimDto,
  CreateAssumptionDto,
  CreateQuestionDto,
  LinkEvidenceDto,
} from './dto/evidence.dto';

/** Signal → (evidenceType, claimType) so synthesized claims stay traceable. */
const SIGNAL_MAP: Record<SignalType, { evidenceType: string; claimType: ClaimType }> = {
  demand: { evidenceType: 'observation', claimType: 'market_demand' },
  pain: { evidenceType: 'observation', claimType: 'user_pain' },
  competitor: { evidenceType: 'competitor_fact', claimType: 'competition' },
  pricing: { evidenceType: 'pricing', claimType: 'willingness_to_pay' },
  regulatory: { evidenceType: 'regulation', claimType: 'regulatory_risk' },
  technology_shift: { evidenceType: 'observation', claimType: 'technology_shift' },
  audience: { evidenceType: 'observation', claimType: 'local_fit' },
  distribution: { evidenceType: 'observation', claimType: 'distribution_access' },
  timing: { evidenceType: 'observation', claimType: 'timing' },
};

/** Adapters that scan public sources automatically (as opposed to manual URL/note add). */
const AUTO_SCAN_ADAPTERS: SourceAdapterType[] = ['search_result', 'reddit', 'product_hunt', 'app_store_review'];

/** Env var each auto-scan adapter reads its key from — surfaced to the UI as a concrete next step. */
const ADAPTER_ENV_VAR: Partial<Record<SourceAdapterType, string>> = {
  search_result: 'SEARCH_API_KEY',
  reddit: 'REDDIT_API_TOKEN',
  product_hunt: 'PRODUCT_HUNT_TOKEN',
  app_store_review: 'APP_STORE_FEED_KEY',
};

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build evidence from the project's collected signals and synthesize grounded
   * claims. Every EvidenceItem traces to a real SourceReference; every Claim is
   * backed by ≥1 evidence item (never fabricated). Idempotent: re-running clears
   * prior system-generated evidence/claims first.
   */
  async synthesize(workspaceId: string, projectId: string) {
    const project = await this.requireProject(workspaceId, projectId);
    const signals = await this.prisma.trendSignal.findMany({ where: { workspaceId, projectId } });

    // Idempotency: remove prior system-generated graph for this project.
    await this.prisma.claim.deleteMany({ where: { projectId, generatedBy: 'system' } });
    await this.prisma.evidenceItem.deleteMany({ where: { projectId } });

    const groups = new Map<ClaimType, string[]>(); // claimType → evidenceIds
    for (const signal of signals) {
      const sourceRefId = signal.sourceRefIds[0];
      if (!sourceRefId) continue; // no source → no evidence (never fabricate)
      const map = SIGNAL_MAP[signal.signalType as SignalType] ?? SIGNAL_MAP.demand;
      const evidence = await this.prisma.evidenceItem.create({
        data: {
          workspaceId,
          projectId,
          sourceRefId,
          evidenceType: map.evidenceType,
          originalText: signal.text,
          summary: signal.text,
          summaryLanguage: project.marketLanguage,
          country: project.targetCountry,
          relevanceScore: signal.strengthScore,
          freshnessScore: signal.freshnessScore,
          sourceQuality: signal.sourceQuality,
          extractionMethod: 'rule_based',
        },
      });
      const list = groups.get(map.claimType) ?? [];
      list.push(evidence.id);
      groups.set(map.claimType, list);
    }

    let claims = 0;
    for (const [claimType, evidenceIds] of groups) {
      await this.persistClaim({
        workspaceId,
        projectId,
        text: claimSummary(claimType, evidenceIds.length, project.targetCountry),
        type: claimType,
        market: project.targetCountry,
        language: project.marketLanguage,
        supportingEvidenceIds: evidenceIds,
        contradictingEvidenceIds: [],
        assumptionIds: [],
        generatedBy: 'system',
      });
      claims += 1;
    }

    return { evidence: signals.length, claims };
  }

  /**
   * Contextual evidence scan for an opportunity. Honest by construction: it
   * synthesizes grounded claims from whatever public signals have already been
   * ingested for the opportunity's research context, and reports the true state
   * of automatic public-source scanning (the external adapters are stubs until
   * an API key is configured — never fabricate claims). Returns one of:
   * claims_found | no_strong_claims | configuration_needed | failed.
   */
  async scanForNiche(workspaceId: string, nicheId: string) {
    const niche = await this.prisma.niche.findFirst({
      where: { id: nicheId, workspaceId },
      select: { id: true, projectId: true },
    });
    if (!niche) throw new NotFoundException('Opportunity not found');
    const projectId = niche.projectId;

    // Automatic public-source scanning depends on the external adapters. Report
    // their real configuration status so the UI can point the user at Settings.
    const adapters = listAdapterDescriptors().filter((a) => AUTO_SCAN_ADAPTERS.includes(a.type));
    const configured = adapters.filter((a) => a.configured);
    const missingConfiguration = adapters
      .filter((a) => !a.configured)
      .map((a) => ({
        type: a.type,
        name: a.name,
        envVar: ADAPTER_ENV_VAR[a.type] ?? null,
        hint: `To enable auto-scan via ${a.name}, configure ${ADAPTER_ENV_VAR[a.type] ?? 'its API key'} in Settings.`,
      }));

    try {
      const result = await this.synthesize(workspaceId, projectId);
      const [evidenceItems, claimRows, assumptions, unresolvedQuestions] = await Promise.all([
        this.prisma.evidenceItem.count({ where: { projectId } }),
        this.prisma.claim.findMany({ where: { projectId }, select: { id: true, confidenceLevel: true } }),
        this.prisma.assumption.count({ where: { projectId } }),
        this.prisma.unresolvedQuestion.count({ where: { projectId } }),
      ]);
      const contradictions = claimRows.length
        ? await this.prisma.contradiction.count({ where: { claimId: { in: claimRows.map((c) => c.id) } } })
        : 0;
      const verifiedClaims = claimRows.filter((c) => c.confidenceLevel === 'high' || c.confidenceLevel === 'medium').length;

      let status: 'claims_found' | 'no_strong_claims' | 'configuration_needed';
      if (result.claims > 0) status = 'claims_found';
      else if (configured.length === 0) status = 'configuration_needed';
      else status = 'no_strong_claims';

      return {
        status,
        signalsScanned: result.evidence,
        evidenceItems,
        claims: claimRows.length,
        verifiedClaims,
        assumptions,
        unresolvedQuestions,
        contradictions,
        autoScanAdapters: adapters.map((a) => ({ type: a.type, name: a.name, configured: a.configured })),
        missingConfiguration,
      };
    } catch (err) {
      this.logger.warn(`Evidence scan failed for niche ${nicheId}: ${String(err)}`);
      return {
        status: 'failed' as const,
        message: err instanceof Error ? err.message : String(err),
        autoScanAdapters: adapters.map((a) => ({ type: a.type, name: a.name, configured: a.configured })),
        missingConfiguration,
      };
    }
  }

  /** Create a claim explicitly — REFUSED if it has neither evidence nor an assumption. */
  async createClaim(workspaceId: string, dto: CreateClaimDto) {
    await this.requireProject(workspaceId, dto.projectId);
    return this.persistClaim({
      workspaceId,
      projectId: dto.projectId,
      text: dto.text,
      type: dto.type,
      market: dto.market ?? null,
      language: dto.language ?? 'en',
      supportingEvidenceIds: dto.supportingEvidenceIds ?? [],
      contradictingEvidenceIds: dto.contradictingEvidenceIds ?? [],
      assumptionIds: dto.assumptionIds ?? [],
      generatedBy: dto.generatedBy ?? 'human',
    });
  }

  private async persistClaim(input: {
    workspaceId: string;
    projectId: string;
    text: string;
    type: ClaimType;
    market: string | null;
    language: string;
    supportingEvidenceIds: string[];
    contradictingEvidenceIds: string[];
    assumptionIds: string[];
    generatedBy: string;
  }) {
    // THE trust rule: no claim without a source or an assumption.
    if (
      !isClaimGrounded({
        supportingEvidenceCount: input.supportingEvidenceIds.length,
        assumptionCount: input.assumptionIds.length,
      })
    ) {
      throw new BadRequestException({
        code: 'claim_requires_grounding',
        message: 'A claim must have at least one supporting evidence item or be marked as an assumption.',
      });
    }

    const supporting = await this.prisma.evidenceItem.findMany({
      where: { id: { in: input.supportingEvidenceIds } },
    });
    const contradicting = await this.prisma.evidenceItem.findMany({
      where: { id: { in: input.contradictingEvidenceIds } },
    });
    const hasOpenContradiction = contradicting.length > 0;
    const assessment = assessClaim({
      supporting: supporting as never,
      contradicting: contradicting as never,
      assumptionCount: input.assumptionIds.length,
      hasOpenContradiction,
    });

    const claim = await this.prisma.claim.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        text: input.text,
        type: input.type,
        market: input.market,
        language: input.language,
        generatedBy: input.generatedBy,
        confidenceValue: assessment.confidence.value,
        confidenceLevel: assessment.confidence.level,
      },
    });

    for (const id of input.supportingEvidenceIds) {
      await this.prisma.claimEvidenceLink.create({ data: { claimId: claim.id, evidenceItemId: id, role: 'supports' } });
    }
    for (const id of input.contradictingEvidenceIds) {
      await this.prisma.claimEvidenceLink.create({ data: { claimId: claim.id, evidenceItemId: id, role: 'contradicts' } });
    }
    // Contradictions are never hidden — record one and suggest a research question.
    if (hasOpenContradiction) {
      await this.prisma.contradiction.create({
        data: {
          claimId: claim.id,
          conflictingEvidenceIds: input.contradictingEvidenceIds,
          reason: 'Conflicting evidence linked to this claim.',
          suggestedQuestion: `What explains the conflicting evidence for: "${input.text.slice(0, 80)}"?`,
        },
      });
    }
    for (const assumptionId of input.assumptionIds) {
      await this.prisma.assumption.updateMany({ where: { id: assumptionId }, data: { claimId: claim.id } });
    }

    return { claim, assessment };
  }

  /** Link an additional evidence item to a claim and recompute confidence. */
  async linkEvidence(workspaceId: string, dto: LinkEvidenceDto) {
    const claim = await this.requireClaim(workspaceId, dto.claimId);
    await this.prisma.claimEvidenceLink.upsert({
      where: { claimId_evidenceItemId: { claimId: claim.id, evidenceItemId: dto.evidenceItemId } },
      update: { role: dto.role },
      create: { claimId: claim.id, evidenceItemId: dto.evidenceItemId, role: dto.role },
    });
    return this.recompute(claim.id);
  }

  /** Recompute a claim's confidence from its current links + assumptions. */
  async recompute(claimId: string) {
    const links = await this.prisma.claimEvidenceLink.findMany({ where: { claimId } });
    const supportingIds = links.filter((l) => l.role === 'supports').map((l) => l.evidenceItemId);
    const contradictingIds = links.filter((l) => l.role === 'contradicts').map((l) => l.evidenceItemId);
    const [supporting, contradicting, assumptionCount, openContradictions] = await Promise.all([
      this.prisma.evidenceItem.findMany({ where: { id: { in: supportingIds } } }),
      this.prisma.evidenceItem.findMany({ where: { id: { in: contradictingIds } } }),
      this.prisma.assumption.count({ where: { claimId } }),
      this.prisma.contradiction.count({ where: { claimId, resolved: false } }),
    ]);
    const assessment = assessClaim({
      supporting: supporting as never,
      contradicting: contradicting as never,
      assumptionCount,
      hasOpenContradiction: openContradictions > 0,
    });
    const claim = await this.prisma.claim.update({
      where: { id: claimId },
      data: { confidenceValue: assessment.confidence.value, confidenceLevel: assessment.confidence.level },
    });
    return { claim, assessment };
  }

  async createAssumption(workspaceId: string, dto: CreateAssumptionDto) {
    await this.requireProject(workspaceId, dto.projectId);
    return this.prisma.assumption.create({
      data: {
        workspaceId,
        projectId: dto.projectId,
        claimId: dto.claimId ?? null,
        text: dto.text,
        rationale: dto.rationale ?? '',
        impactIfWrong: dto.impactIfWrong ?? 'medium',
        language: dto.language ?? 'en',
      },
    });
  }

  async createQuestion(workspaceId: string, dto: CreateQuestionDto) {
    await this.requireProject(workspaceId, dto.projectId);
    return this.prisma.unresolvedQuestion.create({
      data: {
        workspaceId,
        projectId: dto.projectId,
        claimId: dto.claimId ?? null,
        text: dto.text,
        priority: dto.priority ?? 'medium',
        language: dto.language ?? 'en',
      },
    });
  }

  /** The full evidence graph for a project, with per-claim assessment. */
  async graph(workspaceId: string, projectId: string) {
    await this.requireProject(workspaceId, projectId);
    const [evidence, claims, assumptions, questions, contradictions] = await Promise.all([
      this.prisma.evidenceItem.findMany({ where: { projectId }, orderBy: { relevanceScore: 'desc' } }),
      this.prisma.claim.findMany({ where: { projectId }, include: { evidenceLinks: true, contradictions: true } }),
      this.prisma.assumption.findMany({ where: { projectId } }),
      this.prisma.unresolvedQuestion.findMany({ where: { projectId } }),
      this.prisma.contradiction.findMany({ where: { claim: { projectId } } }),
    ]);

    const evidenceById = new Map(evidence.map((e) => [e.id, e]));
    const claimsWithAssessment = claims.map((c) => {
      const supporting = c.evidenceLinks.filter((l) => l.role === 'supports').map((l) => evidenceById.get(l.evidenceItemId)).filter(Boolean);
      const contradicting = c.evidenceLinks.filter((l) => l.role === 'contradicts').map((l) => evidenceById.get(l.evidenceItemId)).filter(Boolean);
      const assessment = assessClaim({
        supporting: supporting as never,
        contradicting: contradicting as never,
        assumptionCount: assumptions.filter((a) => a.claimId === c.id).length,
        hasOpenContradiction: c.contradictions.some((x) => !x.resolved),
      });
      return {
        ...c,
        supportingEvidence: supporting,
        contradictingEvidence: contradicting,
        assessment,
      };
    });

    return { evidence, claims: claimsWithAssessment, assumptions, questions, contradictions };
  }

  /** Evidence map for exports (Session 12): claims → evidence → source, with status. */
  async evidenceMap(workspaceId: string, projectId: string) {
    const { claims, assumptions, questions } = await this.graph(workspaceId, projectId);
    return {
      projectId,
      generatedAt: new Date().toISOString(),
      claims: claims.map((c) => ({
        id: c.id,
        text: c.text,
        type: c.type,
        confidence: { value: c.confidenceValue, level: c.confidenceLevel },
        grounding: c.assessment.grounding,
        weak: c.assessment.weak,
        supportingEvidence: c.supportingEvidence.map((e) => ({ id: e!.id, summary: e!.summary, sourceRefId: e!.sourceRefId })),
        contradicting: c.contradictingEvidence.map((e) => ({ id: e!.id, summary: e!.summary })),
      })),
      assumptions,
      unresolvedQuestions: questions,
    };
  }

  private async requireProject(workspaceId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async requireClaim(workspaceId: string, claimId: string) {
    const claim = await this.prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.workspaceId !== workspaceId) throw new ForbiddenException('Claim belongs to another workspace');
    return claim;
  }
}

function claimSummary(type: ClaimType, n: number, country: string | null): string {
  const where = country ? ` for ${country}` : '';
  return `${n} ${type.replace(/_/g, ' ')} signal${n === 1 ? '' : 's'} collected${where}.`;
}
