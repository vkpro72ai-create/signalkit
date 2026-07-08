import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IngestionService } from './ingestion.service';
import { listAdapterDescriptors } from './adapters';
import type { AddSourceDto } from './dto/source.dto';

type SourceStatus = 'pending' | 'collected' | 'parsed' | 'failed' | 'excluded';

@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
  ) {}

  /** Adapter catalog with live configuration status (for the UI). */
  adapters() {
    return listAdapterDescriptors();
  }

  /** Register a source and kick off ingestion (queued or inline). */
  async add(workspaceId: string, projectId: string, dto: AddSourceDto) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw new NotFoundException('Project not found');

    const ref = await this.prisma.sourceReference.create({
      data: {
        workspaceId,
        projectId,
        adapter: dto.adapterType,
        url: dto.url ?? null,
        title: dto.title ?? null,
        userProvided: dto.adapterType === 'manual',
      },
    });

    const outcome = await this.ingestion.enqueue(ref.id, dto.content ?? null);
    return { source: ref, outcome };
  }

  /** List sources for a project with derived status, quality and freshness. */
  async list(workspaceId: string, projectId: string) {
    const refs = await this.prisma.sourceReference.findMany({
      where: { workspaceId, projectId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      refs.map(async (ref) => {
        const raws = await this.prisma.rawSourceItem.findMany({ where: { sourceRefId: ref.id } });
        const signals = await this.prisma.trendSignal.findMany({
          where: { projectId, sourceRefIds: { has: ref.id } },
        });
        return {
          ...ref,
          status: deriveStatus(raws),
          itemCount: raws.length,
          signalCount: signals.length,
          quality: avg(signals.map((s) => s.sourceQuality)),
          freshness: avg(signals.map((s) => s.freshnessScore)),
        };
      }),
    );
  }

  /** Trend signals extracted for a project. */
  signals(workspaceId: string, projectId: string) {
    return this.prisma.trendSignal.findMany({
      where: { workspaceId, projectId },
      orderBy: { strengthScore: 'desc' },
    });
  }

  async retry(workspaceId: string, sourceId: string) {
    const ref = await this.requireRef(workspaceId, sourceId);
    // Manual sources keep their original content in the surviving raw item.
    const existing = await this.prisma.rawSourceItem.findFirst({
      where: { sourceRefId: ref.id, status: { not: 'failed' } },
    });
    return this.ingestion.enqueue(ref.id, ref.adapter === 'manual' ? existing?.content ?? null : null);
  }

  async exclude(workspaceId: string, sourceId: string) {
    const ref = await this.requireRef(workspaceId, sourceId);
    await this.prisma.rawSourceItem.updateMany({ where: { sourceRefId: ref.id }, data: { status: 'excluded' } });
    await this.prisma.trendSignal.deleteMany({ where: { projectId: ref.projectId, sourceRefIds: { has: ref.id } } });
    return { ok: true };
  }

  private async requireRef(workspaceId: string, sourceId: string) {
    const ref = await this.prisma.sourceReference.findUnique({ where: { id: sourceId } });
    if (!ref) throw new NotFoundException('Source not found');
    if (ref.workspaceId !== workspaceId) throw new ForbiddenException('Source belongs to another workspace');
    return ref;
  }
}

function deriveStatus(raws: { status: string }[]): SourceStatus {
  if (raws.length === 0) return 'pending';
  if (raws.every((r) => r.status === 'excluded')) return 'excluded';
  if (raws.some((r) => r.status === 'parsed')) return 'parsed';
  if (raws.some((r) => r.status === 'failed')) return 'failed';
  return 'collected';
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;
}
