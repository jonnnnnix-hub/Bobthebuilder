import { RiskService } from './risk.service';
import type { MockedPrisma } from '../test/prisma-mock';

describe('RiskService', () => {
  let service: RiskService;

  const prismaMock = {
    trade: {
      findMany: jest.fn(),
    },
    universe: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    risk_check: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    position_snapshot: {
      findFirst: jest.fn(),
    },
  } as unknown as MockedPrisma;

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.risk_check.create.mockResolvedValue({} as never);
    service = new RiskService(prismaMock);
  });

  describe('evaluateTradeRisk', () => {
    it('should pass when max loss is within 2% of portfolio', async () => {
      // 4 open trades across different sectors so concentration stays under 25%
      prismaMock.trade.findMany.mockResolvedValue([
        { symbol: 'XOM' },
        { symbol: 'JPM' },
        { symbol: 'UNH' },
        { symbol: 'HD' },
      ] as never);
      prismaMock.universe.findUnique.mockResolvedValue({
        sector: 'Technology',
      } as never);
      prismaMock.universe.findMany.mockResolvedValue([
        { symbol: 'AAPL' },
      ] as never);

      const result = await service.evaluateTradeRisk({
        symbol: 'AAPL',
        max_loss: 1500, // 1.5% of 100k
        portfolio_value: 100000,
      });

      expect(result.overall_status).toBe('passed');
      const maxLossCheck = result.checks.find(
        (c) => c.check_type === 'max_loss_pct',
      );
      expect(maxLossCheck?.status).toBe('passed');
    });

    it('should block when max loss exceeds 2% of portfolio', async () => {
      prismaMock.trade.findMany.mockResolvedValue([
        { symbol: 'XOM' },
        { symbol: 'JPM' },
        { symbol: 'UNH' },
        { symbol: 'HD' },
      ] as never);
      prismaMock.universe.findUnique.mockResolvedValue({
        sector: 'Technology',
      } as never);
      prismaMock.universe.findMany.mockResolvedValue([
        { symbol: 'AAPL' },
      ] as never);

      const result = await service.evaluateTradeRisk({
        symbol: 'AAPL',
        max_loss: 2500, // 2.5% of 100k
        portfolio_value: 100000,
      });

      expect(result.overall_status).toBe('blocked');
      const maxLossCheck = result.checks.find(
        (c) => c.check_type === 'max_loss_pct',
      );
      expect(maxLossCheck?.status).toBe('blocked');
    });

    it('should warn when max loss approaches 2% limit', async () => {
      prismaMock.trade.findMany.mockResolvedValue([
        { symbol: 'XOM' },
        { symbol: 'JPM' },
        { symbol: 'UNH' },
        { symbol: 'HD' },
      ] as never);
      prismaMock.universe.findUnique.mockResolvedValue({
        sector: 'Technology',
      } as never);
      prismaMock.universe.findMany.mockResolvedValue([
        { symbol: 'AAPL' },
      ] as never);

      const result = await service.evaluateTradeRisk({
        symbol: 'AAPL',
        max_loss: 1700, // 1.7% of 100k — above 80% of 2% (=1.6%)
        portfolio_value: 100000,
      });

      const maxLossCheck = result.checks.find(
        (c) => c.check_type === 'max_loss_pct',
      );
      expect(maxLossCheck?.status).toBe('warned');
    });

    it('should block when sector concentration exceeds 25%', async () => {
      // 3 open trades in Technology, plus the new one = 4 out of 4 = 100%
      prismaMock.trade.findMany.mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: 'MSFT' },
        { symbol: 'GOOG' },
      ] as never);
      prismaMock.universe.findUnique.mockResolvedValue({
        sector: 'Technology',
      } as never);
      prismaMock.universe.findMany.mockResolvedValue([
        { symbol: 'AAPL' },
        { symbol: 'MSFT' },
        { symbol: 'GOOG' },
        { symbol: 'META' },
      ] as never);

      const result = await service.evaluateTradeRisk({
        symbol: 'META',
        max_loss: 500,
        portfolio_value: 100000,
      });

      const sectorCheck = result.checks.find(
        (c) => c.check_type === 'sector_concentration',
      );
      expect(sectorCheck?.status).toBe('blocked');
    });

    it('should persist risk checks to database', async () => {
      prismaMock.trade.findMany.mockResolvedValue([] as never);
      prismaMock.universe.findUnique.mockResolvedValue(null as never);

      await service.evaluateTradeRisk({
        trade_id: 1,
        symbol: 'SPY',
        max_loss: 500,
      });

      expect(prismaMock.risk_check.create).toHaveBeenCalled();
      const createCall = prismaMock.risk_check.create.mock.calls[0][0] as {
        data: { trade_id: number };
      };
      expect(createCall.data.trade_id).toBe(1);
    });
  });

  describe('evaluatePortfolioRisk', () => {
    it('should pass with few open positions and low delta', async () => {
      prismaMock.trade.findMany.mockResolvedValue([
        {
          id: 1,
          entry_credit: 2.0,
          contracts: 1,
          strategy: 'short_put',
          legs: [],
        },
        {
          id: 2,
          entry_credit: 1.5,
          contracts: 1,
          strategy: 'iron_condor',
          legs: [],
        },
      ] as never);
      prismaMock.position_snapshot.findFirst.mockResolvedValue({
        delta: -0.15,
      } as never);

      const result = await service.evaluatePortfolioRisk();

      expect(result.open_positions).toBe(2);
      const posCheck = result.checks.find(
        (c) => c.check_type === 'max_positions',
      );
      expect(posCheck?.status).toBe('passed');
    });

    it('should block at max positions limit', async () => {
      const tenTrades = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        entry_credit: 1.0,
        contracts: 1,
        strategy: 'short_put',
        legs: [],
      }));
      prismaMock.trade.findMany.mockResolvedValue(tenTrades as never);
      prismaMock.position_snapshot.findFirst.mockResolvedValue({
        delta: 0,
      } as never);

      const result = await service.evaluatePortfolioRisk();

      const posCheck = result.checks.find(
        (c) => c.check_type === 'max_positions',
      );
      expect(posCheck?.status).toBe('blocked');
    });

    it('should warn when approaching position limit', async () => {
      const eightTrades = Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        entry_credit: 1.0,
        contracts: 1,
        strategy: 'short_put',
        legs: [],
      }));
      prismaMock.trade.findMany.mockResolvedValue(eightTrades as never);
      prismaMock.position_snapshot.findFirst.mockResolvedValue({
        delta: 0,
      } as never);

      const result = await service.evaluatePortfolioRisk();

      const posCheck = result.checks.find(
        (c) => c.check_type === 'max_positions',
      );
      expect(posCheck?.status).toBe('warned');
    });

    it('should check net delta limits', async () => {
      prismaMock.trade.findMany.mockResolvedValue([
        {
          id: 1,
          entry_credit: 2.0,
          contracts: 1,
          strategy: 'short_put',
          legs: [],
        },
      ] as never);
      prismaMock.position_snapshot.findFirst.mockResolvedValue({
        delta: 55, // exceeds ±50
      } as never);

      const result = await service.evaluatePortfolioRisk();

      const deltaCheck = result.checks.find(
        (c) => c.check_type === 'net_delta',
      );
      expect(deltaCheck?.status).toBe('blocked');
    });

    it('should include margin utilization check', async () => {
      prismaMock.trade.findMany.mockResolvedValue([
        {
          id: 1,
          entry_credit: 2.0,
          contracts: 1,
          strategy: 'short_put',
          legs: [],
        },
      ] as never);
      prismaMock.position_snapshot.findFirst.mockResolvedValue({
        delta: 0,
      } as never);

      const result = await service.evaluatePortfolioRisk();

      const marginCheck = result.checks.find(
        (c) => c.check_type === 'margin_utilization',
      );
      expect(marginCheck).toBeDefined();
      expect(marginCheck?.value).toBeDefined();
    });
  });

  describe('getLatestRiskReport', () => {
    it('should separate trade and portfolio checks', async () => {
      prismaMock.risk_check.findMany.mockResolvedValue([
        {
          trade_id: 1,
          check_type: 'max_loss_pct',
          status: 'passed',
          created_at: new Date(),
        },
        {
          trade_id: null,
          check_type: 'max_positions',
          status: 'passed',
          created_at: new Date(),
        },
        {
          trade_id: null,
          check_type: 'net_delta',
          status: 'warned',
          created_at: new Date(),
        },
      ] as never);

      const result = await service.getLatestRiskReport();

      expect(result.trade_checks).toHaveLength(1);
      expect(result.portfolio_checks).toHaveLength(2);
    });
  });
});
