import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeoService } from '../geo/geo.service';
import type { CreateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
  ) {}

  /**
   * Create a project. The market is resolved through the consent-gated geo
   * resolver, so a project for `current_location` is refused (403) unless the
   * user granted location consent — but global/manual/multi always work.
   */
  async create(workspaceId: string, userId: string, dto: CreateProjectDto) {
    const scope = dto.marketScope ?? 'global';
    const market = await this.geo.resolveMarket(userId, {
      scope,
      country: dto.targetCountry,
      region: dto.targetRegion,
      countries: dto.targetCountries,
      regions: dto.targetRegions,
      marketLanguage: dto.marketLanguage,
    });

    return this.prisma.project.create({
      data: {
        workspaceId,
        createdById: userId,
        name: dto.name,
        goal: dto.goal ?? '',
        marketScope: market.scope,
        targetCountry: market.targetCountry,
        targetRegion: market.targetRegion,
        targetCountries: market.targetCountries,
        targetRegions: market.targetRegions,
        marketLanguage: market.marketLanguage,
        regulatorySensitivity: market.regulatorySensitivity,
        defaultOutputLanguage: market.marketLanguage,
      },
    });
  }

  /**
   * A research context that promoted an opportunity auto-archives (see
   * NichesService/ImplementationProjectsService), and finished/dead-end
   * searches get archived manually — so the default view hides `archived`
   * to keep the list to what's actually still being worked. Pass
   * `includeArchived` for the full history (e.g. an "archive" tab).
   */
  listForWorkspace(workspaceId: string, opts: { includeArchived?: boolean } = {}) {
    return this.prisma.project.findMany({
      where: opts.includeArchived ? { workspaceId } : { workspaceId, status: { not: 'archived' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(workspaceId: string, id: string) {
    const project = await this.prisma.project.findFirst({ where: { id, workspaceId } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  /**
   * Archive (hide from the default list) or reactivate a research context.
   * This is the safe default for "I'm done with this search" — reversible,
   * unlike `delete`. This is the manual path; promoting a pack to an
   * Implementation Project (ImplementationProjectsService.promote) archives
   * the source research context automatically the same way.
   */
  async setArchived(workspaceId: string, id: string, archived: boolean) {
    await this.getById(workspaceId, id);
    return this.prisma.project.update({
      where: { id },
      data: { status: archived ? 'archived' : 'active' },
    });
  }

  /**
   * Deleting a project cascades (in the DB schema) through its search
   * contexts, niches/opportunities, and Product Document Packs — including
   * any `ImplementationProject` a founder already committed to building.
   * That last piece is real, founder-owned work, not disposable research
   * scratch, so this stays permanently blocked once one exists — archive
   * it instead, which is what happens automatically on promotion anyway.
   */
  async delete(workspaceId: string, id: string) {
    await this.getById(workspaceId, id);

    const committedCount = await this.prisma.implementationProject.count({
      where: { researchProjectId: id },
    });
    if (committedCount > 0) {
      throw new ConflictException({
        code: 'project_has_committed_implementation',
        errorCode: 'project_has_committed_implementation',
        implementationCount: committedCount,
      });
    }

    await this.prisma.project.delete({ where: { id } });
    return { id, deleted: true };
  }
}
