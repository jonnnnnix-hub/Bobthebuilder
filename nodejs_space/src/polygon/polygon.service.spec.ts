const getMock = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({ get: getMock })),
  },
}));

import { PolygonService } from './polygon.service';

describe('PolygonService', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('targets near-the-money strikes before falling back to a broad chain fetch', async () => {
    getMock.mockResolvedValue({
      data: {
        results: [
          {
            implied_volatility: 0.25,
            open_interest: 100,
            details: {
              ticker: 'O:SPY260515C00100000',
              strike_price: 100,
              expiration_date: '2026-05-15',
              contract_type: 'call',
            },
          },
          {
            implied_volatility: 0.27,
            open_interest: 90,
            details: {
              ticker: 'O:SPY260515P00100000',
              strike_price: 100,
              expiration_date: '2026-05-15',
              contract_type: 'put',
            },
          },
        ],
      },
    });

    const configService = {
      get: jest.fn().mockReturnValue('polygon-key'),
    };
    const service = new PolygonService(configService as never);

    const contracts = await service.getOptionsSnapshot('SPY', 100);

    expect(contracts).toHaveLength(2);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith(
      '/v3/snapshot/options/SPY',
      expect.objectContaining({
        params: expect.objectContaining({
          apiKey: 'polygon-key',
          limit: 250,
          'strike_price.gte': 92,
          'strike_price.lte': 108,
        }),
      }),
    );
  });

  it('falls back to a broader expiration-filtered fetch when targeted windows miss ATM pairs', async () => {
    getMock
      .mockResolvedValueOnce({
        data: {
          results: [
            {
              implied_volatility: 0.24,
              open_interest: 10,
              details: {
                ticker: 'O:QQQ260515C00400000',
                strike_price: 100,
                expiration_date: '2026-05-15',
                contract_type: 'call',
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({ data: { results: [] } })
      .mockResolvedValueOnce({ data: { results: [] } })
      .mockResolvedValueOnce({
        data: {
          results: [
            {
              implied_volatility: 0.24,
              open_interest: 10,
              details: {
                ticker: 'O:QQQ260515C00410000',
                strike_price: 105,
                expiration_date: '2026-05-15',
                contract_type: 'call',
              },
            },
            {
              implied_volatility: 0.26,
              open_interest: 12,
              details: {
                ticker: 'O:QQQ260515P00410000',
                strike_price: 105,
                expiration_date: '2026-05-15',
                contract_type: 'put',
              },
            },
          ],
        },
      });

    const configService = {
      get: jest.fn().mockReturnValue('polygon-key'),
    };
    const service = new PolygonService(configService as never);

    const contracts = await service.getOptionsSnapshot('QQQ', 100);

    expect(contracts).toHaveLength(3);
    expect(getMock).toHaveBeenCalledTimes(4);
    expect(getMock).toHaveBeenLastCalledWith(
      '/v3/snapshot/options/QQQ',
      expect.objectContaining({
        params: expect.objectContaining({
          apiKey: 'polygon-key',
          limit: 250,
          'expiration_date.gte': expect.any(String),
          'expiration_date.lte': expect.any(String),
        }),
      }),
    );
    expect(
      (getMock.mock.calls[3] as [{}, { params: Record<string, unknown> }])[1]
        .params,
    ).not.toHaveProperty('strike_price.gte');
    expect(
      (getMock.mock.calls[3] as [{}, { params: Record<string, unknown> }])[1]
        .params,
    ).not.toHaveProperty('strike_price.lte');
  });

  it('fetches a historical daily bar range for backfills', async () => {
    getMock.mockResolvedValue({
      data: {
        results: [{ o: 100, h: 102, l: 99, c: 101, v: 1000, t: 1712793600000 }],
      },
    });

    const configService = {
      get: jest.fn().mockReturnValue('polygon-key'),
    };
    const service = new PolygonService(configService as never);

    const bars = await service.getHistoricalBarsRange(
      'AAPL',
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-04-10T00:00:00.000Z'),
    );

    expect(bars).toHaveLength(1);
    expect(getMock).toHaveBeenCalledWith(
      '/v2/aggs/ticker/AAPL/range/1/day/2026-04-01/2026-04-10',
      expect.objectContaining({
        params: expect.objectContaining({
          adjusted: true,
          sort: 'asc',
          limit: 5000,
          apiKey: 'polygon-key',
        }),
      }),
    );
  });
});
