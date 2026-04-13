const getMock = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({ get: getMock })),
    isAxiosError: (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
  },
}));

import { OratsService } from './orats.service';

describe('OratsService', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('normalizes dotted tickers for ORATS summary requests', async () => {
    getMock.mockImplementation(async (_path: string, config: { params: { ticker: string } }) => {
      if (config.params.ticker === 'BRK-B') {
        return {
          data: {
            data: [{ tradeDate: '2026-04-10', iv30d: 0.22 }],
          },
        };
      }

      throw Object.assign(new Error('not found'), {
        isAxiosError: true,
        response: { status: 404 },
      });
    });

    const configService = {
      get: jest.fn().mockReturnValue('orats-key'),
    };
    const service = new OratsService(configService as never);

    await expect(service.getHistoricalIv30dSeries('BRK.B', new Date('2026-04-12T00:00:00.000Z'))).resolves.toEqual([0.22]);
    expect(getMock).toHaveBeenCalledWith(
      '/hist/summaries',
      expect.objectContaining({
        params: expect.objectContaining({
          ticker: 'BRK-B',
        }),
      }),
    );
  });

  it('falls back to historical summaries when live iv is unavailable', async () => {
    getMock
      .mockResolvedValueOnce({ data: { data: [] } })
      .mockResolvedValueOnce({
        data: {
          data: [{ tradeDate: '2026-04-10', iv30d: 0.31 }],
        },
      });

    const configService = {
      get: jest.fn().mockReturnValue('orats-key'),
    };
    const service = new OratsService(configService as never);

    await expect(service.getCurrentIv30d('AAPL')).resolves.toBe(0.31);
    expect(getMock).toHaveBeenNthCalledWith(
      1,
      '/live/summaries',
      expect.objectContaining({
        params: expect.objectContaining({
          ticker: 'AAPL',
        }),
      }),
    );
    expect(getMock).toHaveBeenNthCalledWith(
      2,
      '/hist/summaries',
      expect.objectContaining({
        params: expect.objectContaining({
          ticker: 'AAPL',
        }),
      }),
    );
  });

  it('prefers configured symbol overrides before generic normalization', async () => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'ORATS_API_KEY') {
          return 'orats-key';
        }
        if (key === 'ORATS_SYMBOL_OVERRIDES') {
          return 'BRK.B=BRK/B|BRKB';
        }
        return undefined;
      }),
    };

    getMock.mockImplementation(async (_path: string, config: { params: { ticker: string } }) => {
      if (config.params.ticker === 'BRK/B') {
        return {
          data: {
            data: [{ tradeDate: '2026-04-10', iv30d: 0.24 }],
          },
        };
      }

      throw Object.assign(new Error('not found'), {
        isAxiosError: true,
        response: { status: 404 },
      });
    });

    const service = new OratsService(configService as never);
    await expect(service.getHistoricalIv30dSeries('BRK.B', new Date('2026-04-12T00:00:00.000Z'))).resolves.toEqual([0.24]);
    expect(getMock).toHaveBeenNthCalledWith(
      1,
      '/hist/summaries',
      expect.objectContaining({
        params: expect.objectContaining({
          ticker: 'BRK/B',
        }),
      }),
    );
  });
});
