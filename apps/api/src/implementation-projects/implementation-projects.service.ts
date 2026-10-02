import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  PromoteToProjectDto,
  UpdateImplementationProjectDto,
  UpsertFounderVerdictDto,
} from './dto/implementation-project.dto';

/**
 * Human decision layer.
 *
 * Keeps three things deliberately separate:
 *  - AI scoring (NicheScore / VentureThesis) — untouched here.
 *  - A founder's personal, per-user verdict on an opportunity.
 *  - A real, founder-committed ImplementationProject, created ONLY via the
 *    explicit two-gate promotion flow (Build-Ready pack + founder commitment).
 *
 * A high AI score never auto-promotes anything.
 */
@Injectable()
export class ImplementationProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private readonly projectInclude = {
    niche: { select: { id: true, title: true, projectId: true } },
    pack: { select: { id: true, title: true, status: true } },
    researchProject: { select: { id: true, name: true } },
    createdBy: { select: { id: true, displayName: true, email: true } },
  } satisfies Prisma.ImplementationProjectInclude;

  // ── Founder verdict (per niche, per user) ──────────────────────────────────

  async getFounderVerdict(workspaceId: string, nicheId: string, userId: string) {
    await this.assertNiche(workspaceId, nicheId);
    const [mine, others] = await Promise.all([
      this.prisma.opportunityFounderVerdict.findUnique({ where: { nicheId_userId: { nicheId, userId } } }),
      this.prisma.opportunityFounderVerdict.findMany({
        where: { nicheId, NOT: { userId } },
        include: { user: { select: { id: true, displayName: true, email: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    // `mine` and `others` are kept separate so the UI can show the current
    // founder's own rating distinctly from advisory ratings by co-founders.
    return { mine: mine ?? null, others };
  }

  /** PUT semantics: the payload replaces the founder's verdict wholesale. */
  async upsertFounderVerdict(
    workspaceId: string,
    nicheId: string,
    userId: string,
    dto: UpsertFounderVerdictDto,
  ) {
    await this.assertNiche(workspaceId, nicheId);
    const rating = dto.rating ?? null;
    const comment = dto.comment ?? '';
    const decision = dto.decision ?? 'undecided';
    return this.prisma.opportunityFounderVerdict.upsert({
      where: { nicheId_userId: { nicheId, userId } },
      create: { workspaceId, nicheId, userId, rating, comment, decision },
      update: { rating, comment, decision },
    });
  }

  // ── Readiness derivation (badges only — never gates buildReady) ────────────

  /**
   * buildReady is authoritative from the generation job. ventureReady and
   * unicornPotential are SEPARATE, derived signals — a cash-flow business can
   * be fully Build-Ready with neither. Derived from the (structured, queryable)
   * Venture Scale level so we never parse markdown or fabricate a claim.
   */
  private async deriveReadiness(workspaceId: string, nicheId: string, packId: string) {
    const [job, gate, venture] = await Promise.all([
      this.prisma.productPackGenerationJob.findFirst({
        where: { packId, workspaceId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.qualityGateResult.findFirst({ where: { packId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.ventureThesis.findFirst({ where: { nicheId }, orderBy: { createdAt: 'desc' } }),
    ]);
    const buildReady = Boolean(job?.buildReady) && gate?.status !== 'failed';
    const level = venture?.ventureScaleLevel ?? 'low';
    const ventureReady = level === 'medium' || level === 'high';
    const unicornPotential = level === 'high';
    return { job, gate, venture, buildReady, ventureReady, unicornPotential };
  }

  async readinessForPack(workspaceId: string, packId: string) {
    const pack = await this.prisma.productDocumentPack.findFirst({ where: { id: packId, workspaceId } });
    if (!pack) throw new NotFoundException('Pack not found');
    const r = await this.deriveReadiness(workspaceId, pack.nicheId, packId);
    return {
      buildReady: r.buildReady,
      ventureReady: r.ventureReady,
      unicornPotential: r.unicornPotential,
      qualityGateStatus: r.gate?.status ?? 'not_run',
      ventureScaleLevel: r.venture?.ventureScaleLevel ?? 'low',
      topRisks: extractTopRisks(r.venture),
      promotable: r.buildReady,
      alreadyPromoted: Boolean(await this.prisma.implementationProject.findUnique({ where: { packId } })),
    };
  }

  // ── Promotion gate (two gates: system + founder) ───────────────────────────

  async promote(workspaceId: string, packId: string, userId: string, dto: PromoteToProjectDto) {
    const pack = await this.prisma.productDocumentPack.findFirst({ where: { id: packId, workspaceId } });
    if (!pack) throw new NotFoundException('Pack not found');

    // Idempotent: one implementation project per pack.
    const existing = await this.prisma.implementationProject.findUnique({
      where: { packId },
      include: this.projectInclude,
    });
    if (existing) return existing;

    const r = await this.deriveReadiness(workspaceId, pack.nicheId, packId);

    // System gate.
    if (!r.buildReady) {
      throw new ConflictException({
        code: 'not_build_ready',
        message: 'This pack is not Build-Ready yet. Complete generation and pass the quality gate before promoting.',
      });
    }

    // Founder gate.
    if (!dto.commitmentConfirmed || !dto.reviewedRisks) {
      throw new UnprocessableEntityException({
        code: 'commitment_required',
        message: 'Explicit founder commitment and risk review are required to create an implementation project.',
      });
    }
    const verdict = await this.prisma.opportunityFounderVerdict.findUnique({
      where: { nicheId_userId: { nicheId: pack.nicheId, userId } },
    });
    if (!verdict || verdict.rating == null) {
      throw new UnprocessableEntityException({
        code: 'founder_verdict_required',
        message: 'Provide your own founder rating for this opportunity before promoting it.',
      });
    }

    const created = await this.prisma.implementationProject.create({
      data: {
        workspaceId,
        researchProjectId: pack.projectId,
        nicheId: pack.nicheId,
        packId,
        founderRatingSnapshot: verdict.rating,
        founderCommentSnapshot: verdict.comment,
        ambitionMode: dto.ambitionMode,
        buildReadySnapshot: r.buildReady,
        ventureReadySnapshot: r.ventureReady,
        unicornPotentialSnapshot: r.unicornPotential,
        topRisksSnapshot: extractTopRisks(r.venture) as unknown as Prisma.InputJsonValue,
        createdById: userId,
      },
      include: this.projectInclude,
    });

    // The research context did its job — an opportunity got picked and
    // committed. Archive it so the "Opportunity Search" list stays down to
    // searches still in progress; the promoted niche/pack/verdict stay
    // reachable from here (ImplementationProject.researchProjectId) as the
    // provenance trail, not from the research list itself.
    await this.prisma.project.update({
      where: { id: pack.projectId },
      data: { status: 'archived' },
    });

    await this.audit.record({
      workspaceId,
      action: 'implementation_project.promoted',
      actorId: userId,
      subjectType: 'implementation_project',
      subjectId: created.id,
      metadata: { packId, nicheId: pack.nicheId, ambitionMode: dto.ambitionMode },
    });

    return created;
  }

  // ── Implementation project reads / status ──────────────────────────────────

  list(workspaceId: string) {
    return this.prisma.implementationProject.findMany({
      where: { workspaceId },
      orderBy: { committedAt: 'desc' },
      include: this.projectInclude,
    });
  }

  async get(workspaceId: string, id: string) {
    const project = await this.prisma.implementationProject.findFirst({
      where: { id, workspaceId },
      include: this.projectInclude,
    });
    if (!project) throw new NotFoundException('Implementation project not found');
    return {
      ...project,
      lineage: {
        research: project.researchProject,
        opportunity: { id: project.niche.id, title: project.niche.title },
        pack: project.pack,
        project: { id: project.id },
      },
    };
  }

  async update(workspaceId: string, id: string, userId: string, dto: UpdateImplementationProjectDto) {
    await this.get(workspaceId, id);
    const updated = await this.prisma.implementationProject.update({
      where: { id },
      data: { status: dto.status },
      include: this.projectInclude,
    });
    await this.audit.record({
      workspaceId,
      action: 'implementation_project.updated',
      actorId: userId,
      subjectType: 'implementation_project',
      subjectId: id,
      metadata: { status: dto.status },
    });
    return updated;
  }

  // ── Lineage (feeds the LineageBar: Research → Opportunity → Pack → Project) ─

  async lineageForNiche(workspaceId: string, nicheId: string) {
    const niche = await this.prisma.niche.findFirst({
      where: { id: nicheId, workspaceId },
      include: {
        project: { select: { id: true, name: true } },
        packs: { select: { id: true, title: true, status: true }, orderBy: { createdAt: 'desc' } },
        implementationProjects: { select: { id: true, status: true }, orderBy: { committedAt: 'desc' } },
      },
    });
    if (!niche) throw new NotFoundException('Opportunity not found');
    return {
      research: niche.project,
      opportunity: { id: niche.id, title: niche.title },
      packs: niche.packs,
      project: niche.implementationProjects[0] ?? null,
    };
  }

  async lineageForPack(workspaceId: string, packId: string) {
    const pack = await this.prisma.productDocumentPack.findFirst({
      where: { id: packId, workspaceId },
      include: {
        niche: { select: { id: true, title: true, project: { select: { id: true, name: true } } } },
        implementationProject: { select: { id: true, status: true } },
      },
    });
    if (!pack) throw new NotFoundException('Pack not found');
    return {
      research: pack.niche.project,
      opportunity: { id: pack.niche.id, title: pack.niche.title },
      pack: { id: pack.id, title: pack.title, status: pack.status },
      project: pack.implementationProject ?? null,
    };
  }

  private async assertNiche(workspaceId: string, nicheId: string) {
    const niche = await this.prisma.niche.findFirst({ where: { id: nicheId, workspaceId }, select: { id: true } });
    if (!niche) throw new NotFoundException('Opportunity not found');
    return niche;
  }
}

/**
 * Freeze the founder-facing top risks at promotion time from the (already
 * computed, honest) Venture Thesis. Never invents risks; returns [] if the
 * thesis has none.
 */
function extractTopRisks(venture: { thesis?: unknown; whatMustBeTrue?: unknown } | null): string[] {
  if (!venture) return [];
  const out: string[] = [];
  const thesis = venture.thesis;
  if (thesis && typeof thesis === 'object') {
    const killReasons = (thesis as Record<string, unknown>).killReasons;
    if (Array.isArray(killReasons)) {
      for (const k of killReasons) {
        if (typeof k === 'string') out.push(k);
        else if (k && typeof k === 'object' && typeof (k as Record<string, unknown>).reason === 'string') {
          out.push((k as Record<string, unknown>).reason as string);
        }
      }
    }
  }
  if (out.length === 0 && Array.isArray(venture.whatMustBeTrue)) {
    for (const w of venture.whatMustBeTrue) {
      if (typeof w === 'string') out.push(w);
      else if (w && typeof w === 'object' && typeof (w as Record<string, unknown>).statement === 'string') {
        out.push((w as Record<string, unknown>).statement as string);
      }
    }
  }
  return out.slice(0, 8);
}
