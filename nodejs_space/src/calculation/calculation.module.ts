import { Module } from '@nestjs/common';
import { CalculationService } from './calculation.service.js';

@Module({
  providers: [CalculationService],
  exports: [CalculationService],
})
export class CalculationModule {}
