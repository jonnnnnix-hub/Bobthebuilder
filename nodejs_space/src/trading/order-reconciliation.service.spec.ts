import { OrderReconciliationService } from './order-reconciliation.service';
import type { MockedPrisma } from '../test/prisma-mock';
import type { AlpacaService } from '../alpaca/alpaca.service';
import type { TradingLoggerService } from './trading-logger.service';

describe('OrderReconciliationService.reconcileOpenOrders', () => {
  const prismaMock = {
    alpaca_order: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as MockedPrisma;

  const alpacaMock = {
    isConfigured: jest.fn().mockReturnValue(true),
    getOrder: jest.fn(),
  } as unknown as jest.Mocked<AlpacaService>;

  const loggerMock = {
    log: jest.fn(),
  } as unknown as jest.Mocked<TradingLoggerService>;

  let service: OrderReconciliationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrderReconciliationService(
      prismaMock,
      alpacaMock,
      loggerMock,
    );
    prismaMock.alpaca_order.update.mockResolvedValue({} as never);
  });

  it('updates orders that transitioned to filled', async () => {
    prismaMock.alpaca_order.findMany.mockResolvedValue([
      {
        id: 1n,
        alpaca_order_id: 'order-abc',
        status: 'accepted',
        symbol: 'AAPL',
      },
    ] as never);
    alpacaMock.getOrder.mockResolvedValue({
      status: 'filled',
      filled_at: '2026-04-16T14:30:00Z',
      filled_qty: '1',
      filled_avg_price: '142.50',
    } as never);

    const count = await service.reconcileOpenOrders();

    expect(count).toBe(1);
    expect(prismaMock.alpaca_order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1n },
        data: expect.objectContaining({
          status: 'filled',
          filled_quantity: 1,
          filled_avg_price: 142.5,
        }),
      }),
    );
  });

  it('logs a warning and continues when Alpaca lookup fails', async () => {
    prismaMock.alpaca_order.findMany.mockResolvedValue([
      {
        id: 2n,
        alpaca_order_id: 'order-missing',
        status: 'accepted',
        symbol: 'MSFT',
      },
    ] as never);
    alpacaMock.getOrder.mockRejectedValue(new Error('404 not found'));

    const count = await service.reconcileOpenOrders();

    expect(count).toBe(0);
    expect(loggerMock.log).toHaveBeenCalledWith(
      'warn',
      'order_reconciliation_failed',
      expect.stringContaining('order-missing'),
      expect.anything(),
    );
  });

  it('skips update when nothing changed', async () => {
    prismaMock.alpaca_order.findMany.mockResolvedValue([
      {
        id: 3n,
        alpaca_order_id: 'order-still-new',
        status: 'new',
        symbol: 'NVDA',
      },
    ] as never);
    alpacaMock.getOrder.mockResolvedValue({ status: 'new' } as never);

    const count = await service.reconcileOpenOrders();

    expect(count).toBe(0);
    expect(prismaMock.alpaca_order.update).not.toHaveBeenCalled();
  });
});
