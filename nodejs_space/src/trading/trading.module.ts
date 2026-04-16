import { Module } from '@nestjs/common';
import { AlpacaModule } from '../alpaca/alpaca.module.js';
import { DecisionEngineService } from './decision-engine.service.js';
import { AutonomousRiskService } from './autonomous-risk.service.js';
import { AutonomousExecutionService } from './autonomous-execution.service.js';
import { ExitManagementService } from './exit-management.service.js';
import { OrderReconciliationService } from './order-reconciliation.service.js';
import { TradingController } from './trading.controller.js';
import { TradingService } from './trading.service.js';
import { TradingLoggerService } from './trading-logger.service.js';

@Module({
  imports: [AlpacaModule],
  providers: [
    DecisionEngineService,
    AutonomousRiskService,
    TradingLoggerService,
    ExitManagementService,
    AutonomousExecutionService,
    OrderReconciliationService,
    TradingService,
  ],
  controllers: [TradingController],
})
export class TradingModule {}
