import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateResearchUpdateDto, UpdateResearchUpdateDto } from './dto/governance.dto';

@Injectable()
export class ResearchService {
  constructor(private readonly prisma: PrismaService) {}

  async create(workspaceId: string, packId: string, userId: string, dto: CreateResearchUpdateDto) {
    await this.resolvePack(workspaceId, packId);
    return this.prisma.researchUpdate.create({
      data: {
        packId,
        workspaceId,
        title: dto.title,
        type: dto.type,
        content: dto.content,
        language: dto.language ?? 'en',
        marketContext: dto.marketContext,
        sourceRefs: (dto.sourceRefs ?? []) as unknown as Prisma.InputJsonValue,
        linkedDocumentIds: (dto.linkedDocumentIds ?? []) as unknown as Prisma.InputJsonValue,
        linkedClaimIds: (dto.linkedClaimIds ?? []) as unknown as Prisma.InputJsonValue,
        linkedAssumptionIds: (dto.linkedAssumptionIds ?? []) as unknown as Prisma.InputJsonValue,
        linkedQuestionIds: (dto.linkedQuestionIds ?? []) as unknown as Prisma.InputJsonValue,
        confidenceImpact: dto.confidenceImpact,
        createdById: userId,
      },
    });
  }

  async list(workspaceId: string, packId: string) {
    await this.resolvePack(workspaceId, packId);
    return this.prisma.researchUpdate.findMany({
      where: { packId, workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(workspaceId: string, packId: string, id: string) {
    await this.resolvePack(workspaceId, packId);
    const ru = await this.prisma.researchUpdate.findFirst({ where: { id, packId, workspaceId } });
    if (!ru) throw new NotFoundException('Research update not found');
    return ru;
  }

  async update(workspaceId: string, packId: string, id: string, dto: UpdateResearchUpdateDto) {
    await this.get(workspaceId, packId, id);
    return this.prisma.researchUpdate.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.linkedDocumentIds !== undefined && { linkedDocumentIds: dto.linkedDocumentIds as unknown as Prisma.InputJsonValue }),
        ...(dto.linkedClaimIds !== undefined && { linkedClaimIds: dto.linkedClaimIds as unknown as Prisma.InputJsonValue }),
        ...(dto.linkedAssumptionIds !== undefined && { linkedAssumptionIds: dto.linkedAssumptionIds as unknown as Prisma.InputJsonValue }),
        ...(dto.linkedQuestionIds !== undefined && { linkedQuestionIds: dto.linkedQuestionIds as unknown as Prisma.InputJsonValue }),
        ...(dto.confidenceImpact !== undefined && { confidenceImpact: dto.confidenceImpact }),
        updatedAt: new Date(),
      },
    });
  }

  private async resolvePack(workspaceId: string, packId: string) {
    const pack = await this.prisma.productDocumentPack.findFirst({ where: { id: packId, workspaceId } });
    if (!pack) throw new NotFoundException('Pack not found');
    return pack;
  }
}
