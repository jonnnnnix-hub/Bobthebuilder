import { OptionsIngestionService } from './options-ingestion.service.js';
import { buildOptionFixture } from '../test-fixtures/options-chain.fixture.js';

describe('OptionsIngestionService', () => {
  it('stores merged snapshot rows and updates ingestion run', async () => {
    const prisma = {
      ingestion_run: {
        create: jest.fn().mockResolvedValue({ id: 10 }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      option_chain_snapshot: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;

    const optionsDataService = {
      fetchMergedSnapshot: jest.fn().mockResolvedValue({
        underlyingSymbol: 'AAPL',
        snapshotDate: new Date('2026-04-13T00:00:00.000Z'),
        snapshotTs: new Date('2026-04-13T14:30:00.000Z'),
        freshnessTier: 'intraday',
        mergedQuotes: [buildOptionFixture()],
        sourcesUsed: ['polygon', 'orats'],
        primarySource: 'polygon',
        secondarySource: 'orats',
        qualitySummary: { valid: 1, validWithWarnings: 0, invalid: 0 },
      }),
    };

    const service = new OptionsIngestionService(
      prisma,
      optionsDataService as any,
    );

    const result = await service.ingestSnapshotForSymbol({
      symbol: 'AAPL',
      asOf: new Date('2026-04-13T14:30:00.000Z'),
    });

    expect(prisma.option_chain_snapshot.createMany).toHaveBeenCalled();
    expect(prisma.ingestion_run.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({ status: 'completed' }),
      }),
    );
    expect(result.rows_ingested).toBe(1);
  });
});
