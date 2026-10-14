import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean'
      ? value
      : ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()),
  );

const DURATION_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`Unsupported duration "${value}". Use forms like 15m, 12h, 30d.`);
  }

  return Number(match[1]) * DURATION_UNITS[match[2]];
}

const numeric = (fallback: number) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((value) => (value === undefined || value === '' ? fallback : Number(value)));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: numeric(3000),
    TRUST_PROXY: booleanish.default(false),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DIRECT_URL: z.string().optional(),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    JWT_ISSUER: z.string().default('senti-rental-api'),
    JWT_AUDIENCE: z.string().default('senti-rental-mobile'),
    REFRESH_TOKEN_TTL_DAYS: numeric(30),
    TOKEN_PEPPER: z.string().min(32, 'TOKEN_PEPPER must be at least 32 characters'),

    GOOGLE_AUTH_ENABLED: booleanish.default(false),
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    GOOGLE_CALLBACK_URL: z.string().default('http://localhost:3000/api/v1/auth/google/callback'),

    FRONTEND_URL: z.string().default('http://localhost:3001'),
    CORS_ORIGINS: z.string().default('http://localhost:3001'),

    MAIL_ENABLED: booleanish.default(false),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: numeric(1025),
    SMTP_SECURE: booleanish.default(false),
    SMTP_USER: z.string().default(''),
    SMTP_PASSWORD: z.string().default(''),
    MAIL_FROM: z.string().default('no-reply@senti-rental.local'),

    SWAGGER_ENABLED: booleanish.default(true),
    RATE_LIMIT_TTL_MS: numeric(60_000),
    RATE_LIMIT_MAX: numeric(100),

    DEV_EXPOSE_TOKENS: booleanish.default(false),

    ARGON2_MEMORY_COST: numeric(65_536),
    ARGON2_TIME_COST: numeric(3),
    ARGON2_PARALLELISM: numeric(1),
    ARGON2_OUTPUT_LENGTH: numeric(32),
  })
  .superRefine((value, ctx) => {
    // This flag returns raw verification and reset tokens in API responses so the
    // mobile client can test those flows without a mail server. It must never be
    // reachable in production, so fail the boot rather than quietly ignoring it.
    if (value.NODE_ENV === 'production' && value.DEV_EXPOSE_TOKENS) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEV_EXPOSE_TOKENS'],
        message:
          'DEV_EXPOSE_TOKENS cannot be enabled when NODE_ENV=production — it exposes raw auth tokens in API responses',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  app: {
    env: Env['NODE_ENV'];
    isProduction: boolean;
    port: number;
    trustProxy: boolean;
    frontendUrl: string;
    corsOrigins: string[];
    swaggerEnabled: boolean;
    apiPrefix: string;
  };
  database: {
    url: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    accessTokenTtlSeconds: number;
    issuer: string;
    audience: string;
    refreshTokenTtlDays: number;
  };
  security: {
    tokenPepper: string;
    argon2: {
      memoryCost: number;
      timeCost: number;
      parallelism: number;
      outputLength: number;
    };
  };
  rateLimit: {
    ttlMs: number;
    max: number;
  };
  dev: {
    exposeTokens: boolean;
  };
  google: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
  mail: {
    enabled: boolean;
    from: string;
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      password: string;
    };
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const value = parsed.data;

  return {
    app: {
      env: value.NODE_ENV,
      isProduction: value.NODE_ENV === 'production',
      port: value.PORT,
      trustProxy: value.TRUST_PROXY,
      frontendUrl: value.FRONTEND_URL,
      corsOrigins: value.CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
      swaggerEnabled: value.SWAGGER_ENABLED,
      apiPrefix: 'api/v1',
    },
    database: {
      url: value.DATABASE_URL,
    },
    jwt: {
      secret: value.JWT_SECRET,
      expiresIn: value.JWT_EXPIRES_IN,
      accessTokenTtlSeconds: parseDurationToSeconds(value.JWT_EXPIRES_IN),
      issuer: value.JWT_ISSUER,
      audience: value.JWT_AUDIENCE,
      refreshTokenTtlDays: value.REFRESH_TOKEN_TTL_DAYS,
    },
    security: {
      tokenPepper: value.TOKEN_PEPPER,
      argon2: {
        memoryCost: value.ARGON2_MEMORY_COST,
        timeCost: value.ARGON2_TIME_COST,
        parallelism: value.ARGON2_PARALLELISM,
        outputLength: value.ARGON2_OUTPUT_LENGTH,
      },
    },
    rateLimit: {
      ttlMs: value.RATE_LIMIT_TTL_MS,
      max: value.RATE_LIMIT_MAX,
    },
    dev: {
      exposeTokens: value.DEV_EXPOSE_TOKENS,
    },
    google: {
      enabled: value.GOOGLE_AUTH_ENABLED,
      clientId: value.GOOGLE_CLIENT_ID,
      clientSecret: value.GOOGLE_CLIENT_SECRET,
      callbackUrl: value.GOOGLE_CALLBACK_URL,
    },
    mail: {
      enabled: value.MAIL_ENABLED,
      from: value.MAIL_FROM,
      smtp: {
        host: value.SMTP_HOST,
        port: value.SMTP_PORT,
        secure: value.SMTP_SECURE,
        user: value.SMTP_USER,
        password: value.SMTP_PASSWORD,
      },
    },
  };
}

export const APP_CONFIG_PROVIDER = {
  provide: APP_CONFIG,
  useFactory: () => loadAppConfig(),
};
