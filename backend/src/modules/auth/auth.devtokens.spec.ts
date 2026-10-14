import { UserRole } from '../../generated/prisma/enums';
import { AuthService } from './auth.service';
import type { AppConfig } from '../../config/app-config';

const RESET_MESSAGE = 'If the account exists, a reset link has been sent';
const VERIFY_MESSAGE = 'If the account needs verification, a link has been sent';

function configWith(exposeTokens: boolean): AppConfig {
  return {
    google: {
      enabled: false,
      callbackUrl: 'http://localhost/callback',
      clientId: '',
      clientSecret: '',
    },
    app: { frontendUrl: 'http://localhost:3001', corsOrigins: ['http://localhost:3001'] },
    jwt: { accessTokenTtlSeconds: 900, refreshTokenTtlDays: 30 },
    dev: { exposeTokens },
  } as unknown as AppConfig;
}

/**
 * Builds a service whose `user.findUnique` resolves to an active account, so the
 * happy path that issues a token is reached.
 */
function harness(exposeTokens: boolean, status = 'ACTIVE') {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'person@example.com',
        status,
      }),
      create: jest.fn(),
      update: jest.fn(),
    },
    passwordResetToken: { create: jest.fn().mockResolvedValue({}) },
    emailVerificationToken: { create: jest.fn().mockResolvedValue({}) },
  };

  const crypto = {
    generateOpaqueToken: jest.fn().mockReturnValue('raw-token-value'),
    hashToken: jest.fn((v: string) => `hashed:${v}`),
  };

  const mail = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AuthService(
    prisma as never,
    {} as never,
    crypto as never,
    mail as never,
    {} as never,
    configWith(exposeTokens),
  );

  return { service, prisma, crypto, mail };
}

describe('forgotPassword dev token surfacing', () => {
  it('omits the token when the flag is off', async () => {
    const { service } = harness(false);

    const result = await service.forgotPassword({ email: 'person@example.com' });

    expect(result).toEqual({ message: RESET_MESSAGE });
    expect(result).not.toHaveProperty('devToken');
  });

  it('returns the token when the flag is on', async () => {
    const { service } = harness(true);

    const result = await service.forgotPassword({ email: 'person@example.com' });

    expect(result).toEqual({ message: RESET_MESSAGE, devToken: 'raw-token-value' });
  });

  it('keeps the message identical so it cannot enumerate accounts', async () => {
    const { service } = harness(true);
    const missing = harness(true);
    missing.prisma.user.findUnique.mockResolvedValue(null);

    const known = await service.forgotPassword({ email: 'person@example.com' });
    const unknown = await missing.service.forgotPassword({ email: 'nobody@example.com' });

    expect(known.message).toBe(unknown.message);
  });

  it('sends no token at all when the account is unknown, even in dev', async () => {
    const { service, prisma } = harness(true);
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.forgotPassword({ email: 'nobody@example.com' });

    expect(result).not.toHaveProperty('devToken');
  });
});

describe('resendVerificationEmail dev token surfacing', () => {
  it('omits the token when the flag is off', async () => {
    const { service } = harness(false, 'PENDING_VERIFICATION');

    const result = await service.resendVerificationEmail('person@example.com');

    expect(result).toEqual({ message: VERIFY_MESSAGE });
  });

  it('returns the token when the flag is on and the account is still pending', async () => {
    const { service } = harness(true, 'PENDING_VERIFICATION');

    const result = await service.resendVerificationEmail('person@example.com');

    expect(result).toEqual({ message: VERIFY_MESSAGE, devToken: 'raw-token-value' });
  });

  it('returns nothing extra once the account is already active', async () => {
    const { service } = harness(true, 'ACTIVE');

    const result = await service.resendVerificationEmail('person@example.com');

    expect(result).not.toHaveProperty('devToken');
  });
});

describe('register dev token surfacing', () => {
  const createdUser = {
    id: 'user-1',
    email: 'person@example.com',
    firstName: 'Person',
    lastName: null,
    phone: null,
    role: UserRole.TENANT,
    status: 'PENDING_VERIFICATION',
    emailVerifiedAt: null,
    tenant: { id: 'tenant-1' },
    createdAt: new Date(),
  };

  function registerHarness(exposeTokens: boolean) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdUser),
      },
      emailVerificationToken: { create: jest.fn().mockResolvedValue({}) },
    };
    const crypto = {
      hashPassword: jest.fn().mockResolvedValue('argon-hash'),
      generateOpaqueToken: jest.fn().mockReturnValue('raw-token-value'),
      hashToken: jest.fn((v: string) => `hashed:${v}`),
    };
    const mail = { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };

    const service = new AuthService(
      prisma as never,
      {} as never,
      crypto as never,
      mail as never,
      {} as never,
      configWith(exposeTokens),
    );

    return { service };
  }

  it('omits the token when the flag is off', async () => {
    const { service } = registerHarness(false);

    const view = await service.register({
      email: 'person@example.com',
      password: 'Str0ng!Passphrase1',
      firstName: 'Person',
    });

    expect(view).not.toHaveProperty('devVerificationToken');
    expect(view.tenantId).toBe('tenant-1');
  });

  it('returns the token when the flag is on', async () => {
    const { service } = registerHarness(true);

    const view = await service.register({
      email: 'person@example.com',
      password: 'Str0ng!Passphrase1',
      firstName: 'Person',
    });

    expect(view.devVerificationToken).toBe('raw-token-value');
  });
});
