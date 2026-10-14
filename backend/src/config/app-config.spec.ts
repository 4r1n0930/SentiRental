import { APP_CONFIG, loadAppConfig, parseDurationToSeconds } from './app-config';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(32),
  TOKEN_PEPPER: 'b'.repeat(32),
};

describe('loadAppConfig', () => {
  it('parses a minimal environment', () => {
    const config = loadAppConfig(baseEnv);

    expect(config.database.url).toBe(baseEnv.DATABASE_URL);
    expect(config.app.apiPrefix).toBe('api/v1');
    expect(config.app.isProduction).toBe(false);
    expect(config.jwt.accessTokenTtlSeconds).toBe(900);
  });

  it('splits CORS origins and trims whitespace', () => {
    const config = loadAppConfig({ ...baseEnv, CORS_ORIGINS: 'http://a.test , http://b.test' });

    expect(config.app.corsOrigins).toEqual(['http://a.test', 'http://b.test']);
  });

  it('coerces booleanish values', () => {
    expect(loadAppConfig({ ...baseEnv, MAIL_ENABLED: 'true' }).mail.enabled).toBe(true);
    expect(loadAppConfig({ ...baseEnv, MAIL_ENABLED: 'no' }).mail.enabled).toBe(false);
    expect(loadAppConfig({ ...baseEnv, TRUST_PROXY: '1' }).app.trustProxy).toBe(true);
  });

  it('rejects missing or weak secrets', () => {
    expect(() => loadAppConfig({ ...baseEnv, JWT_SECRET: 'short' })).toThrow(
      /Invalid environment configuration/,
    );
    expect(() => loadAppConfig({ JWT_SECRET: 'a'.repeat(32) })).toThrow(/DATABASE_URL/);
  });

  it('exposes a stable injection token', () => {
    expect(typeof APP_CONFIG).toBe('symbol');
  });
});

describe('DEV_EXPOSE_TOKENS', () => {
  it('defaults to off', () => {
    expect(loadAppConfig(baseEnv).dev.exposeTokens).toBe(false);
  });

  it('can be switched on outside production', () => {
    const config = loadAppConfig({
      ...baseEnv,
      NODE_ENV: 'development',
      DEV_EXPOSE_TOKENS: 'true',
    });

    expect(config.dev.exposeTokens).toBe(true);
  });

  it('tolerates trailing whitespace in an env block', () => {
    const config = loadAppConfig({ ...baseEnv, DEV_EXPOSE_TOKENS: 'true ' });

    expect(config.dev.exposeTokens).toBe(true);
  });

  it('refuses to boot in production when enabled', () => {
    expect(() =>
      loadAppConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        DEV_EXPOSE_TOKENS: 'true',
      }),
    ).toThrow(/DEV_EXPOSE_TOKENS cannot be enabled when NODE_ENV=production/);
  });

  it('allows production when left off', () => {
    const config = loadAppConfig({ ...baseEnv, NODE_ENV: 'production' });

    expect(config.app.isProduction).toBe(true);
    expect(config.dev.exposeTokens).toBe(false);
  });
});

describe('parseDurationToSeconds', () => {
  it('supports s, m, h and d units', () => {
    expect(parseDurationToSeconds('30s')).toBe(30);
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('2h')).toBe(7200);
    expect(parseDurationToSeconds('7d')).toBe(604800);
  });

  it('throws on unsupported formats', () => {
    expect(() => parseDurationToSeconds('15 minutes')).toThrow(/Unsupported duration/);
  });
});
