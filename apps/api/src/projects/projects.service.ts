import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  create(workspaceId: string, userId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        workspaceId,
        createdById: userId,
        name: dto.name,
        goal: dto.goal ?? '',
        marketScope: dto.marketScope ?? 'global',
        targetCountry: dto.targetCountry ?? null,
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
