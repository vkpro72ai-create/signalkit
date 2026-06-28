import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { LlmRouterService } from '../llm/llm-router.service';
import type { PackService } from './pack.service';
import { GovernanceService } from './governance.service';
import { ResearchService } from './research.service';
import { CommentsService } from './comments.service';

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc1', packId: 'pack1', docType: 'product_vision', title: 'Vision',
    body: 'Old body', version: 1, status: 'draft', qualityGateStatus: 'passed',
    metadata: { claimIds: ['c1'], assumptionIds: ['a1'] },
    ...overrides,
  };
}

function makePrisma(docOverrides: Record<string, unknown> = {}) {
  const doc = makeDoc(docOverrides);
  const pack = { id: 'pack1', workspaceId: 'ws1', nicheId: 'n1', depth: 'build_ready', verticalTemplate: 'b2b_saas', primaryLanguage: 'en', status: 'draft' };
  const version = { id: 'v1', documentId: 'doc1', version: 2, body: 'Old body' };
  const assumption = { id: 'ass1', workspaceId: 'ws1', projectId: 'proj1', claimId: null, text: 'Users want feature X', language: 'en', validationStatus: 'untested' };
  return {
    productDocumentPack: { findFirst: vi.fn().mockResolvedValue(pack) },
    productPackDocument: {
      findFirst: vi.fn().mockResolvedValue(doc),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...doc, ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([doc]),
    },
    documentVersion: {
      create: vi.fn().mockResolvedValue(version),
      findMany: vi.fn().mockResolvedValue([version]),
      findFirst: vi.fn().mockResolvedValue(version),
    },
    qualityGateResult: {
      findFirst: vi.fn().mockResolvedValue({ packId: 'pack1', status: 'passed' }),
    },
    assumption: {
      findFirst: vi.fn().mockResolvedValue(assumption),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...assumption, ...data })),
    },
    unresolvedQuestion: { create: vi.fn().mockResolvedValue({ id: 'q1' }) },
    researchUpdate: { findFirst: vi.fn().mockResolvedValue({ id: 'ru1', packId: 'pack1', workspaceId: 'ws1', linkedDocumentIds: ['doc1'] }) },
  };
}

function makePacks() {
  return {
    runGates: vi.fn().mockResolvedValue({ status: 'passed', passedCount: 5, warnCount: 0, failCount: 0 }),
    regenerateOne: vi.fn().mockResolvedValue('Regenerated body'),
  };
}

function makeRouter() {
  return { run: vi.fn().mockResolvedValue({ content: 'New body', validation: { ok: true } }) };
}

function makeService(docOverrides: Record<string, unknown> = {}) {
  const prisma = makePrisma(docOverrides);
  const router = makeRouter();
  const packs = makePacks();
  return {
    svc: new GovernanceService(
      prisma as unknown as PrismaService,
      router as unknown as LlmRouterService,
      packs as unknown as PackService,
    ),
    prisma,
    router,
    packs,
  };
}

// ── GovernanceService.saveDocument ───────────────────────────────────────────

describe('GovernanceService.saveDocument', () => {
  it('creates a DocumentVersion with the new body', async () => {
    const { svc, prisma } = makeService();
    await svc.saveDocument('ws1', 'pack1', 'doc1', 'user1', { body: 'New body', changeSummary: 'Test edit' });
    expect(prisma.documentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: 'New body', generatedBy: 'human', authorId: 'user1' }) }),
    );
    expect(prisma.productPackDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: 'New body' }) }),
    );
  });

  it('increments version number on save', async () => {
    const { svc, prisma } = makeService();
    await svc.saveDocument('ws1', 'pack1', 'doc1', 'user1', { body: 'New body' });
    expect(prisma.documentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 2 }) }),
    );
  });

  it('refuses save on a locked document', async () => {
    const { svc } = makeService({ status: 'locked' });
    await expect(svc.saveDocument('ws1', 'pack1', 'doc1', 'user1', { body: 'x' })).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when pack not found', async () => {
    const prisma = makePrisma();
    prisma.productDocumentPack.findFirst = vi.fn().mockResolvedValue(null);
    const svc = new GovernanceService(
      prisma as unknown as PrismaService,
      makeRouter() as unknown as LlmRouterService,
      makePacks() as unknown as PackService,
    );
    await expect(svc.saveDocument('ws1', 'bad', 'doc1', 'user1', { body: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('preserves quality metadata after edit', async () => {
    const { svc, prisma } = makeService();
    await svc.saveDocument('ws1', 'pack1', 'doc1', 'user1', { body: 'Updated body' });
    expect(prisma.documentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ affectedClaimIds: ['c1'], affectedAssumptionIds: ['a1'] }) }),
    );
  });
});

