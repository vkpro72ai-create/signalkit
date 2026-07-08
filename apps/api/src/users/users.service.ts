import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Current user with settings and workspace memberships (for GET /me). */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: true,
        memberships: {
          where: { status: 'active' },
          include: {
            workspace: {
              include: { settings: true },
            },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return {
      user: safeUser,
      settings: user.settings,
      memberships: user.memberships.map((m) => ({
        workspace: m.workspace,
        role: m.role,
        billingPlan: m.workspace.settings?.billingPlan ?? 'free',
      })),
    };
  }

  /** Flat entitlement object used by mobile/web to gate features. */
  async getEntitlements(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'active' },
          include: { workspace: { include: { settings: true } } },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const plan = user.memberships[0]?.workspace.settings?.billingPlan ?? 'free';
    const isPro = plan !== 'free';

    return {
      plan,
      isPro,
      canExportPDF: isPro,
      canExportBundle: isPro,
      canExportMarkdown: isPro,
      canFullPack: isPro,
      canBuildBlueprint: isPro,
      canVentureThesis: true,
      canMultiMarket: isPro,
      canAdvancedBlueprintDetails: isPro,
      canDiscovery: true,
      canCreateWorkspace: true,
      canCreateProject: true,
    };
  }
}
