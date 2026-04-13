import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OratsModule } from '../orats/orats.module.js';
import { PolygonModule } from '../polygon/polygon.module.js';
import { OptionsDataQualityValidator } from './data-quality.validator.js';
import { OptionsDataService } from './options-data.service.js';
import { OratsOptionsProvider } from './orats-options.provider.js';
import { PolygonOptionsProvider } from './polygon-options.provider.js';

@Module({
  imports: [ConfigModule, PolygonModule, OratsModule],
  providers: [
    OptionsDataQualityValidator,
    PolygonOptionsProvider,
    OratsOptionsProvider,
    OptionsDataService,
  ],
  exports: [OptionsDataService],
})
export class OptionsDataModule {}
