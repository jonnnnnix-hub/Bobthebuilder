import { TradeService } from './trade.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StrategyService } from '../strategy/strategy.service';

describe('TradeService', () => {
  let service: TradeService;

  const prismaMock = {
    signal: {
      findUnique: jest.fn(),
    },
    trade: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  } as unknown as jest.Mocked<PrismaService>;

  const strategyMock = {
    suggestStrategy: jest.fn(),
    calculateLegs: jest.fn(),
  } as unknown as jest.Mocked<StrategyService>;

  beforeEach(() => {
    jest.clearAllMocks();

    strategyMock.suggestStrategy.mockReturnValue({
      strategy: 'short_put',
      reason: 'VRP high + IV moderate',
      target_delta_short: 0.20,
    });
    strategyMock.calculateLegs.mockReturnValue([
      { option_type: 'put', strike: 430, side: 'sell', delta: -0.20 },
    ]);

    service = new TradeService(prismaMock, strategyMock);
  });

  describe('createTradeFromSignal', () => {
    it('should create a trade from a valid selected signal', async () => {
      const mockSignal = {
        id: 1,
        symbol: 'SPY',
        selected: true,
        atm_iv: 0.25,
        vrp_20: 0.08,
        vrp_percentile: 96,
        iv_z: 1.5,
        iv_z_percentile: 93,
      };

      prismaMock.signal.findUnique.mockResolvedValue(mockSignal as never);
      prismaMock.trade.create.mockResolvedValue({
        id: 1,
        signal_id: 1,
        symbol: 'SPY',
        strategy: 'short_put',
        status: 'pending',
        direction: 'sell',
        contracts: 1,
        legs: [{ id: 1, option_type: 'put', strike: 430, side: 'sell', quantity: 1 }],
      } as never);

      const result = await service.createTradeFromSignal({ signal_id: 1 });

      expect(result.symbol).toBe('SPY');
      expect(result.strategy).toBe('short_put');
      expect(result.status).toBe('pending');
      expect(prismaMock.trade.create).toHaveBeenCalledTimes(1);
      expect(strategyMock.suggestStrategy).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'SPY' }),
      );
    });

    it('should throw when signal not found', async () => {
      prismaMock.signal.findUnique.mockResolvedValue(null as never);

      await expect(service.createTradeFromSignal({ signal_id: 999 }))
        .rejects.toThrow('Signal 999 not found');
    });

    it('should throw when signal not selected', async () => {
      prismaMock.signal.findUnique.mockResolvedValue({
        id: 2,
        symbol: 'AAPL',
        selected: false,
      } as never);

      await expect(service.createTradeFromSignal({ signal_id: 2 }))
        .rejects.toThrow('was not selected');
    });

    it('should use custom contracts count', async () => {
      prismaMock.signal.findUnique.mockResolvedValue({
        id: 1, symbol: 'SPY', selected: true, atm_iv: 0.25,
        vrp_20: 0.08, vrp_percentile: 96, iv_z: 1.5, iv_z_percentile: 93,
      } as never);
      prismaMock.trade.create.mockResolvedValue({
        id: 1, symbol: 'SPY', strategy: 'short_put', status: 'pending',
        direction: 'sell', contracts: 3, legs: [],
      } as never);

      await service.createTradeFromSignal({ signal_id: 1, contracts: 3 });

      expect(prismaMock.trade.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ contracts: 3 }),
        }),
      );
    });
  });

  describe('openTrade', () => {
    it('should open a pending trade', async () => {
      prismaMock.trade.findUnique.mockResolvedValue({
        id: 1, status: 'pending', legs: [],
      } as never);
      prismaMock.trade.update.mockResolvedValue({
        id: 1, status: 'open', opened_at: new Date(), legs: [],
      } as never);

      const result = await service.openTrade(1, 2.50);

      expect(result.status).toBe('open');
      expect(prismaMock.trade.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'open',
            entry_credit: 2.50,
          }),
        }),
      );
    });

    it('should throw when trade not found', async () => {
      prismaMock.trade.findUnique.mockResolvedValue(null as never);
      await expect(service.openTrade(999)).rejects.toThrow('Trade 999 not found');
    });

    it('should throw when trade is not pending', async () => {
      prismaMock.trade.findUnique.mockResolvedValue({
        id: 1, status: 'open', legs: [],
      } as never);
      await expect(service.openTrade(1)).rejects.toThrow('expected pending');
    });
  });

  describe('closeTrade', () => {
    it('should close an open trade with P&L calculation', async () => {
      prismaMock.trade.findUnique.mockResolvedValue({
        id: 1, status: 'open', entry_credit: 2.50, contracts: 1, legs: [],
      } as never);
      prismaMock.trade.update.mockResolvedValue({
        id: 1, status: 'closed', pnl: 150, pnl_pct: 60, legs: [],
      } as never);

      const result = await service.closeTrade(1, 1.00);

      expect(result.status).toBe('closed');
      expect(prismaMock.trade.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'closed',
            exit_debit: 1.00,
            pnl: 150, // (2.50 - 1.00) * 1 * 100
            pnl_pct: 60, // (150 / 250) * 100
          }),
        }),
      );
    });

    it('should handle null entry credit gracefully', async () => {
      prismaMock.trade.findUnique.mockResolvedValue({
        id: 1, status: 'open', entry_credit: null, contracts: 1, legs: [],
      } as never);
      prismaMock.trade.update.mockResolvedValue({
        id: 1, status: 'closed', pnl: null, legs: [],
      } as never);

      const result = await service.closeTrade(1, 1.00);
      expect(result.status).toBe('closed');
      expect(prismaMock.trade.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pnl: null }),
        }),
      );
    });

    it('should throw when trade is not open', async () => {
      prismaMock.trade.findUnique.mockResolvedValue({
        id: 1, status: 'pending', legs: [],
      } as never);
      await expect(service.closeTrade(1)).rejects.toThrow('expected open or closing');
    });
  });

  describe('cancelTrade', () => {
    it('should cancel a pending trade', async () => {
      prismaMock.trade.findUnique.mockResolvedValue({
        id: 1, status: 'pending', legs: [],
      } as never);
      prismaMock.trade.update.mockResolvedValue({
        id: 1, status: 'cancelled', legs: [],
      } as never);

      const result = await service.cancelTrade(1);
      expect(result.status).toBe('cancelled');
    });

    it('should throw when trade is already closed', async () => {
      prismaMock.trade.findUnique.mockResolvedValue({
        id: 1, status: 'closed', legs: [],
      } as never);
      await expect(service.cancelTrade(1)).rejects.toThrow('already closed');
    });
  });

  describe('getOpenTrades', () => {
    it('should return open trades', async () => {
      prismaMock.trade.findMany.mockResolvedValue([
        { id: 1, symbol: 'SPY', status: 'open', legs: [] },
        { id: 2, symbol: 'QQQ', status: 'open', legs: [] },
      ] as never);

      const result = await service.getOpenTrades();
      expect(result).toHaveLength(2);
      expect(prismaMock.trade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'open' } }),
      );
    });
  });

  describe('getTradeHistory', () => {
    it('should return paginated trade history', async () => {
      prismaMock.trade.findMany.mockResolvedValue([
        { id: 1, symbol: 'SPY', status: 'closed', legs: [] },
      ] as never);
      prismaMock.trade.count.mockResolvedValue(1 as never);

      const result = await service.getTradeHistory({ page: 1, limit: 20 });
      expect(result.trades).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.total_pages).toBe(1);
    });

    it('should filter by symbol', async () => {
      prismaMock.trade.findMany.mockResolvedValue([] as never);
      prismaMock.trade.count.mockResolvedValue(0 as never);

      await service.getTradeHistory({ symbol: 'spy' });
      expect(prismaMock.trade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ symbol: 'SPY' }),
        }),
      );
    });
  });
});
