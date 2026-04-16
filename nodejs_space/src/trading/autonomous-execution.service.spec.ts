import { AutonomousExecutionService } from './autonomous-execution.service';

describe('AutonomousExecutionService.checkAccountSafety', () => {
  const service = new AutonomousExecutionService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const baseEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...baseEnv };
  });
  afterAll(() => {
    process.env = baseEnv;
  });

  it('passes when status is ACTIVE, equity meets minimum, and daily change is within limit', () => {
    process.env.MIN_REQUIRED_EQUITY = '2000';
    process.env.MAX_DAILY_LOSS_PCT = '0.03';
    const gate = service.checkAccountSafety({
      status: 'ACTIVE',
      equity: '10000',
      last_equity: '10100',
    });
    expect(gate.safe).toBe(true);
    expect(gate.reasons).toHaveLength(0);
    expect(gate.snapshot.equity).toBe(10000);
  });

  it('fails when account status is not ACTIVE', () => {
    const gate = service.checkAccountSafety({
      status: 'ACCOUNT_CLOSED',
      equity: '10000',
      last_equity: '10000',
    });
    expect(gate.safe).toBe(false);
    expect(gate.reasons.join(' ')).toContain('ACTIVE');
  });

  it('fails when equity is below MIN_REQUIRED_EQUITY', () => {
    process.env.MIN_REQUIRED_EQUITY = '5000';
    const gate = service.checkAccountSafety({
      status: 'ACTIVE',
      equity: '1000',
      last_equity: '1000',
    });
    expect(gate.safe).toBe(false);
    expect(gate.reasons.join(' ')).toContain('equity');
  });

  it('fails when daily loss exceeds MAX_DAILY_LOSS_PCT', () => {
    process.env.MIN_REQUIRED_EQUITY = '2000';
    process.env.MAX_DAILY_LOSS_PCT = '0.03';
    const gate = service.checkAccountSafety({
      status: 'ACTIVE',
      equity: '9600',
      last_equity: '10000',
    });
    expect(gate.safe).toBe(false);
    expect(gate.reasons.join(' ')).toContain('daily loss');
  });

  it('does not flag daily loss when last_equity is missing', () => {
    process.env.MIN_REQUIRED_EQUITY = '2000';
    const gate = service.checkAccountSafety({
      status: 'ACTIVE',
      equity: '10000',
      last_equity: null,
    });
    expect(gate.safe).toBe(true);
    expect(gate.snapshot.lastEquity).toBeNull();
  });
});

describe('AutonomousExecutionService.isRetryableOrderError', () => {
  const service = new AutonomousExecutionService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('retries on network errors with no response', () => {
    expect(service.isRetryableOrderError(new Error('ECONNRESET'))).toBe(true);
  });

  it('retries on 429 rate limit', () => {
    expect(
      service.isRetryableOrderError({ response: { status: 429 } }),
    ).toBe(true);
  });

  it('retries on 5xx server errors', () => {
    expect(
      service.isRetryableOrderError({ response: { status: 502 } }),
    ).toBe(true);
  });

  it('does not retry on 4xx client errors', () => {
    expect(
      service.isRetryableOrderError({ response: { status: 422 } }),
    ).toBe(false);
    expect(
      service.isRetryableOrderError({ response: { status: 403 } }),
    ).toBe(false);
  });
});
