import { UnauthorizedException } from '@nestjs/common';
import { UserRole, type UserStatus } from '../../generated/prisma/enums';
import { AuthService } from './auth.service';
import type { AppConfig } from '../../config/app-config';
import type { AuthenticatedUser } from '../../common/types/auth.types';

const CALLBACK_URL = 'http://localhost:3000/api/v1/auth/google/callback';

const config = {
  google: { enabled: true, callbackUrl: CALLBACK_URL },
  app: { frontendUrl: 'http://localhost:3001', corsOrigins: ['http://localhost:3001'] },
  jwt: { accessTokenTtlSeconds: 900, refreshTokenTtlDays: 30 },
  dev: { exposeTokens: false },
} as unknown as AppConfig;

function harness(overrides: { flow?: Record<string, unknown> | null; email?: string } = {}) {
  const flow =
    'flow' in overrides
      ? overrides.flow
      : {
          id: 'flow-1',
          consumedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          redirectUri: 'http://localhost:3001',
          codeVerifierEncrypted: 'verifier-1',
        };

  const prisma = {
    oAuthFlow: {
      findUnique: jest.fn().mockResolvedValue(flow),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'person@example.com',
        role: UserRole.TENANT,
        status: 'ACTIVE',
        authVersion: 3,
        tenant: { id: 'tenant-1' },
      }),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn(),
    },
    authIdentity: { upsert: jest.fn() },
  };

  const googleOAuth = {
    exchangeCode: jest.fn().mockResolvedValue({ accessToken: 'google-access' }),
    fetchUserInfo: jest.fn().mockResolvedValue({
      subject: 'google-sub',
      email: overrides.email ?? 'person@example.com',
      emailVerified: true,
      givenName: 'Person',
      familyName: 'Example',
    }),
  };

  const tokenService = {
    startSession: jest.fn().mockResolvedValue({ token: 'refresh-1', expiresAt: new Date() }),
    signAccessToken: jest.fn().mockReturnValue('access-1'),
  };

  const crypto = {
    hashToken: jest.fn((value: string) => `hashed:${value}`),
  };

  const service = new AuthService(
    prisma as never,
    tokenService as never,
    crypto as never,
    {} as never,
    googleOAuth as never,
    config,
  );

  return { service, googleOAuth };
}

const fingerprint = { ipAddress: '10.0.0.1', userAgent: 'jest' };

describe('AuthService.completeGoogleLogin', () => {
  it('sends the configured callback url as the Google redirect_uri', async () => {
    const { service, googleOAuth } = harness();

    await service.completeGoogleLogin({ code: 'auth-code', state: 'state-1' }, fingerprint);

    expect(googleOAuth.exchangeCode).toHaveBeenCalledWith({
      code: 'auth-code',
      redirectUri: CALLBACK_URL,
      codeVerifier: 'verifier-1',
    });
  });

  it('does not let a caller-supplied redirectUri reach Google', async () => {
    const { service, googleOAuth } = harness();

    await service.completeGoogleLogin(
      {
        code: 'auth-code',
        state: 'state-1',
        redirectUri: 'http://localhost:3001/evil',
      },
      fingerprint,
    );

    const passed = googleOAuth.exchangeCode.mock.calls[0][0] as { redirectUri: string };
    expect(passed.redirectUri).toBe(CALLBACK_URL);
  });

  it('rejects a consumed or expired state before contacting Google', async () => {
    const { service, googleOAuth } = harness({ flow: null });

    await expect(
      service.completeGoogleLogin({ code: 'auth-code', state: 'state-1' }, fingerprint),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(googleOAuth.exchangeCode).not.toHaveBeenCalled();
  });

  it('returns a token pair with the tenant tenantId attached', async () => {
    const { service } = harness();

    const result = await service.completeGoogleLogin(
      { code: 'auth-code', state: 'state-1' },
      fingerprint,
    );

    expect(result.accessToken).toBe('access-1');
    expect(result.refreshToken).toBe('refresh-1');
    expect(result.user).toEqual({
      id: 'user-1',
      email: 'person@example.com',
      role: UserRole.TENANT,
      status: 'ACTIVE' as UserStatus,
      authVersion: 3,
      tenantId: 'tenant-1',
    } satisfies AuthenticatedUser);
  });
});
