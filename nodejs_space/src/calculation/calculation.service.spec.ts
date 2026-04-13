import { CalculationService } from './calculation.service';
import type { DailyBar, OptionContract } from '../polygon/polygon.service';

describe('CalculationService', () => {
  let service: CalculationService;

  beforeEach(() => {
    service = new CalculationService();
  });

  it('extracts ATM IV from a matched call/put pair at the closest strike', () => {
    const expiration = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const options: OptionContract[] = [
      {
        ticker: 'TESTC100',
        strike_price: 100,
        expiration_date: expiration,
        contract_type: 'call',
        implied_volatility: 0.32,
        open_interest: 500,
      },
      {
        ticker: 'TESTP100',
        strike_price: 100,
        expiration_date: expiration,
        contract_type: 'put',
        implied_volatility: 0.28,
        open_interest: 450,
      },
      {
        ticker: 'TESTC110',
        strike_price: 110,
        expiration_date: expiration,
        contract_type: 'call',
        implied_volatility: 0.5,
      },
    ];

    expect(service.extractAtmIv(options, 101)).toBe(0.3);
  });

  it('returns null when there is no matched call/put pair at the same strike and expiration', () => {
    const expiration = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const options: OptionContract[] = [
      {
        ticker: 'TESTC100',
        strike_price: 100,
        expiration_date: expiration,
        contract_type: 'call',
        implied_volatility: 0.32,
      },
      {
        ticker: 'TESTP105',
        strike_price: 105,
        expiration_date: expiration,
        contract_type: 'put',
        implied_volatility: 0.28,
      },
    ];

    expect(service.extractAtmIv(options, 101)).toBeNull();
  });

  it('returns null historical volatility when there is not enough data', () => {
    const bars: DailyBar[] = Array.from({ length: 5 }, (_, index) => ({
      o: 100 + index,
      h: 101 + index,
      l: 99 + index,
      c: 100 + index,
      v: 1000,
      t: index,
    }));

    expect(service.calculateHistoricalVolatility(bars, 10)).toBeNull();
  });

  it('computes IV z-score only from real historical IV observations', () => {
    const historicalIvs = Array.from(
      { length: 20 },
      (_, index) => 0.2 + index * 0.01,
    );

    expect(
      service.calculateIvZScoreFromHistory(0.5, historicalIvs),
    ).toBeGreaterThan(0);
  });

  it('returns null IV z-score when real IV history is insufficient', () => {
    const historicalIvs = Array.from(
      { length: 5 },
      (_, index) => 0.2 + index * 0.01,
    );

    expect(service.calculateIvZScoreFromHistory(0.5, historicalIvs)).toBeNull();
  });

  it('ranks and selects top candidates that meet both thresholds', () => {
    const result = service.rankAndSelect(
      [
        {
          symbol: 'AAA',
          atm_iv: 0.5,
          hv_10: 0.2,
          hv_20: 0.2,
          hv_60: 0.2,
          vrp_20: 0.3,
          iv_z: 4,
        },
        {
          symbol: 'BBB',
          atm_iv: 0.45,
          hv_10: 0.2,
          hv_20: 0.21,
          hv_60: 0.2,
          vrp_20: 0.24,
          iv_z: 3.5,
        },
        {
          symbol: 'CCC',
          atm_iv: 0.3,
          hv_10: 0.25,
          hv_20: 0.26,
          hv_60: 0.26,
          vrp_20: 0.04,
          iv_z: 0.7,
        },
      ],
      30,
      30,
      1,
    );

    expect(result.ranked[0].symbol).toBe('AAA');
    expect(result.ranked[0].selected).toBe(true);
    expect(result.ranked[0].selection_reason).toBe('selected');
    expect(result.ranked[1].selected).toBe(false);
    expect(result.ranked[1].selection_reason).toBe(
      'passed_thresholds_but_outside_top_n',
    );
    expect(result.ranked[2].selected).toBe(false);
    expect(result.ranked[2].selection_reason).toBe(
      'below_vrp_and_iv_z_threshold',
    );
  });

  it('marks the blocking threshold when a rankable name misses selection', () => {
    const result = service.rankAndSelect(
      [
        {
          symbol: 'AAA',
          atm_iv: 0.5,
          hv_10: 0.2,
          hv_20: 0.2,
          hv_60: 0.2,
          vrp_20: 0.3,
          iv_z: 1,
        },
        {
          symbol: 'BBB',
          atm_iv: 0.45,
          hv_10: 0.2,
          hv_20: 0.21,
          hv_60: 0.2,
          vrp_20: 0.25,
          iv_z: 4,
        },
        {
          symbol: 'CCC',
          atm_iv: 0.3,
          hv_10: 0.25,
          hv_20: 0.26,
          hv_60: 0.26,
          vrp_20: 0.2,
          iv_z: 3,
        },
        {
          symbol: 'DDD',
          atm_iv: 0.28,
          hv_10: 0.22,
          hv_20: 0.24,
          hv_60: 0.25,
          vrp_20: 0.05,
          iv_z: 0.5,
        },
      ],
      50,
      50,
      3,
    );

    const aaa = result.ranked.find((feature) => feature.symbol === 'AAA');
    const bbb = result.ranked.find((feature) => feature.symbol === 'BBB');

    expect(aaa?.selection_reason).toBe('below_iv_z_threshold');
    expect(bbb?.selection_reason).toBe('selected');
  });
});
