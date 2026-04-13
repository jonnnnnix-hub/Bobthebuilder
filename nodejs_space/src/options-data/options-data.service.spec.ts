import { OptionsDataService } from './options-data.service.js';
import { OptionsDataQualityValidator } from './data-quality.validator.js';
import { PolygonOptionsProvider } from './polygon-options.provider.js';
import { OratsOptionsProvider } from './orats-options.provider.js';
import { buildOptionFixture } from '../test-fixtures/options-chain.fixture.js';

describe('OptionsDataService', () => {
  const asOf = new Date('2026-04-13T14:30:00.000Z');

  function createService() {
    const polygonProvider = {
      fetchSnapshot: jest.fn(),
    } as unknown as PolygonOptionsProvider;

    const oratsProvider = {
      fetchSnapshot: jest.fn(),
    } as unknown as OratsOptionsProvider;

    const validator = new OptionsDataQualityValidator();
    const service = new OptionsDataService(
      polygonProvider,
      oratsProvider,
      validator,
    );

    return { service, polygonProvider, oratsProvider };
  }

  it('merges polygon market fields with ORATS Greeks and IV', async () => {
    const { service, polygonProvider, oratsProvider } = createService();

    (polygonProvider.fetchSnapshot as jest.Mock).mockResolvedValue({
      source: 'polygon',
      quotes: [
        buildOptionFixture({
          impliedVolatility: null,
          delta: null,
          source: 'polygon',
        }),
      ],
      requestedAt: asOf,
      warnings: [],
    });

    (oratsProvider.fetchSnapshot as jest.Mock).mockResolvedValue({
      source: 'orats',
      quotes: [
        buildOptionFixture({
          bid: null,
          ask: null,
          impliedVolatility: 0.41,
          delta: 0.39,
          source: 'orats',
        }),
      ],
      requestedAt: asOf,
      warnings: [],
    });

    const result = await service.fetchMergedSnapshot({
      symbol: 'AAPL',
      asOf,
      tier: 'intraday',
    });
    expect(result.mergedQuotes).toHaveLength(1);
    expect(result.mergedQuotes[0].bid).toBe(4.9);
    expect(result.mergedQuotes[0].impliedVolatility).toBe(0.41);
    expect(result.mergedQuotes[0].delta).toBe(0.39);
  });

  it('computes warning quality when mid is missing and can be derived', async () => {
    const { service, polygonProvider, oratsProvider } = createService();

    (polygonProvider.fetchSnapshot as jest.Mock).mockResolvedValue({
      source: 'polygon',
      quotes: [buildOptionFixture({ mid: null })],
      requestedAt: asOf,
      warnings: [],
    });

    (oratsProvider.fetchSnapshot as jest.Mock).mockResolvedValue({
      source: 'orats',
      quotes: [],
      requestedAt: asOf,
      warnings: [],
    });

    const result = await service.fetchMergedSnapshot({
      symbol: 'AAPL',
      asOf,
      tier: 'intraday',
    });
    expect(result.qualitySummary.validWithWarnings).toBe(1);
    expect(result.mergedQuotes[0].qualityFlags).toContain(
      'mid_computed_from_bid_ask',
    );
    expect(result.mergedQuotes[0].mid).toBe(5);
  });
});
