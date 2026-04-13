import { Module } from '@nestjs/common';
import { PolygonModule } from '../polygon/polygon.module.js';
import { MarketDataController } from './market-data.controller.js';
import { MarketDataService } from './market-data.service.js';

@Module({
  imports: [PolygonModule],
  providers: [MarketDataService],
  controllers: [MarketDataController],
  exports: [MarketDataService],
})
export class MarketDataModule {}
