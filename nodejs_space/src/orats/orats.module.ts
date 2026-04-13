import { Module } from '@nestjs/common';
import { OratsService } from './orats.service.js';

@Module({
  providers: [OratsService],
  exports: [OratsService],
})
export class OratsModule {}
