const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'POLYGON_API_KEY',
  'ALPACA_API_KEY',
  'ALPACA_API_SECRET',
] as const;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = config[key];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `See .env.example for the full list.`,
    );
  }

  return config;
}
