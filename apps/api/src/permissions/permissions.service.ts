import { Injectable } from '@nestjs/common';
import { roleHasAllPermissions, type Permission, type WorkspaceRole } from '@signalkit/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve a user's role in a workspace, or null if they are not a member. */
  async getRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true },
    });
    if (!member || member.status !== 'active') return null;
    return member.role as WorkspaceRole;
  }

  /** Check whether a user holds all required permissions in a workspace. */
  async can(
    userId: string,
    workspaceId: string,
    required: readonly Permission[],
  ): Promise<boolean> {
    const role = await this.getRole(userId, workspaceId);
    if (!role) return false;
    return roleHasAllPermissions(role, required);
  }
}
