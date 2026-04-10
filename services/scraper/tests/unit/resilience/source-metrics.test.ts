import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourceMetricsService } from '../../../src/resilience/source-metrics.js';

function makeMockPrisma() {
  return {
    source: {
      upsert: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    sourceMetric: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('SourceMetricsService', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let service: SourceMetricsService;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new SourceMetricsService(prisma as never);
  });

  describe('ensureSource', () => {
    it('upserts source row and returns id + circuit state', async () => {
      prisma.source.upsert.mockResolvedValue({
        id: 'src-1',
        circuitState: 'closed',
        consecutiveFailures: 0,
        circuitOpenedAt: null,
      });

      const result = await service.ensureSource('test-source', true);

      expect(prisma.source.upsert).toHaveBeenCalledWith({
        where: { name: 'test-source' },
        create: expect.objectContaining({
          name: 'test-source',
          enabled: true,
          hasApiKey: true,
          circuitState: 'closed',
          consecutiveFailures: 0,
        }),
        update: { hasApiKey: true },
      });

      expect(result.id).toBe('src-1');
      expect(result.circuitState.status).toBe('closed');
      expect(result.circuitState.consecutiveFailures).toBe(0);
      expect(result.circuitState.openedAt).toBeUndefined();
    });

    it('returns open circuit state with openedAt when source has open circuit', async () => {
      const openedAt = new Date('2026-04-10T10:00:00Z');
      prisma.source.upsert.mockResolvedValue({
        id: 'src-2',
        circuitState: 'open',
        consecutiveFailures: 5,
        circuitOpenedAt: openedAt,
      });

      const result = await service.ensureSource('flaky-source', false);

      expect(result.circuitState.status).toBe('open');
      expect(result.circuitState.consecutiveFailures).toBe(5);
      expect(result.circuitState.openedAt).toEqual(openedAt);
    });
  });

  describe('recordMetric', () => {
    it('creates metric row and updates source on success', async () => {
      await service.recordMetric({
        sourceId: 'src-1',
        success: true,
        resultCount: 5,
        durationMs: 1234,
        newCircuitState: { status: 'closed', consecutiveFailures: 0 },
      });

      expect(prisma.sourceMetric.create).toHaveBeenCalledWith({
        data: {
          sourceId: 'src-1',
          success: true,
          resultCount: 5,
          durationMs: 1234,
          errorType: null,
        },
      });

      expect(prisma.source.update).toHaveBeenCalledWith({
        where: { id: 'src-1' },
        data: expect.objectContaining({
          circuitState: 'closed',
          consecutiveFailures: 0,
          lastSuccessAt: expect.any(Date),
        }),
      });
    });

    it('records failure with errorType and updates lastFailureAt', async () => {
      await service.recordMetric({
        sourceId: 'src-1',
        success: false,
        resultCount: 0,
        durationMs: 5000,
        errorType: 'timeout',
        newCircuitState: { status: 'open', consecutiveFailures: 5, openedAt: new Date('2026-04-10T11:00:00Z') },
      });

      expect(prisma.sourceMetric.create).toHaveBeenCalledWith({
        data: {
          sourceId: 'src-1',
          success: false,
          resultCount: 0,
          durationMs: 5000,
          errorType: 'timeout',
        },
      });

      const updateCall = prisma.source.update.mock.calls[0][0];
      expect(updateCall.data.circuitState).toBe('open');
      expect(updateCall.data.consecutiveFailures).toBe(5);
      expect(updateCall.data.circuitOpenedAt).toEqual(new Date('2026-04-10T11:00:00Z'));
      expect(updateCall.data.lastFailureAt).toBeInstanceOf(Date);
      expect(updateCall.data.lastSuccessAt).toBeUndefined();
    });

    it('clears circuitOpenedAt when newState has no openedAt', async () => {
      await service.recordMetric({
        sourceId: 'src-1',
        success: true,
        resultCount: 1,
        durationMs: 100,
        newCircuitState: { status: 'closed', consecutiveFailures: 0 },
      });

      const updateCall = prisma.source.update.mock.calls[0][0];
      expect(updateCall.data.circuitOpenedAt).toBeNull();
    });
  });
});
