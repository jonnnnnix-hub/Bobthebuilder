import { Module } from '@nestjs/common';
import { TradeService } from './trade.service.js';
import { TradeController } from './trade.controller.js';
import { StrategyModule } from '../strategy/strategy.module.js';

@Module({
  imports: [StrategyModule],
  providers: [TradeService],
  controllers: [TradeController],
  exports: [TradeService],
})
export class TradeModule {}
