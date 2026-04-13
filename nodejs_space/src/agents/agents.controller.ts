import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { parseIntegerQuery } from '../common/query.utils.js';
import { AgentsService } from './agents.service.js';

@ApiTags('agents')
@Controller('/api/agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post('/debate')
  @ApiOperation({ summary: 'Initiate 3-round debate for a signal' })
  async initiateDebate(
    @Body('signal_id', ParseIntPipe) signalId: number,
    @Res() res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const result = await this.agentsService.initiateDebate(signalId);
    return res.json({
      debate_id: result.debateId.toString(),
      signal_id: result.signalId,
      symbol: result.symbol,
      consensus: result.consensus,
    });
  }

  @Get('/debates/:id')
  @ApiOperation({ summary: 'Get full debate transcript and votes' })
  async getDebate(@Param('id') id: string, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    if (!/^\d+$/.test(id)) {
      throw new BadRequestException('id must be a positive integer');
    }

    const debate = await this.agentsService.getDebate(BigInt(id));
    if (!debate) {
      throw new NotFoundException('Debate not found');
    }

    return res.json(debate);
  }

  @Get('/debates')
  @ApiOperation({ summary: 'List debate sessions' })
  async listDebates(
    @Query('limit') limit: string | undefined,
    @Res() res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const parsedLimit = parseIntegerQuery(limit, 'limit', 50, {
      min: 1,
      max: 500,
    });
    return res.json(await this.agentsService.listDebates(parsedLimit));
  }

  @Get('/stats')
  @ApiOperation({ summary: 'Agent debate/voting performance statistics' })
  async getStats(@Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return res.json(await this.agentsService.getStats());
  }
}
