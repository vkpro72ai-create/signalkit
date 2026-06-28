import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LlmUsageService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recent usage plus aggregates by provider, model, task, project and failures. */
  async summary(workspaceId: string) {
    const where = { workspaceId };
    const [recent, byProvider, byModel, byTask, byProject, totals, failures, slowest, mostExpensive] =
      await Promise.all([
        this.prisma.lLMUsageLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
        this.prisma.lLMUsageLog.groupBy({
          by: ['provider'],
          where,
          _sum: { estimatedCost: true, inputTokens: true, outputTokens: true },
          _count: true,
        }),
        this.prisma.lLMUsageLog.groupBy({
          by: ['model'],
          where,
          _sum: { estimatedCost: true },
          _count: true,
        }),
        this.prisma.lLMUsageLog.groupBy({ by: ['taskType'], where, _sum: { estimatedCost: true }, _count: true }),
        this.prisma.lLMUsageLog.groupBy({ by: ['projectId'], where, _sum: { estimatedCost: true }, _count: true }),
        this.prisma.lLMUsageLog.aggregate({
          where,
          _sum: { estimatedCost: true, inputTokens: true, outputTokens: true },
          _count: true,
        }),
        this.prisma.lLMUsageLog.count({ where: { workspaceId, status: { not: 'success' } } }),
        this.prisma.lLMUsageLog.findMany({ where, orderBy: { latencyMs: 'desc' }, take: 5 }),
        this.prisma.lLMUsageLog.findMany({ where, orderBy: { estimatedCost: 'desc' }, take: 5 }),
      ]);
    return { recent, byProvider, byModel, byTask, byProject, totals, failures, slowest, mostExpensive };
  }
}
