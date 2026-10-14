import 'dotenv/config';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.PORT = process.env.PORT ?? '3000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  'postgresql://senti:senti@localhost:5432/senti_rental_test';
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'senti-rental-api';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'senti-rental-mobile';
process.env.REFRESH_TOKEN_TTL_DAYS = process.env.REFRESH_TOKEN_TTL_DAYS ?? '30';
process.env.TOKEN_PEPPER =
  process.env.TOKEN_PEPPER ?? 'test-token-pepper-that-is-at-least-32-characters';
process.env.GOOGLE_AUTH_ENABLED = process.env.GOOGLE_AUTH_ENABLED ?? 'false';
process.env.FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3001';
process.env.MAIL_ENABLED = process.env.MAIL_ENABLED ?? 'false';
process.env.SWAGGER_ENABLED = process.env.SWAGGER_ENABLED ?? 'true';
