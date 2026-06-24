import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditLogAction } from '@signalkit/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordAuditInput {
  workspaceId: string;
  action: AuditLogAction;
  actorId?: string | null;
  subjectType: string;
  subjectId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a critical action. Metadata must never contain secrets — callers are
   * responsible for redaction (see docs/SECURITY.md).
   */
  async record(input: RecordAuditInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        action: input.action,
        actorId: input.actorId ?? null,
        subjectType: input.subjectType,
        subjectId: input.subjectId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }

  /** Paginated audit log for a workspace, newest first. */
  async list(workspaceId: string, page = 1, pageSize = 50) {
    const take = Math.min(Math.max(pageSize, 1), 200);
    const skip = (Math.max(page, 1) - 1) * take;
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.auditLog.count({ where: { workspaceId } }),
    ]);
    return { items, total, page, pageSize: take };
  }
}
