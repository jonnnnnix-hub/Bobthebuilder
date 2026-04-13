import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class TradingLoggerService {
  private readonly logger = new Logger(TradingLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(
    level: 'info' | 'warn' | 'error',
    eventType: string,
    message: string,
    options?: { symbol?: string; payload?: Record<string, unknown> },
  ): Promise<void> {
    if (level === 'error') this.logger.error(message);
    else if (level === 'warn') this.logger.warn(message);
    else this.logger.log(message);

    await this.prisma.trading_log.create({
      data: {
        level,
        event_type: eventType,
        symbol: options?.symbol,
        message,
        payload: options?.payload
          ? (JSON.parse(
              JSON.stringify(options.payload),
            ) as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }
}
