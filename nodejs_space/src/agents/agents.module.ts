import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller.js';
import { AgentLlmService } from './llm.service.js';
import { SpecialistAgentsFactory } from './specialist-agents.js';
import { DebateOrchestratorService } from './debate-orchestrator.service.js';
import { AgentsService } from './agents.service.js';

@Module({
  providers: [
    AgentLlmService,
    SpecialistAgentsFactory,
    DebateOrchestratorService,
    AgentsService,
  ],
  controllers: [AgentsController],
  exports: [DebateOrchestratorService, AgentsService],
})
export class AgentsModule {}
