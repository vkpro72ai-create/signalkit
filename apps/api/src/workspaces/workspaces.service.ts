import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateWorkspaceDto } from './dto/workspace.dto';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a workspace and atomically provision its owner membership, default
   * settings, LLM settings and billing account.
   */
  async create(userId: string, dto: CreateWorkspaceDto) {
    const slug = await this.uniqueSlug(dto.slug ?? dto.name);

    const workspace = await this.prisma.workspace.create({
      data: {
        name: dto.name,
        slug,
        ownerId: userId,
        members: {
          create: { userId, role: 'owner', status: 'active' },
        },
        settings: { create: {} },
        llmSettings: { create: {} },
        billingAccount: { create: { plan: 'free' } },
      },
      include: { settings: true },
    });

    await this.audit.record({
      workspaceId: workspace.id,
      action: 'workspace.created',
      actorId: userId,
      subjectType: 'Workspace',
      subjectId: workspace.id,
      metadata: { name: workspace.name, slug: workspace.slug },
    });

    return workspace;
  }

  /** Workspaces the user is an active member of. */
  async listForUser(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId, status: 'active' },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({ ...m.workspace, role: m.role }));
  }

  async getById(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { settings: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return workspace;
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workspace';
  }

  private async uniqueSlug(base: string): Promise<string> {
    const root = this.slugify(base);
    let candidate = root;
    let n = 1;
    // Rare collisions only; bounded loop avoids unbounded retries.
    while (await this.prisma.workspace.findUnique({ where: { slug: candidate } })) {
      n += 1;
      candidate = `${root}-${n}`;
      if (n > 50) {
        candidate = `${root}-${Date.now().toString(36)}`;
        break;
      }
    }
    return candidate;
  }
}
