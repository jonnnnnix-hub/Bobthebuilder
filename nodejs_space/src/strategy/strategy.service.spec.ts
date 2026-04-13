import { StrategyService } from './strategy.service';
import type { SignalInput } from './strategy.service';

describe('StrategyService', () => {
  let service: StrategyService;

  beforeEach(() => {
    service = new StrategyService();
  });

  describe('suggestStrategy', () => {
    it('should suggest short_strangle when VRP very high and IV high', () => {
      const signal: SignalInput = {
        symbol: 'SPY',
        atm_iv: 0.25,
        vrp_20: 0.08,
        vrp_percentile: 97,
        iv_z: 1.5,
        iv_z_percentile: 92,
      };

      const result = service.suggestStrategy(signal);
      expect(result.strategy).toBe('short_strangle');
      expect(result.target_delta_short).toBe(0.16);
    });

    it('should suggest iron_condor when VRP high and IV very high', () => {
      const signal: SignalInput = {
        symbol: 'QQQ',
        atm_iv: 0.35,
        vrp_20: 0.06,
        vrp_percentile: 85,
        iv_z: 2.5,
        iv_z_percentile: 98,
      };

      const result = service.suggestStrategy(signal);
      expect(result.strategy).toBe('iron_condor');
      expect(result.target_delta_short).toBe(0.16);
      expect(result.target_delta_wing).toBe(0.05);
    });

    it('should suggest short_put when VRP high and IV moderate', () => {
      const signal: SignalInput = {
        symbol: 'AAPL',
        atm_iv: 0.2,
        vrp_20: 0.05,
        vrp_percentile: 88,
        iv_z: 1.0,
        iv_z_percentile: 75,
      };

      const result = service.suggestStrategy(signal);
      expect(result.strategy).toBe('short_put');
      expect(result.target_delta_short).toBe(0.2);
    });

    it('should default to short_put when metrics are below thresholds', () => {
      const signal: SignalInput = {
        symbol: 'MSFT',
        atm_iv: 0.15,
        vrp_20: 0.02,
        vrp_percentile: 50,
        iv_z: 0.5,
        iv_z_percentile: 40,
      };

      const result = service.suggestStrategy(signal);
      expect(result.strategy).toBe('short_put');
      expect(result.target_delta_short).toBe(0.2);
    });

    it('should handle null percentiles gracefully', () => {
      const signal: SignalInput = {
        symbol: 'TSLA',
        atm_iv: null,
        vrp_20: null,
        vrp_percentile: null,
        iv_z: null,
        iv_z_percentile: null,
      };

      const result = service.suggestStrategy(signal);
      expect(result.strategy).toBe('short_put');
    });

    it('should suggest short_strangle at boundary (VRP=95, IV=90)', () => {
      const signal: SignalInput = {
        symbol: 'SPY',
        atm_iv: 0.25,
        vrp_20: 0.08,
        vrp_percentile: 95,
        iv_z: 1.5,
        iv_z_percentile: 90,
      };

      const result = service.suggestStrategy(signal);
      expect(result.strategy).toBe('short_strangle');
    });
  });

  describe('calculateLegs', () => {
    it('should return 1 leg for short_put', () => {
      const legs = service.calculateLegs('short_put', 450, 0.2, 0.2);
      expect(legs).toHaveLength(1);
      expect(legs[0].option_type).toBe('put');
      expect(legs[0].side).toBe('sell');
      expect(legs[0].strike).toBeLessThan(450);
    });

    it('should return 2 legs for short_strangle', () => {
      const legs = service.calculateLegs('short_strangle', 450, 0.25, 0.16);
      expect(legs).toHaveLength(2);

      const putLeg = legs.find((l) => l.option_type === 'put');
      const callLeg = legs.find((l) => l.option_type === 'call');
      expect(putLeg).toBeDefined();
      expect(callLeg).toBeDefined();
      expect(putLeg!.side).toBe('sell');
      expect(callLeg!.side).toBe('sell');
      expect(putLeg!.strike).toBeLessThan(450);
      expect(callLeg!.strike).toBeGreaterThan(450);
    });

    it('should return 4 legs for iron_condor', () => {
      const legs = service.calculateLegs('iron_condor', 450, 0.25, 0.16, 0.05);
      expect(legs).toHaveLength(4);

      const sellLegs = legs.filter((l) => l.side === 'sell');
      const buyLegs = legs.filter((l) => l.side === 'buy');
      expect(sellLegs).toHaveLength(2);
      expect(buyLegs).toHaveLength(2);

      // Wings should be further OTM than short legs
      const longPut = legs.find(
        (l) => l.option_type === 'put' && l.side === 'buy',
      )!;
      const shortPut = legs.find(
        (l) => l.option_type === 'put' && l.side === 'sell',
      )!;
      expect(longPut.strike).toBeLessThan(shortPut.strike);
    });

    it('should throw for non-positive underlying price', () => {
      expect(() => service.calculateLegs('short_put', 0, 0.2, 0.2)).toThrow(
        'underlyingPrice must be positive',
      );
      expect(() => service.calculateLegs('short_put', -100, 0.2, 0.2)).toThrow(
        'underlyingPrice must be positive',
      );
    });

    it('should throw for non-positive IV', () => {
      expect(() => service.calculateLegs('short_put', 450, 0, 0.2)).toThrow(
        'atmIv must be positive',
      );
    });
  });

  describe('calculateMaxLoss', () => {
    it('should calculate max loss for short_put', () => {
      const legs = [
        {
          option_type: 'put' as const,
          strike: 430,
          side: 'sell' as const,
          delta: -0.2,
        },
      ];
      const maxLoss = service.calculateMaxLoss('short_put', legs, 2.5, 1);
      // (430 - 2.50) * 100 = 42750
      expect(maxLoss).toBe(42750);
    });

    it('should calculate max loss for iron_condor', () => {
      const legs = [
        {
          option_type: 'put' as const,
          strike: 420,
          side: 'buy' as const,
          delta: -0.05,
        },
        {
          option_type: 'put' as const,
          strike: 430,
          side: 'sell' as const,
          delta: -0.16,
        },
        {
          option_type: 'call' as const,
          strike: 470,
          side: 'sell' as const,
          delta: 0.16,
        },
        {
          option_type: 'call' as const,
          strike: 480,
          side: 'buy' as const,
          delta: 0.05,
        },
      ];
      const maxLoss = service.calculateMaxLoss('iron_condor', legs, 3.0, 1);
      // wing width = 10, (10 - 3) * 100 = 700
      expect(maxLoss).toBe(700);
    });

    it('should scale max loss by contracts', () => {
      const legs = [
        {
          option_type: 'put' as const,
          strike: 420,
          side: 'buy' as const,
          delta: -0.05,
        },
        {
          option_type: 'put' as const,
          strike: 430,
          side: 'sell' as const,
          delta: -0.16,
        },
        {
          option_type: 'call' as const,
          strike: 470,
          side: 'sell' as const,
          delta: 0.16,
        },
        {
          option_type: 'call' as const,
          strike: 480,
          side: 'buy' as const,
          delta: 0.05,
        },
      ];
      const maxLoss = service.calculateMaxLoss('iron_condor', legs, 3.0, 5);
      // (10 - 3) * 500 = 3500
      expect(maxLoss).toBe(3500);
    });
  });

  describe('calculateBreakevens', () => {
    it('should calculate breakeven for short_put', () => {
      const legs = [
        {
          option_type: 'put' as const,
          strike: 430,
          side: 'sell' as const,
          delta: -0.2,
        },
      ];
      const result = service.calculateBreakevens('short_put', legs, 2.5);
      expect(result.lower).toBe(427.5);
      expect(result.upper).toBeUndefined();
    });

    it('should calculate breakevens for short_strangle', () => {
      const legs = [
        {
          option_type: 'put' as const,
          strike: 430,
          side: 'sell' as const,
          delta: -0.16,
        },
        {
          option_type: 'call' as const,
          strike: 470,
          side: 'sell' as const,
          delta: 0.16,
        },
      ];
      const result = service.calculateBreakevens('short_strangle', legs, 5.0);
      expect(result.lower).toBe(425);
      expect(result.upper).toBe(475);
    });

    it('should calculate breakevens for iron_condor', () => {
      const legs = [
        {
          option_type: 'put' as const,
          strike: 420,
          side: 'buy' as const,
          delta: -0.05,
        },
        {
          option_type: 'put' as const,
          strike: 430,
          side: 'sell' as const,
          delta: -0.16,
        },
        {
          option_type: 'call' as const,
          strike: 470,
          side: 'sell' as const,
          delta: 0.16,
        },
        {
          option_type: 'call' as const,
          strike: 480,
          side: 'buy' as const,
          delta: 0.05,
        },
      ];
      const result = service.calculateBreakevens('iron_condor', legs, 3.0);
      expect(result.lower).toBe(427);
      expect(result.upper).toBe(473);
    });
  });
});
