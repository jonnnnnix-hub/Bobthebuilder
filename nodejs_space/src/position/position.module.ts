import { Module } from '@nestjs/common';
import { PositionService } from './position.service.js';
import { PositionController } from './position.controller.js';
import { PolygonModule } from '../polygon/polygon.module.js';

@Module({
  imports: [PolygonModule],
  providers: [PositionService],
  controllers: [PositionController],
  exports: [PositionService],
})
export class PositionModule {}
