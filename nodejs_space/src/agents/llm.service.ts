import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AgentLlmService {
  private readonly logger = new Logger(AgentLlmService.name);

  async completeJson<T>(params: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
  }): Promise<T | null> {
    const endpoint = process.env.ABACUS_AGENT_DEPLOYMENT_URL;
    const token = process.env.ABACUS_API_KEY;

    if (!endpoint || !token) {
      return null;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: params.systemPrompt },
            { role: 'user', content: params.userPrompt },
          ],
          temperature: params.temperature ?? 0.2,
        }),
      });

      if (!response.ok) {
        this.logger.warn(`Abacus LLM call failed with status ${response.status}`);
        return null;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const content = this.extractContent(payload);
      if (!content) {
        return null;
      }

      try {
        return JSON.parse(content) as T;
      } catch {
        this.logger.warn('LLM response was not valid JSON; using deterministic fallback');
        return null;
      }
    } catch (error) {
      this.logger.warn(
        `Abacus LLM integration unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private extractContent(payload: Record<string, unknown>): string | null {
    const direct = payload.content;
    if (typeof direct === 'string') {
      return direct;
    }

    const choices = payload.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0] as Record<string, unknown>;
      const message = first.message as Record<string, unknown> | undefined;
      const messageContent = message?.content;
      if (typeof messageContent === 'string') {
        return messageContent;
      }
    }

    return null;
  }
}
