import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LlmRouterService } from '../llm/llm-router.service';
import { PackService } from './pack.service';
import type { SaveDocumentDto, ValidateAssumptionDto } from './dto/governance.dto';

type ReviewAction = 'request_review' | 'approve' | 'request_changes' | 'lock' | 'archive';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['in_review', 'archived'],
  in_review: ['approved', 'changes_requested', 'archived'],
  changes_requested: ['in_review', 'archived'],
  approved: ['locked', 'archived', 'in_review'],
  locked: ['archived'],
  archived: [],
};

const ACTION_STATUS: Record<ReviewAction, string> = {
  request_review: 'in_review',
  approve: 'approved',
  request_changes: 'changes_requested',
  lock: 'locked',
  archive: 'archived',
};

// Actions that require pack:approve permission
const APPROVE_ACTIONS: ReviewAction[] = ['approve', 'lock', 'archive'];

@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly router: LlmRouterService,
    private readonly packs: PackService,
  ) {}

  /** Save document body — creates a DocumentVersion and re-runs quality gates. */
  async saveDocument(
    workspaceId: string,
    packId: string,
    documentId: string,
    userId: string,
    dto: SaveDocumentDto,
  ) {
    const doc = await this.resolveDocument(workspaceId, packId, documentId);

    if (doc.status === 'locked') {
      throw new ForbiddenException('Document is locked. Unlock it before editing.');
    }

    const nextVersion = (doc.version ?? 0) + 1;

    // Create version snapshot of the old body before overwriting
    await this.prisma.documentVersion.create({
      data: {
        documentId,
        packId,
        workspaceId,
        version: nextVersion,
        body: dto.body,
        changeSummary: dto.changeSummary ?? 'Manual edit',
        authorId: userId,
        generatedBy: 'human',
        affectedClaimIds: (doc.metadata as { claimIds?: string[] })?.claimIds ?? ([] as unknown as Prisma.InputJsonValue),
        affectedAssumptionIds: (doc.metadata as { assumptionIds?: string[] })?.assumptionIds ?? ([] as unknown as Prisma.InputJsonValue),
      },
    });

    const updated = await this.prisma.productPackDocument.update({
      where: { id: documentId },
      data: { body: dto.body, version: nextVersion, updatedAt: new Date() },
    });

    // Re-run pack quality gates and update per-doc status
    await this.refreshQualityGates(workspaceId, packId);

    return updated;
  }

  listVersions(workspaceId: string, packId: string, documentId: string) {
    void this.resolveDocument(workspaceId, packId, documentId);
    return this.prisma.documentVersion.findMany({
      where: { documentId, packId },
      orderBy: { version: 'desc' },
    });
  }

  async getVersion(workspaceId: string, packId: string, documentId: string, versionId: string) {
    await this.resolveDocument(workspaceId, packId, documentId);
    const v = await this.prisma.documentVersion.findFirst({ where: { id: versionId, documentId } });
    if (!v) throw new NotFoundException('Version not found');
    return v;
  }

  async restoreVersion(
    workspaceId: string,
    packId: string,
    documentId: string,
    userId: string,
    versionId: string,
  ) {
    const v = await this.getVersion(workspaceId, packId, documentId, versionId);
    return this.saveDocument(workspaceId, packId, documentId, userId, {
      body: v.body,
      changeSummary: `Restored from version ${v.version}`,
    });
  }

  async setReviewStatus(
    workspaceId: string,
    packId: string,
    documentId: string,
    userId: string,
    action: ReviewAction,
    canApprove: boolean,
  ) {
    const doc = await this.resolveDocument(workspaceId, packId, documentId);

    if (APPROVE_ACTIONS.includes(action) && !canApprove) {
      throw new ForbiddenException('pack:approve permission required');
    }

    const currentStatus = doc.status ?? 'draft';
    const targetStatus = ACTION_STATUS[action];
    const allowed = VALID_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${targetStatus}`,
      );
    }

    return this.prisma.productPackDocument.update({
      where: { id: documentId },
      data: { status: targetStatus as Parameters<typeof this.prisma.productPackDocument.update>[0]['data']['status'], updatedAt: new Date() },
    });
  }

  /** Regenerate document via LLM, creating a version for the old content first. */
  async regenerateDocument(
    workspaceId: string,
    packId: string,
    documentId: string,
    userId: string,
  ) {
    const doc = await this.resolveDocument(workspaceId, packId, documentId);

    if (doc.status === 'locked') {
      throw new ForbiddenException('Document is locked.');
    }

    const newBody = await this.packs.regenerateOne(workspaceId, packId, documentId);

    const nextVersion = (doc.version ?? 0) + 1;
    await this.prisma.documentVersion.create({
      data: {
        documentId,
        packId,
        workspaceId,
        version: nextVersion,
        body: newBody,
        changeSummary: 'Regenerated',
        authorId: userId,
        generatedBy: 'llm',
        affectedClaimIds: [] as unknown as Prisma.InputJsonValue,
        affectedAssumptionIds: [] as unknown as Prisma.InputJsonValue,
      },
    });

    const updated = await this.prisma.productPackDocument.update({
      where: { id: documentId },
      data: { body: newBody, version: nextVersion, updatedAt: new Date() },
    });

    await this.refreshQualityGates(workspaceId, packId);
    return updated;
  }

  /** Regenerate all documents linked to a research update. */
  async regenerateAffected(
    workspaceId: string,
    packId: string,
    userId: string,
    researchUpdateId: string,
  ) {
    const ru = await this.prisma.researchUpdate.findFirst({
      where: { id: researchUpdateId, packId, workspaceId },
    });
    if (!ru) throw new NotFoundException('Research update not found');

    const docIds = (ru.linkedDocumentIds as string[]) ?? [];
    const results: unknown[] = [];
    for (const docId of docIds) {
      try {
        results.push(await this.regenerateDocument(workspaceId, packId, docId, userId));
      } catch (e) {
        results.push({ documentId: docId, error: String(e) });
      }
    }
    return { regenerated: results.length, results };
  }

  /** Regenerate documents that failed quality gates. */
  async regenerateWeakSections(workspaceId: string, packId: string, userId: string) {
    const docs = await this.prisma.productPackDocument.findMany({
      where: { packId },
      orderBy: { createdAt: 'asc' },
    });
    const weak = docs.filter((d) => d.qualityGateStatus === 'failed' || d.qualityGateStatus === 'warnings');
    const results: unknown[] = [];
    for (const doc of weak) {
      try {
        results.push(await this.regenerateDocument(workspaceId, packId, doc.id, userId));
      } catch (e) {
        results.push({ documentId: doc.id, error: String(e) });
      }
    }
    return { regenerated: results.length, results };
  }

  /** Update assumption validation status. */
  async validateAssumption(
    workspaceId: string,
    assumptionId: string,
    dto: ValidateAssumptionDto,
  ) {
    const assumption = await this.prisma.assumption.findFirst({
      where: { id: assumptionId, workspaceId },
    });
    if (!assumption) throw new NotFoundException('Assumption not found');

    const updated = await this.prisma.assumption.update({
      where: { id: assumptionId },
      data: { validationStatus: dto.status, updatedAt: new Date() },
    });

    // When assumption becomes contradicted/invalidated, open an unresolved question
    if (dto.status === 'contradicted' || dto.status === 'invalidated') {
      await this.prisma.unresolvedQuestion.create({
        data: {
          workspaceId,
          projectId: assumption.projectId ?? undefined,
          claimId: assumption.claimId ?? undefined,
          text: `Assumption ${dto.status}: "${assumption.text.slice(0, 120)}". ${dto.note ?? 'Review affected documents.'}`,
          language: assumption.language,
          priority: dto.status === 'invalidated' ? 'high' : 'medium',
          status: 'open',
        },
      });
    }

    return updated;
  }

  /** Get all assumptions referenced by any document in a pack. */
  async getPackAssumptions(workspaceId: string, packId: string) {
    const docs = await this.prisma.productPackDocument.findMany({
      where: { packId },
      select: { metadata: true },
    });

    const ids = new Set<string>();
    for (const d of docs) {
      const meta = d.metadata as { assumptionIds?: string[] };
      (meta?.assumptionIds ?? []).forEach((id) => ids.add(id));
    }

    if (ids.size === 0) return [];
    return this.prisma.assumption.findMany({
      where: { workspaceId, id: { in: [...ids] } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async resolveDocument(workspaceId: string, packId: string, documentId: string) {
    const pack = await this.prisma.productDocumentPack.findFirst({
      where: { id: packId, workspaceId },
    });
    if (!pack) throw new NotFoundException('Pack not found');

    const doc = await this.prisma.productPackDocument.findFirst({
      where: { id: documentId, packId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  private async refreshQualityGates(workspaceId: string, packId: string) {
    try {
      await this.packs.runGates(workspaceId, packId);
      // Update per-doc qualityGateStatus
      const gate = await this.prisma.qualityGateResult.findFirst({
        where: { packId },
        orderBy: { createdAt: 'desc' },
      });
      if (gate) {
        const status = gate.status === 'failed' ? 'failed' : gate.status === 'warnings' ? 'warnings' : 'passed';
        await this.prisma.productPackDocument.updateMany({ where: { packId }, data: { qualityGateStatus: status } });
      }
    } catch {
      // Quality gate failure must not block save
    }
  }
}
