import { Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { ExportType, LocaleCode, RoleBriefType, WhiteLabelSnapshot } from '@signalkit/shared';
import { isPdfExport, mimeTypeForExport, fileNameForExport, ROLE_BRIEF_DOCUMENTS } from '@signalkit/exports';
import { optionalEnv } from '@signalkit/config';
import { PrismaService } from '../prisma/prisma.service';
import { ExportStorageService } from './export-storage.service';
import { ExportManifestService } from './export-manifest.service';
import { ExportRendererService, type BlueprintData, type EvidenceData, type PackDocumentRow, type PackRow } from './export-renderer.service';
import { ExportPdfService } from './export-pdf.service';

interface ExportJobData {
  exportJobId: string;
  workspaceId: string;
  packId: string;
  userId: string;
}

const QUEUE_NAME = 'export-jobs';

/**
 * Manages export job lifecycle: queued → processing → ready | failed.
 * Uses BullMQ when REDIS_URL is set; runs inline otherwise (local dev/tests).
 */
@Injectable()
export class ExportJobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportJobService.name);
  private queue: Queue<ExportJobData> | null = null;
  private worker: Worker<ExportJobData> | null = null;
  private connection: IORedis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ExportStorageService,
    private readonly manifestSvc: ExportManifestService,
    private readonly renderer: ExportRendererService,
    private readonly pdf: ExportPdfService,
  ) {}

  onModuleInit(): void {
    const redisUrl = optionalEnv('REDIS_URL', '');
    if (!redisUrl) {
      this.logger.log('REDIS_URL not set — exports run inline (no queue).');
      return;
    }
    try {
      this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
      this.queue = new Queue<ExportJobData>(QUEUE_NAME, { connection: this.connection });
      this.worker = new Worker<ExportJobData>(
        QUEUE_NAME,
        async (job) => {
          await this.process(job.data.exportJobId, job.data.workspaceId);
        },
        { connection: this.connection },
      );
      this.logger.log('Exports using BullMQ queue.');
    } catch (err) {
      this.logger.warn(`Export queue init failed, falling back to inline: ${String(err)}`);
      this.queue = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Create an export job and enqueue (or inline process) it. */
  async create(
    workspaceId: string,
    packId: string,
    userId: string,
    type: ExportType,
    language: LocaleCode,
    roleBrief: RoleBriefType | null,
    applyBranding: boolean,
  ) {
    const pack = await this.prisma.productDocumentPack.findFirst({ where: { id: packId, workspaceId } });
    if (!pack) throw new NotFoundException('Pack not found');

    const job = await this.prisma.exportJob.create({
      data: { workspaceId, packId, type, language, roleBrief, applyBranding, requestedById: userId, status: 'queued', retries: 0 },
    });

    const jobData: ExportJobData = { exportJobId: job.id, workspaceId, packId, userId };

    if (this.queue) {
      await this.queue.add('export', jobData);
    } else {
      // Inline: process synchronously, don't block the HTTP response for large packs
      setImmediate(() => {
        this.process(job.id, workspaceId).catch((err: Error) => {
          this.logger.error(`Inline export failed for ${job.id}: ${err.message}`);
        });
      });
    }

    return this.getJob(workspaceId, job.id);
  }

  async getJob(workspaceId: string, exportId: string) {
    const job = await this.prisma.exportJob.findFirst({
      where: { id: exportId, workspaceId },
      include: { artifact: true },
    });
    if (!job) throw new NotFoundException('Export not found');
    return job;
  }

  async listForPack(workspaceId: string, packId: string) {
    return this.prisma.exportJob.findMany({
      where: { workspaceId, packId },
      include: { artifact: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async download(workspaceId: string, exportId: string) {
    const job = await this.prisma.exportJob.findFirst({
      where: { id: exportId, workspaceId, status: 'ready' },
      include: { artifact: true },
    });
    if (!job) throw new NotFoundException('Export not ready or not found');
    if (!job.artifact) throw new NotFoundException('Export artifact missing');
    const stream = await this.storage.stream(job.artifact.storageKey);
    return { stream, fileName: job.artifact.fileName, mimeType: job.artifact.mimeType };
  }

  async getManifest(workspaceId: string, exportId: string) {
    const job = await this.getJob(workspaceId, exportId);
    if (job.status !== 'ready' || !job.artifact) throw new NotFoundException('Manifest not available yet');
    const buf = await this.storage.read(job.artifact.storageKey.replace(/\.[^.]+$/, '') + '_manifest.json').catch(() => null);
    if (buf) return JSON.parse(buf.toString('utf-8')) as unknown;
    return { exportId, packId: job.packId, type: job.type, status: job.status };
  }

  // ── Export processing pipeline ────────────────────────────────────────────

  async process(exportJobId: string, workspaceId: string): Promise<void> {
    const job = await this.prisma.exportJob.findFirst({ where: { id: exportJobId, workspaceId } });
    if (!job) { this.logger.error(`Export job ${exportJobId} not found`); return; }

    await this.prisma.exportJob.update({ where: { id: exportJobId }, data: { status: 'processing' } });

    try {
      const { pack, documents, ev, whiteLabelSettings } = await this.gatherPackData(workspaceId, job.packId);

      const type = job.type as ExportType;
      const lang = (job.language ?? pack.primaryLanguage) as LocaleCode;
      const roleBrief = job.roleBrief as RoleBriefType | null;

      const includedDocs = this.resolveIncludedDocs(type, roleBrief, documents);
      const excludedDocs = documents.filter((d) => !includedDocs.find((i) => i.id === d.id));

      const fileList: { path: string; docType: string | null; bytes: number }[] = [];
      const manifest = this.manifestSvc.build({
        exportId: exportJobId,
        workspaceId,
        packId: job.packId,
        exportType: type,
        outputLanguage: lang,
        createdBy: job.requestedById,
        roleBriefType: roleBrief,
        whiteLabelSettings,
        pack: { version: pack.version, projectId: pack.projectId, documents },
        fileList,
        qualityGate: ev.qualityGate,
        evidence: ev.evidence,
        claims: ev.claims,
        assumptions: ev.assumptions,
        constraints: ev.constraints,
        unresolvedQuestions: ev.unresolvedQuestions,
        sourceRefs: ev.sourceRefs,
        includedDocuments: includedDocs.map((d) => d.docType),
        excludedDocuments: excludedDocs.map((d) => d.docType),
        checksum: null,
      });

      let buffer: Buffer;
      const fileName = fileNameForExport(type, pack.title, lang);

      if (isPdfExport(type)) {
        buffer = await this.pdf.render(type, pack as PackRow, documents, ev, manifest, whiteLabelSettings);
      } else if (type === 'ai_agent_engineering_bundle') {
        buffer = await this.renderer.renderAiAgentBundle(pack as PackRow, documents, ev, manifest);
      } else if (type === 'markdown_zip') {
        buffer = await this.renderer.renderMarkdownZip(pack as PackRow, documents, ev, manifest);
      } else if (type === 'json_bundle') {
        buffer = await this.renderer.renderJsonBundle(pack as PackRow, documents, ev, manifest);
      } else {
        // Role briefs and single-type exports → Markdown
        const md = roleBrief
          ? this.renderer.renderRoleBrief(roleBrief, pack as PackRow, documents, ev)
          : this.renderSingleTypeExport(type, documents, ev);
        buffer = Buffer.from(md, 'utf-8');
      }

      const checksum = this.storage.sha256(buffer);
      const mimeType = mimeTypeForExport(type);
      const storageKey = await this.storage.write(workspaceId, exportJobId, fileName, buffer);

      // Save manifest separately for quick lookup
      const manifestBuf = Buffer.from(JSON.stringify({ ...manifest, checksum }, null, 2), 'utf-8');
      await this.storage.write(workspaceId, exportJobId, fileName.replace(/\.[^.]+$/, '') + '_manifest.json', manifestBuf);

      await this.prisma.exportArtifact.create({
        data: {
          exportJobId,
          storageKey,
          fileName,
          mimeType,
          sizeBytes: buffer.length,
          checksum,
        },
      });

      await this.prisma.exportJob.update({
        where: { id: exportJobId },
        data: { status: 'ready', expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      });

      this.logger.log(`Export ${exportJobId} ready: ${fileName} (${buffer.length} bytes)`);
    } catch (err) {
      const code = err instanceof Error ? err.message.slice(0, 100) : 'unknown_error';
      this.logger.error(`Export ${exportJobId} failed: ${code}`);
      await this.prisma.exportJob.update({
        where: { id: exportJobId },
        data: { status: 'failed', errorCode: code, retries: { increment: 1 } },
      });
    }
  }

  // ── Data gathering ────────────────────────────────────────────────────────

  private async gatherPackData(workspaceId: string, packId: string) {
    const pack = await this.prisma.productDocumentPack.findFirst({
      where: { id: packId, workspaceId },
      include: { documents: { orderBy: { createdAt: 'asc' } } },
    });
    if (!pack) throw new NotFoundException('Pack not found');

    const projectId = pack.projectId;

    const [evidence, claims, assumptions, constraints, unresolvedQuestions, sourceRefs, qualityGate, researchUpdates, blueprintRow] = await Promise.all([
      this.prisma.evidenceItem.findMany({ where: { projectId }, select: { id: true, summary: true, sourceRefId: true, evidenceType: true } }),
      this.prisma.claim.findMany({ where: { projectId }, select: { id: true, text: true, type: true, confidenceLevel: true } }),
      this.prisma.assumption.findMany({ where: { projectId }, select: { id: true, text: true, validationStatus: true } }),
      this.prisma.constraint.findMany({ where: { projectId }, select: { id: true, text: true, category: true } }),
      this.prisma.unresolvedQuestion.findMany({ where: { projectId }, select: { id: true, text: true, status: true, priority: true } }),
      this.prisma.sourceReference.findMany({ where: { projectId }, select: { id: true, url: true, title: true, adapter: true } }),
      this.prisma.qualityGateResult.findFirst({ where: { packId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.researchUpdate.findMany({ where: { packId } }),
      this.prisma.buildBlueprint.findFirst({ where: { packId }, orderBy: { createdAt: 'desc' } }),
    ]);

    const wsSettings = await this.prisma.workspaceSettings.findFirst({ where: { workspaceId } });
    const whiteLabelSettings: WhiteLabelSnapshot | null = wsSettings?.whiteLabelEnabled
      ? {
          brandName: wsSettings.brandName,
          logoUrl: wsSettings.logoUrl,
          preparedBy: wsSettings.preparedBy,
          clientName: wsSettings.clientName,
          footerText: wsSettings.footerText,
          customDisclaimer: wsSettings.customDisclaimer,
          hideSignalKitBrand: wsSettings.hideSignalKitBrand,
        }
      : null;

    const ev: EvidenceData = {
      evidence,
      claims,
      assumptions,
      constraints,
      unresolvedQuestions,
      sourceRefs,
      qualityGate: qualityGate
        ? { status: qualityGate.status, passedCount: qualityGate.passedCount, warnCount: qualityGate.warnCount, failCount: qualityGate.failCount, checks: qualityGate.checks as unknown[] }
        : null,
      researchUpdates: researchUpdates.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        content: r.content,
        createdAt: r.createdAt,
      })),
      blueprint: blueprintRow
        ? ({
            screenContracts: blueprintRow.screenContracts,
            stateMatrix: blueprintRow.stateMatrix,
            apiToScreenMap: blueprintRow.apiToScreenMap,
            componentContracts: blueprintRow.componentContracts,
            permissionMatrix: blueprintRow.permissionMatrix,
            analyticsEvents: blueprintRow.analyticsEvents,
            doNotBuild: blueprintRow.doNotBuild,
            validationRules: blueprintRow.validationRules,
            buildReadinessScore: blueprintRow.buildReadinessScore,
            buildReadinessLevel: blueprintRow.buildReadinessLevel,
            buildReadinessBreakdown: blueprintRow.buildReadinessBreakdown,
            warnings: blueprintRow.warnings,
          } as unknown as BlueprintData)
        : null,
    };

    const documents: PackDocumentRow[] = pack.documents.map((d) => ({
      id: d.id,
      docType: d.docType,
      title: d.title,
      body: d.body,
      language: d.language,
      metadata: d.metadata,
    }));

    return { pack, documents, ev, whiteLabelSettings };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private resolveIncludedDocs(type: ExportType, roleBrief: RoleBriefType | null, documents: PackDocumentRow[]): PackDocumentRow[] {
    const docMap = new Map(documents.map((d) => [d.docType, d]));

    if (roleBrief) {
      const roleDocs = ROLE_BRIEF_DOCUMENTS[roleBrief] as string[];
      return roleDocs.map((dt: string) => docMap.get(dt)).filter((d): d is PackDocumentRow => d !== undefined);
    }

    const subsets: Partial<Record<ExportType, string[]>> = {
      evidence_appendix: ['evidence_map', 'risks_and_assumptions', 'research_questions'],
      source_appendix: ['source_appendix'],
      pm_brief: ['target_audience_icp', 'jobs_to_be_done', 'user_scenarios', 'mvp_scope', 'feature_checklist', 'acceptance_criteria', 'analytics_plan'],
      designer_brd: ['product_vision', 'target_audience_icp', 'user_scenarios', 'ux_flow', 'screen_map', 'design_brd', 'acceptance_criteria'],
      frontend_brd: ['ux_flow', 'screen_map', 'frontend_brd', 'api_requirements', 'acceptance_criteria', 'data_model'],
      backend_brd: ['backend_brd', 'data_model', 'api_requirements', 'feature_checklist', 'acceptance_criteria', 'risks_and_assumptions'],
      growth_brief: ['market_context', 'target_audience_icp', 'jobs_to_be_done', 'monetization_plan', 'go_to_market_plan', 'analytics_plan'],
      sales_brief: ['target_audience_icp', 'problem_map', 'market_context', 'monetization_plan', 'risks_and_assumptions'],
    };

    const subset = subsets[type];
    if (subset) {
      return subset.map((dt: string) => docMap.get(dt)).filter((d): d is PackDocumentRow => d !== undefined);
    }

    return documents; // full pack types
  }

  private renderSingleTypeExport(type: ExportType, documents: PackDocumentRow[], ev: EvidenceData): string {
    if (type === 'evidence_appendix') return this.renderer.renderEvidenceAppendix(ev);
    if (type === 'source_appendix') return this.renderer.renderSourceAppendix(ev.sourceRefs);
    // For all other types, combine included docs
    const docs = documents;
    return docs.map((d) => `# ${d.title}\n\n${d.body}`).join('\n\n---\n\n');
  }
}
