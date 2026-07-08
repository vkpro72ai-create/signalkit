import { Injectable, NotFoundException } from '@nestjs/common';
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

  listForWorkspace(workspaceId: string) {
    return this.prisma.project.findMany({
      where: { workspaceId },
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
}
