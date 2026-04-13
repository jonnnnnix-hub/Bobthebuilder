import { Module } from '@nestjs/common';
import { SignalsController } from './signals.controller.js';

@Module({
  controllers: [SignalsController],
})
export class SignalsModule {}
