import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  async onModuleInit() {
    try {
      await this.$connect();
      this.connected = true;
      this.logger.log('Database connected');
    } catch (error) {
      this.connected = false;
      this.logger.error('Database connection failed during startup');
      if (error instanceof Error) {
        this.logger.error(error.message);
      }
    }
  }

  async onModuleDestroy() {
    if (!this.connected) {
      return;
    }

    await this.$disconnect();
    this.connected = false;
    this.logger.log('Database disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }
}