// ── GovernanceService.restoreVersion ─────────────────────────────────────────

describe('GovernanceService.restoreVersion', () => {
  it('restores body from a version and records a new version', async () => {
    const { svc, prisma } = makeService();
    await svc.restoreVersion('ws1', 'pack1', 'doc1', 'user1', 'v1');
    expect(prisma.productPackDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: 'Old body' }) }),
    );
    expect(prisma.documentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ changeSummary: 'Restored from version 2' }) }),
    );
  });
});

// ── GovernanceService.setReviewStatus ────────────────────────────────────────

describe('GovernanceService.setReviewStatus', () => {
  it('transitions draft → in_review', async () => {
    const { svc, prisma } = makeService();
    await svc.setReviewStatus('ws1', 'pack1', 'doc1', 'user1', 'request_review', false);
    expect(prisma.productPackDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'in_review' }) }),
    );
  });

  it('requires canApprove=true for approve action', async () => {
    const { svc } = makeService({ status: 'in_review' });
    await expect(svc.setReviewStatus('ws1', 'pack1', 'doc1', 'user1', 'approve', false)).rejects.toThrow(ForbiddenException);
  });

  it('allows approve when canApprove=true and status is in_review', async () => {
    const { svc, prisma } = makeService({ status: 'in_review' });
    await svc.setReviewStatus('ws1', 'pack1', 'doc1', 'user1', 'approve', true);
    expect(prisma.productPackDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'approved' }) }),
    );
  });

  it('rejects invalid transition (locked → approved)', async () => {
    const { svc } = makeService({ status: 'locked' });
    await expect(svc.setReviewStatus('ws1', 'pack1', 'doc1', 'user1', 'approve', true)).rejects.toThrow(BadRequestException);
  });
});

// ── GovernanceService.regenerateDocument ─────────────────────────────────────

describe('GovernanceService.regenerateDocument', () => {
  it('creates a version and updates document body', async () => {
    const { svc, prisma, packs } = makeService();
    await svc.regenerateDocument('ws1', 'pack1', 'doc1', 'user1');
    expect(packs.regenerateOne).toHaveBeenCalledWith('ws1', 'pack1', 'doc1');
    expect(prisma.documentVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: 'Regenerated body', generatedBy: 'llm' }) }),
    );
    expect(prisma.productPackDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ body: 'Regenerated body' }) }),
    );
  });

  it('refuses regeneration on a locked document', async () => {
    const { svc } = makeService({ status: 'locked' });
    await expect(svc.regenerateDocument('ws1', 'pack1', 'doc1', 'user1')).rejects.toThrow(ForbiddenException);
  });
});

// ── GovernanceService.validateAssumption ─────────────────────────────────────

describe('GovernanceService.validateAssumption', () => {
  it('updates validationStatus to supported', async () => {
    const { svc, prisma } = makeService();
    await svc.validateAssumption('ws1', 'ass1', { status: 'supported' });
    expect(prisma.assumption.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ validationStatus: 'supported' }) }),
    );
    expect(prisma.unresolvedQuestion.create).not.toHaveBeenCalled();
  });

  it('creates an unresolved question when assumption is contradicted', async () => {
    const { svc, prisma } = makeService();
    await svc.validateAssumption('ws1', 'ass1', { status: 'contradicted', note: 'Users rejected it' });
    expect(prisma.unresolvedQuestion.create).toHaveBeenCalled();
  });

  it('creates a high-priority question when assumption is invalidated', async () => {
    const { svc, prisma } = makeService();
    await svc.validateAssumption('ws1', 'ass1', { status: 'invalidated' });
    expect(prisma.unresolvedQuestion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ priority: 'high' }) }),
    );
  });

  it('throws NotFoundException for unknown assumption', async () => {
    const prisma = makePrisma();
    prisma.assumption.findFirst = vi.fn().mockResolvedValue(null);
    const svc = new GovernanceService(
      prisma as unknown as PrismaService,
      makeRouter() as unknown as LlmRouterService,
      makePacks() as unknown as PackService,
    );
    await expect(svc.validateAssumption('ws1', 'bad', { status: 'supported' })).rejects.toThrow(NotFoundException);
  });
});

