import { AGENT_NAMES } from '../interfaces';
import { getPromptTemplate } from './templates';

describe('Agent prompt templates', () => {
  it('provides a versioned prompt for all specialists', () => {
    for (const agent of AGENT_NAMES) {
      const template = getPromptTemplate(agent);
      expect(template.agent).toBe(agent);
      expect(template.version).toBe('v1');
      expect(template.systemPrompt.length).toBeGreaterThan(30);
      expect(template.guidelines.length).toBeGreaterThan(0);
      expect(template.outputSchemaDescription).toContain('JSON');
    }
  });
});
