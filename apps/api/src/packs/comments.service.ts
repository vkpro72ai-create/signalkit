import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    workspaceId: string,
    packId: string,
    documentId: string,
    authorId: string,
    body: string,
    sectionHeading?: string,
  ) {
    await this.resolvePack(workspaceId, packId);
    return this.prisma.documentComment.create({
      data: { workspaceId, packId, documentId, authorId, body, sectionHeading, status: 'open' },
    });
  }

  async list(workspaceId: string, packId: string, documentId: string) {
    await this.resolvePack(workspaceId, packId);
    return this.prisma.documentComment.findMany({
      where: { packId, documentId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** How many distinct documents in this pack have at least one open comment — drives the "apply comments" button count without fetching every document's comment list. */
  async openSummary(workspaceId: string, packId: string) {
    await this.resolvePack(workspaceId, packId);
    const comments = await this.prisma.documentComment.findMany({
      where: { packId, workspaceId, status: 'open', documentId: { not: null } },
      select: { documentId: true },
    });
    return { documentsAffected: new Set(comments.map((c) => c.documentId)).size };
  }

  async resolve(workspaceId: string, commentId: string, userId: string) {
    const c = await this.resolveComment(workspaceId, commentId);
    return this.prisma.documentComment.update({
      where: { id: c.id },
      data: { status: 'resolved', resolvedAt: new Date(), resolvedBy: userId },
    });
  }

  async reopen(workspaceId: string, commentId: string) {
    const c = await this.resolveComment(workspaceId, commentId);
    return this.prisma.documentComment.update({
      where: { id: c.id },
      data: { status: 'open', resolvedAt: null, resolvedBy: null },
    });
  }

  private async resolvePack(workspaceId: string, packId: string) {
    const pack = await this.prisma.productDocumentPack.findFirst({ where: { id: packId, workspaceId } });
    if (!pack) throw new NotFoundException('Pack not found');
    return pack;
  }

  private async resolveComment(workspaceId: string, commentId: string) {
    const c = await this.prisma.documentComment.findFirst({ where: { id: commentId, workspaceId } });
    if (!c) throw new NotFoundException('Comment not found');
    return c;
  }
}
