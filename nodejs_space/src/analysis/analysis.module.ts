import { Module } from '@nestjs/common';
import { AnalysisService } from './analysis.service.js';
import { AnalysisController } from './analysis.controller.js';
import { PolygonModule } from '../polygon/polygon.module.js';
import { CalculationModule } from '../calculation/calculation.module.js';
import { OratsModule } from '../orats/orats.module.js';
import { MarketDataModule } from '../market-data/market-data.module.js';

@Module({
  imports: [PolygonModule, MarketDataModule, CalculationModule, OratsModule],
  providers: [AnalysisService],
  controllers: [AnalysisController],
  exports: [AnalysisService],
})
export class AnalysisModule {}
