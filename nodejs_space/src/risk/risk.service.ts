import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface RiskCheckResult {
  check_type: string;
  status: 'passed' | 'warned' | 'blocked';
  value: number | null;
  threshold: number | null;
  message: string;
}

export interface TradeRiskEvaluation {
  trade_id: number | null;
  symbol: string;
  overall_status: 'passed' | 'warned' | 'blocked';
  checks: RiskCheckResult[];
}

export interface PortfolioRiskReport {
  overall_status: 'passed' | 'warned' | 'blocked';
  open_positions: number;
  checks: RiskCheckResult[];
  evaluated_at: Date;
}

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  private static readonly MAX_LOSS_PCT = 0.02; // 2% of portfolio
  private static readonly SECTOR_CONCENTRATION_PCT = 0.25; // 25%
  private static readonly MAX_POSITIONS = 10;
  private static readonly MAX_NET_DELTA = 50;
  private static readonly ASSUMED_PORTFOLIO_VALUE = 100000; // default for risk calcs

  constructor(private prisma: PrismaService) {}

  async evaluateTradeRisk(input: {
    trade_id?: number;
    symbol: string;
    max_loss: number;
    portfolio_value?: number;
  }): Promise<TradeRiskEvaluation> {
    const portfolioValue = input.portfolio_value ?? RiskService.ASSUMED_PORTFOLIO_VALUE;
    const checks: RiskCheckResult[] = [];

    // Check 1: Max loss < 2% of portfolio
    const maxLossPct = input.max_loss / portfolioValue;
    const maxLossThreshold = RiskService.MAX_LOSS_PCT;
    if (maxLossPct > maxLossThreshold) {
      checks.push({
        check_type: 'max_loss_pct',
        status: 'blocked',
        value: Math.round(maxLossPct * 10000) / 100,
        threshold: maxLossThreshold * 100,
        message: `Max loss ${(maxLossPct * 100).toFixed(2)}% exceeds ${(maxLossThreshold * 100).toFixed(1)}% limit`,
      });
    } else if (maxLossPct > maxLossThreshold * 0.8) {
      checks.push({
        check_type: 'max_loss_pct',
        status: 'warned',
        value: Math.round(maxLossPct * 10000) / 100,
        threshold: maxLossThreshold * 100,
        message: `Max loss ${(maxLossPct * 100).toFixed(2)}% approaching ${(maxLossThreshold * 100).toFixed(1)}% limit`,
      });
    } else {
      checks.push({
        check_type: 'max_loss_pct',
        status: 'passed',
        value: Math.round(maxLossPct * 10000) / 100,
        threshold: maxLossThreshold * 100,
        message: `Max loss ${(maxLossPct * 100).toFixed(2)}% within ${(maxLossThreshold * 100).toFixed(1)}% limit`,
      });
    }

    // Check 2: Sector concentration < 25%
    const openTrades = await this.prisma.trade.findMany({
      where: { status: 'open' },
      select: { symbol: true },
    });

    const symbolsInSameSymbol = openTrades.filter(t => t.symbol === input.symbol).length;
    const totalOpen = openTrades.length + 1; // +1 for the new trade
    const concentration = totalOpen > 0 ? (symbolsInSameSymbol + 1) / totalOpen : 0;

    // Look up sector for concentration check
    const universe = await this.prisma.universe.findUnique({
      where: { symbol: input.symbol },
      select: { sector: true },
    });

    if (universe?.sector) {
      const symbolsInSector = await this.getSectorSymbols(universe.sector);
      const sectorTrades = openTrades.filter(t => symbolsInSector.has(t.symbol)).length + 1;
      const sectorConcentration = sectorTrades / totalOpen;

      if (sectorConcentration > RiskService.SECTOR_CONCENTRATION_PCT) {
        checks.push({
          check_type: 'sector_concentration',
          status: 'blocked',
          value: Math.round(sectorConcentration * 100),
          threshold: RiskService.SECTOR_CONCENTRATION_PCT * 100,
          message: `Sector "${universe.sector}" concentration ${(sectorConcentration * 100).toFixed(0)}% exceeds ${(RiskService.SECTOR_CONCENTRATION_PCT * 100).toFixed(0)}% limit`,
        });
      } else {
        checks.push({
          check_type: 'sector_concentration',
          status: 'passed',
          value: Math.round(sectorConcentration * 100),
          threshold: RiskService.SECTOR_CONCENTRATION_PCT * 100,
          message: `Sector "${universe.sector}" concentration ${(sectorConcentration * 100).toFixed(0)}% within ${(RiskService.SECTOR_CONCENTRATION_PCT * 100).toFixed(0)}% limit`,
        });
      }
    } else {
      checks.push({
        check_type: 'sector_concentration',
        status: 'passed',
        value: null,
        threshold: RiskService.SECTOR_CONCENTRATION_PCT * 100,
        message: 'No sector data — skipping sector concentration check',
      });
    }

    const overallStatus = this.aggregateStatus(checks);

    // Persist risk checks
    await Promise.all(
      checks.map(check =>
        this.prisma.risk_check.create({
          data: {
            trade_id: input.trade_id ?? null,
            check_type: check.check_type,
            status: check.status,
            value: check.value,
            threshold: check.threshold,
            message: check.message,
          },
        }),
      ),
    );

    return {
      trade_id: input.trade_id ?? null,
      symbol: input.symbol,
      overall_status: overallStatus,
      checks,
    };
  }

  async evaluatePortfolioRisk(): Promise<PortfolioRiskReport> {
    const checks: RiskCheckResult[] = [];

    // Get open trades with latest snapshots
    const openTrades = await this.prisma.trade.findMany({
      where: { status: 'open' },
      include: { legs: true },
    });

    // Check 1: Max positions
    const positionCount = openTrades.length;
    if (positionCount >= RiskService.MAX_POSITIONS) {
      checks.push({
        check_type: 'max_positions',
        status: 'blocked',
        value: positionCount,
        threshold: RiskService.MAX_POSITIONS,
        message: `${positionCount} open positions — at or exceeding ${RiskService.MAX_POSITIONS} limit`,
      });
    } else if (positionCount >= RiskService.MAX_POSITIONS * 0.8) {
      checks.push({
        check_type: 'max_positions',
        status: 'warned',
        value: positionCount,
        threshold: RiskService.MAX_POSITIONS,
        message: `${positionCount} open positions — approaching ${RiskService.MAX_POSITIONS} limit`,
      });
    } else {
      checks.push({
        check_type: 'max_positions',
        status: 'passed',
        value: positionCount,
        threshold: RiskService.MAX_POSITIONS,
        message: `${positionCount} open positions within ${RiskService.MAX_POSITIONS} limit`,
      });
    }

    // Check 2: Net delta
    let netDelta = 0;
    for (const trade of openTrades) {
      const latestSnapshot = await this.prisma.position_snapshot.findFirst({
        where: { trade_id: trade.id },
        orderBy: { snapshot_date: 'desc' },
      });
      netDelta += latestSnapshot?.delta ?? 0;
    }

    const absDelta = Math.abs(netDelta);
    if (absDelta > RiskService.MAX_NET_DELTA) {
      checks.push({
        check_type: 'net_delta',
        status: 'blocked',
        value: Math.round(netDelta * 100) / 100,
        threshold: RiskService.MAX_NET_DELTA,
        message: `Net delta ${netDelta.toFixed(2)} exceeds +/- ${RiskService.MAX_NET_DELTA} limit`,
      });
    } else if (absDelta > RiskService.MAX_NET_DELTA * 0.8) {
      checks.push({
        check_type: 'net_delta',
        status: 'warned',
        value: Math.round(netDelta * 100) / 100,
        threshold: RiskService.MAX_NET_DELTA,
        message: `Net delta ${netDelta.toFixed(2)} approaching +/- ${RiskService.MAX_NET_DELTA} limit`,
      });
    } else {
      checks.push({
        check_type: 'net_delta',
        status: 'passed',
        value: Math.round(netDelta * 100) / 100,
        threshold: RiskService.MAX_NET_DELTA,
        message: `Net delta ${netDelta.toFixed(2)} within +/- ${RiskService.MAX_NET_DELTA} limit`,
      });
    }

    // Check 3: Margin utilization (estimated)
    const estimatedMargin = openTrades.reduce((sum, trade) => {
      // Rough margin estimate: entry_credit * contracts * 100 * 5 (for naked) or * 2 (for defined risk)
      const credit = trade.entry_credit ?? 0;
      const multiplier = trade.strategy === 'iron_condor' ? 2 : 5;
      return sum + credit * trade.contracts * 100 * multiplier;
    }, 0);

    const marginPct = estimatedMargin / RiskService.ASSUMED_PORTFOLIO_VALUE;
    checks.push({
      check_type: 'margin_utilization',
      status: marginPct > 0.8 ? 'blocked' : marginPct > 0.6 ? 'warned' : 'passed',
      value: Math.round(marginPct * 100),
      threshold: 80,
      message: `Estimated margin utilization ${(marginPct * 100).toFixed(0)}%`,
    });

    const overallStatus = this.aggregateStatus(checks);

    // Persist portfolio risk checks
    await Promise.all(
      checks.map(check =>
        this.prisma.risk_check.create({
          data: {
            trade_id: null,
            check_type: check.check_type,
            status: check.status,
            value: check.value,
            threshold: check.threshold,
            message: check.message,
          },
        }),
      ),
    );

    return {
      overall_status: overallStatus,
      open_positions: positionCount,
      checks,
      evaluated_at: new Date(),
    };
  }

  async getLatestRiskReport(): Promise<{
    trade_checks: Array<{ trade_id: number | null; check_type: string; status: string; value: number | null; threshold: number | null; message: string | null; created_at: Date }>;
    portfolio_checks: Array<{ check_type: string; status: string; value: number | null; threshold: number | null; message: string | null; created_at: Date }>;
  }> {
    const recentChecks = await this.prisma.risk_check.findMany({
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return {
      trade_checks: recentChecks.filter(c => c.trade_id != null),
      portfolio_checks: recentChecks.filter(c => c.trade_id == null),
    };
  }

  private async getSectorSymbols(sector: string): Promise<Set<string>> {
    const symbols = await this.prisma.universe.findMany({
      where: { sector, active: true },
      select: { symbol: true },
    });
    return new Set(symbols.map(s => s.symbol));
  }

  private aggregateStatus(checks: RiskCheckResult[]): 'passed' | 'warned' | 'blocked' {
    if (checks.some(c => c.status === 'blocked')) return 'blocked';
    if (checks.some(c => c.status === 'warned')) return 'warned';
    return 'passed';
  }
}
