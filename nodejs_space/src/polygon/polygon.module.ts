import { Module } from '@nestjs/common';
import { PolygonService } from './polygon.service.js';

@Module({
  providers: [PolygonService],
  exports: [PolygonService],
})
export class PolygonModule {}
