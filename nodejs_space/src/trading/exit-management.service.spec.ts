import { ExitManagementService } from './exit-management.service';
import type { MockedPrisma } from '../test/prisma-mock';

type LoggerStub = {
  log: jest.Mock;
};

type AlpacaStub = {
  closePosition: jest.Mock;
};

const buildPosition = (
  overrides: Partial<{
    id: bigint;
    symbol: string;
    unrealized_pl_pct: number | null;
    dte_remaining: number | null;
    strategy: string | null;
    last_synced_at: Date;
  }> = {},
) => ({
  id: BigInt(overrides.id ?? 1),
  symbol: overrides.symbol ?? 'SPY',
  unrealized_pl_pct: overrides.unrealized_pl_pct ?? 0,
  dte_remaining: overrides.dte_remaining ?? 30,
  strategy: overrides.strategy ?? 'long_call',
  last_synced_at: overrides.last_synced_at ?? new Date(),
});

const buildService = () => {
  const prismaMock = {
    position_monitoring: {
      findMany: jest.fn(),
    },
    exit_signal: {
      create: jest.fn(),
      update: jest.fn(),
    },
    signal: {
      findFirst: jest.fn(),
    },
  } as unknown as MockedPrisma;

  const alpacaMock: AlpacaStub = {
    closePosition: jest.fn(),
  };

  const loggerMock: LoggerStub = {
    log: jest.fn(),
  };

  const service = new ExitManagementService(
    prismaMock as never,
    alpacaMock as never,
    loggerMock as never,
  );

  return { service, prismaMock, alpacaMock, loggerMock };
};

describe('ExitManagementService.evaluateAndExecute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fires stop_loss when unrealized_pl_pct is at or below -25%', async () => {
    const { service, prismaMock, alpacaMock } = buildService();
    prismaMock.position_monitoring.findMany.mockResolvedValue([
      buildPosition({ unrealized_pl_pct: -0.3, dte_remaining: 30 }),
    ] as never);
    prismaMock.exit_signal.create.mockResolvedValue({
      id: BigInt(99),
    } as never);
    alpacaMock.closePosition.mockResolvedValue({});

    await service.evaluateAndExecute();

    expect(prismaMock.exit_signal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trigger_type: 'stop_loss',
          threshold_value: -0.25,
        }),
      }),
    );
    expect(alpacaMock.closePosition).toHaveBeenCalledWith('SPY');
    expect(prismaMock.exit_signal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: BigInt(99) },
        data: expect.objectContaining({ executed: true }),
      }),
    );
  });

  it('fires profit_target when unrealized_pl_pct is at or above 35%', async () => {
    const { service, prismaMock, alpacaMock } = buildService();
    prismaMock.position_monitoring.findMany.mockResolvedValue([
      buildPosition({ unrealized_pl_pct: 0.4 }),
    ] as never);
    prismaMock.exit_signal.create.mockResolvedValue({ id: BigInt(1) } as never);
    alpacaMock.closePosition.mockResolvedValue({});

    await service.evaluateAndExecute();

    expect(prismaMock.exit_signal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trigger_type: 'profit_target',
          threshold_value: 0.35,
        }),
      }),
    );
  });

  it('fires theta_decay when dte_remaining drops to 3 or below', async () => {
    const { service, prismaMock, alpacaMock } = buildService();
    prismaMock.position_monitoring.findMany.mockResolvedValue([
      buildPosition({ unrealized_pl_pct: 0.05, dte_remaining: 2 }),
    ] as never);
    prismaMock.exit_signal.create.mockResolvedValue({ id: BigInt(1) } as never);
    alpacaMock.closePosition.mockResolvedValue({});

    await service.evaluateAndExecute();

    expect(prismaMock.exit_signal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trigger_type: 'theta_decay',
          threshold_value: 3,
        }),
      }),
    );
  });

  it('fires score_decay when latest signal composite_score_normalized drops below 45', async () => {
    const { service, prismaMock, alpacaMock } = buildService();
    prismaMock.position_monitoring.findMany.mockResolvedValue([
      buildPosition({ unrealized_pl_pct: 0.05, dte_remaining: 30 }),
    ] as never);
    prismaMock.signal.findFirst.mockResolvedValue({
      composite_score_normalized: 30,
    } as never);
    prismaMock.exit_signal.create.mockResolvedValue({ id: BigInt(1) } as never);
    alpacaMock.closePosition.mockResolvedValue({});

    await service.evaluateAndExecute();

    expect(prismaMock.exit_signal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trigger_type: 'score_decay',
          threshold_value: 45,
        }),
      }),
    );
  });

  it('does not fire any trigger for a healthy position', async () => {
    const { service, prismaMock, alpacaMock } = buildService();
    prismaMock.position_monitoring.findMany.mockResolvedValue([
      buildPosition({ unrealized_pl_pct: 0.1, dte_remaining: 21 }),
    ] as never);
    prismaMock.signal.findFirst.mockResolvedValue({
      composite_score_normalized: 70,
    } as never);

    await service.evaluateAndExecute();

    expect(prismaMock.exit_signal.create).not.toHaveBeenCalled();
    expect(alpacaMock.closePosition).not.toHaveBeenCalled();
  });

  it('deduplicates by symbol, evaluating only the most recent snapshot', async () => {
    const { service, prismaMock, alpacaMock } = buildService();
    prismaMock.position_monitoring.findMany.mockResolvedValue([
      buildPosition({ id: 2, unrealized_pl_pct: -0.3 }),
      buildPosition({ id: 1, unrealized_pl_pct: 0.0 }),
    ] as never);
    prismaMock.exit_signal.create.mockResolvedValue({ id: BigInt(1) } as never);
    alpacaMock.closePosition.mockResolvedValue({});

    await service.evaluateAndExecute();

    expect(prismaMock.exit_signal.create).toHaveBeenCalledTimes(1);
    expect(alpacaMock.closePosition).toHaveBeenCalledTimes(1);
  });

  it('logs an exit_error and leaves exit_signal unexecuted when closePosition throws', async () => {
    const { service, prismaMock, alpacaMock, loggerMock } = buildService();
    prismaMock.position_monitoring.findMany.mockResolvedValue([
      buildPosition({ unrealized_pl_pct: -0.3 }),
    ] as never);
    prismaMock.exit_signal.create.mockResolvedValue({ id: BigInt(7) } as never);
    alpacaMock.closePosition.mockRejectedValue(new Error('alpaca down'));

    await service.evaluateAndExecute();

    expect(prismaMock.exit_signal.update).not.toHaveBeenCalled();
    expect(loggerMock.log).toHaveBeenCalledWith(
      'error',
      'exit_error',
      expect.stringContaining('Failed exit for SPY'),
      expect.any(Object),
    );
  });

  it('prefers stop_loss over profit_target when both could apply (stop checked first)', async () => {
    const { service, prismaMock, alpacaMock } = buildService();
    prismaMock.position_monitoring.findMany.mockResolvedValue([
      buildPosition({ unrealized_pl_pct: -0.5, dte_remaining: 1 }),
    ] as never);
    prismaMock.exit_signal.create.mockResolvedValue({ id: BigInt(1) } as never);
    alpacaMock.closePosition.mockResolvedValue({});

    await service.evaluateAndExecute();

    expect(prismaMock.exit_signal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ trigger_type: 'stop_loss' }),
      }),
    );
  });
});
