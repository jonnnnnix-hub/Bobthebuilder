import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module.js';
import { PolygonModule } from './polygon/polygon.module.js';
import { CalculationModule } from './calculation/calculation.module.js';
import { AnalysisModule } from './analysis/analysis.module.js';
import { SignalsModule } from './signals/signals.module.js';
import { UniverseModule } from './universe/universe.module.js';
import { ConfigSettingsModule } from './config/config-settings.module.js';
import { HealthController } from './health/health.controller.js';
import { OratsModule } from './orats/orats.module.js';
import { MarketDataModule } from './market-data/market-data.module.js';
import { ResearchModule } from './research/research.module.js';
import { StrategyModule } from './strategy/strategy.module.js';
import { TradeModule } from './trade/trade.module.js';
import { PositionModule } from './position/position.module.js';
import { RiskModule } from './risk/risk.module.js';
import { OptionsDataModule } from './options-data/options-data.module.js';
import { OptionsIngestionModule } from './options-ingestion/options-ingestion.module.js';
import { AlpacaModule } from './alpaca/alpaca.module.js';
import { TradingModule } from './trading/trading.module.js';
import { AgentsModule } from './agents/agents.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    PolygonModule,
    MarketDataModule,
    OptionsDataModule,
    OptionsIngestionModule,
    CalculationModule,
    OratsModule,
    AnalysisModule,
    ResearchModule,
    SignalsModule,
    UniverseModule,
    ConfigSettingsModule,
    StrategyModule,
    TradeModule,
    PositionModule,
    RiskModule,
    AlpacaModule,
    TradingModule,
    AgentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
