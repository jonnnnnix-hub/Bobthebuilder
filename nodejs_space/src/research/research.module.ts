import { Module } from '@nestjs/common';
import { ResearchController } from './research.controller.js';
import { ResearchService } from './research.service.js';

@Module({
  providers: [ResearchService],
  controllers: [ResearchController],
  exports: [ResearchService],
})
export class ResearchModule {}