// ── ResearchService ───────────────────────────────────────────────────────────

describe('ResearchService', () => {
  const packRow = { id: 'pack1', workspaceId: 'ws1' };
  const ruRow = { id: 'ru1', packId: 'pack1', workspaceId: 'ws1', title: 'Interview', type: 'customer_interview', content: 'test', linkedDocumentIds: [] };

  function makeResearchPrisma() {
    return {
      productDocumentPack: { findFirst: vi.fn().mockResolvedValue(packRow) },
      researchUpdate: {
        create: vi.fn().mockResolvedValue(ruRow),
        findMany: vi.fn().mockResolvedValue([ruRow]),
        findFirst: vi.fn().mockResolvedValue(ruRow),
        update: vi.fn().mockResolvedValue({ ...ruRow, title: 'Updated' }),
      },
    };
  }

  it('creates a research update', async () => {
    const prisma = makeResearchPrisma();
    const svc = new ResearchService(prisma as unknown as PrismaService);
    const result = await svc.create('ws1', 'pack1', 'user1', { title: 'Interview', type: 'customer_interview', content: 'test' });
    expect(result.title).toBe('Interview');
  });

  it('lists research updates for a pack', async () => {
    const prisma = makeResearchPrisma();
    const svc = new ResearchService(prisma as unknown as PrismaService);
    const result = await svc.list('ws1', 'pack1');
    expect(result).toHaveLength(1);
  });

  it('links research update to documents on update', async () => {
    const prisma = makeResearchPrisma();
    const svc = new ResearchService(prisma as unknown as PrismaService);
    await svc.update('ws1', 'pack1', 'ru1', { linkedDocumentIds: ['doc1', 'doc2'] });
    expect(prisma.researchUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ linkedDocumentIds: ['doc1', 'doc2'] }) }),
    );
  });

  it('links research update to assumptions on update', async () => {
    const prisma = makeResearchPrisma();
    const svc = new ResearchService(prisma as unknown as PrismaService);
    await svc.update('ws1', 'pack1', 'ru1', { linkedAssumptionIds: ['ass1'] });
    expect(prisma.researchUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ linkedAssumptionIds: ['ass1'] }) }),
    );
  });
});

// ── CommentsService ───────────────────────────────────────────────────────────

describe('CommentsService', () => {
  const packRow = { id: 'pack1', workspaceId: 'ws1' };
  const commentRow = { id: 'c1', workspaceId: 'ws1', packId: 'pack1', documentId: 'doc1', authorId: 'user1', body: 'Good point', status: 'open' };

  function makeCommentPrisma() {
    return {
      productDocumentPack: { findFirst: vi.fn().mockResolvedValue(packRow) },
      documentComment: {
        create: vi.fn().mockResolvedValue(commentRow),
        findMany: vi.fn().mockResolvedValue([commentRow]),
        findFirst: vi.fn().mockResolvedValue(commentRow),
        update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...commentRow, ...data })),
      },
    };
  }

  it('creates a comment with open status', async () => {
    const prisma = makeCommentPrisma();
    const svc = new CommentsService(prisma as unknown as PrismaService);
    const result = await svc.create('ws1', 'pack1', 'doc1', 'user1', 'Good point');
    expect(result.body).toBe('Good point');
    expect(result.status).toBe('open');
  });

  it('resolves a comment and records resolvedBy', async () => {
    const prisma = makeCommentPrisma();
    const svc = new CommentsService(prisma as unknown as PrismaService);
    await svc.resolve('ws1', 'c1', 'user1');
    expect(prisma.documentComment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'resolved', resolvedBy: 'user1' }) }),
    );
  });

  it('reopens a resolved comment', async () => {
    const prisma = makeCommentPrisma();
    const svc = new CommentsService(prisma as unknown as PrismaService);
    await svc.reopen('ws1', 'c1');
    expect(prisma.documentComment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'open', resolvedAt: null }) }),
    );
  });

  it('throws NotFoundException when comment not found', async () => {
    const prisma = makeCommentPrisma();
    prisma.documentComment.findFirst = vi.fn().mockResolvedValue(null);
    const svc = new CommentsService(prisma as unknown as PrismaService);
    await expect(svc.resolve('ws1', 'bad', 'user1')).rejects.toThrow(NotFoundException);
  });
});
