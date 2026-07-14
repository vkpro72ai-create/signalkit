import { describe, it, expect, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { GeoService } from '../geo/geo.service';
import { ProjectsService } from './projects.service';

type Row = Record<string, unknown>;

function makeService(opts: { project?: Row | null; committedCount?: number } = {}) {
  const project = opts.project === undefined
    ? { id: 'p1', workspaceId: 'ws1', name: 'Test project' }
    : opts.project;

  const prisma = {
    project: {
      findFirst: vi.fn().mockResolvedValue(project),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(project),
      update: vi.fn().mockImplementation(({ data }: { data: Row }) => Promise.resolve({ ...project, ...data })),
    },
    implementationProject: {
      count: vi.fn().mockResolvedValue(opts.committedCount ?? 0),
    },
  } as unknown as PrismaService;

  const geo = {} as unknown as GeoService;
  const svc = new ProjectsService(prisma, geo);
  return { svc, prisma };
}

describe('ProjectsService.delete', () => {
  it('throws NotFoundException when the project does not exist in the workspace', async () => {
    const { svc } = makeService({ project: null });
    await expect(svc.delete('ws1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('refuses to delete a project with a committed implementation project', async () => {
    const { svc, prisma } = makeService({ committedCount: 1 });
    await expect(svc.delete('ws1', 'p1')).rejects.toThrow(ConflictException);
    expect(prisma.project.delete).not.toHaveBeenCalled();
  });

  it('deletes the project when nothing has been committed to build', async () => {
    const { svc, prisma } = makeService({ committedCount: 0 });
    const result = await svc.delete('ws1', 'p1');
    expect(prisma.project.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(result).toEqual({ id: 'p1', deleted: true });
  });
});

describe('ProjectsService.listForWorkspace', () => {
  it('excludes archived projects by default', async () => {
    const { svc, prisma } = makeService();
    await svc.listForWorkspace('ws1');
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1', status: { not: 'archived' } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('includes archived projects when explicitly requested', async () => {
    const { svc, prisma } = makeService();
    await svc.listForWorkspace('ws1', { includeArchived: true });
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws1' },
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('ProjectsService.setArchived', () => {
  it('sets status to archived', async () => {
    const { svc, prisma } = makeService();
    await svc.setArchived('ws1', 'p1', true);
    expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'archived' } });
  });

  it('reactivates by setting status back to active', async () => {
    const { svc, prisma } = makeService();
    await svc.setArchived('ws1', 'p1', false);
    expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'active' } });
  });

  it('404s for an unknown project', async () => {
    const { svc } = makeService({ project: null });
    await expect(svc.setArchived('ws1', 'missing', true)).rejects.toThrow(NotFoundException);
  });
});
