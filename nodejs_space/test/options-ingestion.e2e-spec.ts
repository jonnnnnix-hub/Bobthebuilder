import { Test } from '@nestjs/testing';
import { OptionsIngestionService } from '../src/options-ingestion/options-ingestion.service.js';
import { OptionsDataService } from '../src/options-data/options-data.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { buildOptionFixture } from './fixtures/options-chain.fixture.js';

describe('Options ingestion workflow (e2e-ish)', () => {
  it('runs a full ingestion call path with mocked providers', async () => {
    const prismaMock = {
      ingestion_run: {
        create: jest.fn().mockResolvedValue({ id: 77 }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      option_chain_snapshot: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const optionsDataServiceMock = {
      fetchMergedSnapshot: jest.fn().mockResolvedValue({
        underlyingSymbol: 'MSFT',
        snapshotDate: new Date('2026-04-13T00:00:00.000Z'),
        snapshotTs: new Date('2026-04-13T15:00:00.000Z'),
        freshnessTier: 'streaming',
        mergedQuotes: [
          buildOptionFixture({
            underlyingSymbol: 'MSFT',
            optionSymbol: 'MSFT_2026-06-19_350_call',
          }),
        ],
        sourcesUsed: ['polygon', 'orats'],
        primarySource: 'polygon',
        secondarySource: 'orats',
        qualitySummary: { valid: 1, validWithWarnings: 0, invalid: 0 },
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OptionsIngestionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OptionsDataService, useValue: optionsDataServiceMock },
      ],
    }).compile();

    const service = moduleRef.get(OptionsIngestionService);
    const result = await service.ingestSnapshotForSymbol({
      symbol: 'MSFT',
      asOf: new Date('2026-04-13T15:00:00.000Z'),
      tier: 'streaming',
    });

    expect(result.rows_ingested).toBe(1);
    expect(prismaMock.option_chain_snapshot.createMany).toHaveBeenCalledTimes(
      1,
    );
    expect(prismaMock.ingestion_run.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 77 },
        data: expect.objectContaining({ status: 'completed' }),
      }),
    );
  });
});
