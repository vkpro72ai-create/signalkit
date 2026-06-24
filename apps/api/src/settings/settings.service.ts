import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UpdateUserSettingsDto, UpdateWorkspaceSettingsDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Fetch (creating defaults if absent) a user's settings. */
  async getUserSettings(userId: string) {
    const existing = await this.prisma.userSettings.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.userSettings.create({ data: { userId } });
  }

  async updateUserSettings(userId: string, dto: UpdateUserSettingsDto) {
    await this.getUserSettings(userId); // ensure row exists
    const updated = await this.prisma.userSettings.update({
      where: { userId },
      data: dto,
    });
    // User-scoped settings are not workspace-bound; audited per active workspace
    // by callers when relevant. We keep the write itself minimal here.
    return updated;
  }

  async getWorkspaceSettings(workspaceId: string) {
    const settings = await this.prisma.workspaceSettings.findUnique({ where: { workspaceId } });
    if (!settings) {
      throw new NotFoundException('Workspace settings not found');
    }
    return settings;
  }

  async updateWorkspaceSettings(
    workspaceId: string,
    dto: UpdateWorkspaceSettingsDto,
    actorId: string,
  ) {
    await this.getWorkspaceSettings(workspaceId);
    const updated = await this.prisma.workspaceSettings.update({
      where: { workspaceId },
      data: dto,
    });
    await this.audit.record({
      workspaceId,
      action: 'workspace.settings_updated',
      actorId,
      subjectType: 'WorkspaceSettings',
      subjectId: updated.id,
      metadata: { changedKeys: Object.keys(dto) },
    });
    return updated;
  }
}
