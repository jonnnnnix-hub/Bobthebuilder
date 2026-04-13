import { Controller, Get, Logger, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Response } from 'express';

@ApiTags('Configuration')
@Controller('api/config')
export class ConfigController {
  private readonly logger = new Logger(ConfigController.name);

  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Get configuration', description: 'Returns all system configuration settings' })
  @ApiResponse({ status: 200, description: 'Configuration settings' })
  async getConfig(@Res({ passthrough: true }) res?: Response) {
    res?.setHeader('Cache-Control', 'no-store');

    const configs = await this.prisma.configuration.findMany({
      orderBy: { key: 'asc' },
    });

    const configMap: Record<string, { value: string; description: string | null }> = {};
    for (const c of configs) {
      configMap[c.key] = { value: c.value, description: c.description };
    }

    return configMap;
  }
}
