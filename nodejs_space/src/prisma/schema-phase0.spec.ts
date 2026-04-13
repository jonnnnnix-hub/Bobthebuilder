import { readFileSync } from 'fs';
import { join } from 'path';

describe('Prisma Phase 0 schema coverage', () => {
  it('contains required Phase 0 models', () => {
    const schema = readFileSync(
      join(process.cwd(), 'prisma', 'schema.prisma'),
      'utf8',
    );
    expect(schema).toContain('model option_chain_snapshot');
    expect(schema).toContain('model backtest_result');
    expect(schema).toContain('model agent_vote');
    expect(schema).toContain('model loss_autopsy');
    expect(schema).toContain('model model_iteration');
    expect(schema).toContain('model fill_policy_config');
  });
});
