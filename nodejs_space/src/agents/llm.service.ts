import { Injectable, Logger } from '@nestjs/common';

/**
 * LLM service for Bob's 11 specialist debate agents.
 *
 * ARCHITECTURAL DISTINCTION (from consolidation plan):
 * - Syntax-Labs = "diverse models disagree productively" (3+ providers)
 * - Bobthebuilder = "one model thinks deeply from 11 perspectives" (Claude only)
 *
 * Uses direct Anthropic API for deep, consistent reasoning with:
 * - Long system prompts with detailed analytical frameworks per agent
 * - Temperature 0.1 for deterministic analytical output
 * - Prompt caching for the 11 agent system prompts (they repeat every debate)
 *
 * Falls back to AbacusAI if ANTHROPIC_API_KEY is not set (backward compat).
 */
@Injectable()
export class AgentLlmService {
  private readonly logger = new Logger(AgentLlmService.name);

  async completeJson<T>(params: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
  }): Promise<T | null> {
    // Prefer direct Anthropic API
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      return this.callAnthropic<T>(params, anthropicKey);
    }

    // Fallback to AbacusAI for backward compatibility
    return this.callAbacus<T>(params);
  }

  /**
   * Direct Anthropic API call with prompt caching.
   * Bob's 11 agent system prompts are cached — they repeat every debate.
   */
  private async callAnthropic<T>(
    params: {
      systemPrompt: string;
      userPrompt: string;
      temperature?: number;
    },
    apiKey: string,
  ): Promise<T | null> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
          max_tokens: 4096,
          temperature: params.temperature ?? 0.1,
          system: [
            {
              type: 'text',
              text: params.systemPrompt,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [
            { role: 'user', content: params.userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        this.logger.warn(`Anthropic API failed: ${response.status}`);
        return null;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const content = this.extractAnthropicContent(payload);
      if (!content) return null;

      try {
        return JSON.parse(content) as T;
      } catch {
        this.logger.warn('Anthropic response not valid JSON; deterministic fallback');
        return null;
      }
    } catch (error) {
      this.logger.warn(
        `Anthropic API unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /** Fallback: AbacusAI gateway (original implementation). */
  private async callAbacus<T>(params: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
  }): Promise<T | null> {
    const endpoint = process.env.ABACUS_AGENT_DEPLOYMENT_URL;
    const token = process.env.ABACUS_API_KEY;

    if (!endpoint || !token) return null;

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

      if (!response.ok) return null;

      const payload = (await response.json()) as Record<string, unknown>;
      const content = this.extractOpenAIContent(payload);
      if (!content) return null;

      try {
        return JSON.parse(content) as T;
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  }

  private extractAnthropicContent(payload: Record<string, unknown>): string | null {
    const content = payload.content;
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0] as Record<string, unknown>;
      if (typeof first.text === 'string') return first.text;
    }
    return null;
  }

  private extractOpenAIContent(payload: Record<string, unknown>): string | null {
    const direct = payload.content;
    if (typeof direct === 'string') return direct;

    const choices = payload.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0] as Record<string, unknown>;
      const message = first.message as Record<string, unknown> | undefined;
      if (typeof message?.content === 'string') return message.content;
    }
    return null;
  }
}
