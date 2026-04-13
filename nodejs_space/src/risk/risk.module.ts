import { Module } from '@nestjs/common';
import { RiskService } from './risk.service.js';
import { RiskController } from './risk.controller.js';

@Module({
  providers: [RiskService],
  controllers: [RiskController],
  exports: [RiskService],
})
export class RiskModule {}
