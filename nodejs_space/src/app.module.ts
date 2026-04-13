import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PolygonModule,
    MarketDataModule,
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
