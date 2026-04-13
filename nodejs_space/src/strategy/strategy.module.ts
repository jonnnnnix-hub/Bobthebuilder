import { Module } from '@nestjs/common';
import { StrategyService } from './strategy.service.js';
import { StrategyController } from './strategy.controller.js';

@Module({
  providers: [StrategyService],
  controllers: [StrategyController],
  exports: [StrategyService],
})
export class StrategyModule {}
