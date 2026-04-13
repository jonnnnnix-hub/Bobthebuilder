import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OptionsDataModule } from '../options-data/options-data.module.js';
import { OptionsIngestionService } from './options-ingestion.service.js';

@Module({
  imports: [PrismaModule, OptionsDataModule],
  providers: [OptionsIngestionService],
  exports: [OptionsIngestionService],
})
export class OptionsIngestionModule {}
