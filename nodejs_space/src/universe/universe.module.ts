import { Module } from '@nestjs/common';
import { UniverseController } from './universe.controller.js';

@Module({
  controllers: [UniverseController],
})
export class UniverseModule {}
