import { Module } from '@nestjs/common';
import { AlpacaService } from './alpaca.service.js';

@Module({
  providers: [AlpacaService],
  exports: [AlpacaService],
})
export class AlpacaModule {}
