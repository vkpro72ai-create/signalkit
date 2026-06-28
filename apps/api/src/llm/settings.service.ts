import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UpdateLlmSettingsDto } from './dto/llm.dto';

@Injectable()
export class LlmSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Workspace LLM settings, creating defaults if absent. */
  async get(workspaceId: string) {
    const existing = await this.prisma.workspaceLLMSettings.findUnique({ where: { workspaceId } });
    return existing ?? this.prisma.workspaceLLMSettings.create({ data: { workspaceId } });
  }

  async update(dto: UpdateLlmSettingsDto, userId: string) {
    await this.get(dto.workspaceId);
    const updated = await this.prisma.workspaceLLMSettings.update({
      where: { workspaceId: dto.workspaceId },
      data: {
        ...(dto.mode ? { mode: dto.mode } : {}),
        ...(dto.defaultModelId !== undefined ? { defaultModelId: dto.defaultModelId } : {}),
        ...(dto.fallbackModelId !== undefined ? { fallbackModelId: dto.fallbackModelId } : {}),
        ...(dto.routingRules ? { routingRules: dto.routingRules as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    await this.audit.record({
      workspaceId: dto.workspaceId,
      action: 'llm.settings_updated',
      actorId: userId,
      subjectType: 'WorkspaceLLMSettings',
      subjectId: updated.id,
      metadata: { changedKeys: Object.keys(dto).filter((k) => k !== 'workspaceId') },
    });
    return updated;
  }
}
