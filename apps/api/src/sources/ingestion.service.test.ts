import { describe, it, expect, vi } from 'vitest';
import { IngestionService } from './ingestion.service';
import type { PrismaService } from '../prisma/prisma.service';

function makePrisma(ref: Record<string, unknown>) {
  const trendCreate = vi.fn().mockResolvedValue({ id: 'sig1' });
  const rawCreate = vi.fn().mockResolvedValue({ id: 'r1' });
  const prisma = {
    sourceReference: { findUnique: vi.fn().mockResolvedValue(ref) },
    project: { findUnique: vi.fn().mockResolvedValue({ targetCountry: 'TR', marketLanguage: 'tr' }) },
    rawSourceItem: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: rawCreate,
      update: vi.fn().mockResolvedValue({}),
    },
    trendSignal: { deleteMany: vi.fn().mockResolvedValue({}), create: trendCreate },
    normalizedSourceItem: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  return { prisma, trendCreate, rawCreate };
}

describe('IngestionService (inline, no Redis)', () => {
  it('ingests manual content into a normalized item and a trend signal', async () => {
    const { prisma, trendCreate } = makePrisma({
      id: 's1', workspaceId: 'w1', projectId: 'p1', adapter: 'manual', url: null, country: 'TR',
    });
    const svc = new IngestionService(prisma);
    const outcome = await svc.ingest('s1', 'Clinics want WhatsApp automation to book visits.');
    expect(outcome.status).toBe('parsed');
    expect(outcome.signals).toBe(1);
    expect(trendCreate).toHaveBeenCalledTimes(1);
    const data = trendCreate.mock.calls[0]![0].data;
    expect(data.sourceRefIds).toEqual(['s1']);
    expect(data.sourceQuality).toBeGreaterThan(0);
  });

  it('records a visible failure (not fake data) when a keyed adapter is unconfigured', async () => {
    const { prisma, rawCreate, trendCreate } = makePrisma({
      id: 's2', workspaceId: 'w1', projectId: 'p1', adapter: 'reddit', url: null, country: null,
    });
    const svc = new IngestionService(prisma);
    const outcome = await svc.ingest('s2');
    expect(outcome.status).toBe('configuration_needed');
    expect(trendCreate).not.toHaveBeenCalled();
    // A failed raw item is written so the failure is visible in the UI.
    expect(rawCreate).toHaveBeenCalled();
    expect(rawCreate.mock.calls.at(-1)![0].data.status).toBe('failed');
  });
});
