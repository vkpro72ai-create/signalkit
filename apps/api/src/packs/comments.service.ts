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
  ) {
    await this.resolvePack(workspaceId, packId);
    return this.prisma.documentComment.create({
      data: { workspaceId, packId, documentId, authorId, body, status: 'open' },
    });
  }

  async list(workspaceId: string, packId: string, documentId: string) {
    await this.resolvePack(workspaceId, packId);
    return this.prisma.documentComment.findMany({
      where: { packId, documentId },
      orderBy: { createdAt: 'asc' },
    });
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
