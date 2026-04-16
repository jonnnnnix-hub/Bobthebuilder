import { validateEnv } from './env-validation';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgres://x',
    POLYGON_API_KEY: 'p',
    ALPACA_API_KEY: 'k',
    ALPACA_API_SECRET: 's',
  };

  it('passes when all required vars are set', () => {
    expect(() => validateEnv({ ...base })).not.toThrow();
  });

  it('throws listing missing required vars', () => {
    expect(() =>
      validateEnv({ ...base, ALPACA_API_KEY: '', POLYGON_API_KEY: undefined }),
    ).toThrow(/POLYGON_API_KEY, ALPACA_API_KEY/);
  });

  it('includes .env.example hint in the error message', () => {
    expect(() => validateEnv({})).toThrow(/\.env\.example/);
  });
});
