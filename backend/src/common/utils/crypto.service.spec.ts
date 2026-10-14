import { Test } from '@nestjs/testing';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { CryptoService } from './crypto.service';

const config = {
  security: {
    tokenPepper: 'p'.repeat(32),
    argon2: { memoryCost: 8192, timeCost: 1, parallelism: 1, outputLength: 32 },
  },
} as AppConfig;

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CryptoService, { provide: APP_CONFIG, useValue: config }],
    }).compile();

    service = moduleRef.get(CryptoService);
  });

  it('hashes and verifies passwords', async () => {
    const hash = await service.hashPassword('Str0ng!Passw0rd');

    expect(hash).not.toBe('Str0ng!Passw0rd');
    await expect(service.verifyPassword(hash, 'Str0ng!Passw0rd')).resolves.toBe(true);
    await expect(service.verifyPassword(hash, 'wrong')).resolves.toBe(false);
  });

  it('returns false for malformed password hashes', async () => {
    await expect(service.verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
  });

  it('produces url-safe opaque tokens of sufficient entropy', () => {
    const token = service.generateOpaqueToken();

    expect(token.length).toBeGreaterThanOrEqual(64);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(service.generateOpaqueToken()).not.toBe(token);
  });

  it('hashes tokens deterministically and peppered', () => {
    const hash = service.hashToken('refresh-token');

    expect(hash).toHaveLength(64);
    expect(service.hashToken('refresh-token')).toBe(hash);
    expect(service.hashTokenMatches('refresh-token', hash)).toBe(true);
    expect(service.hashTokenMatches('other-token', hash)).toBe(false);
  });

  it('derives a base64url PKCE challenge', () => {
    const challenge = service.pkceChallenge('verifier');

    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(service.pkceChallenge('verifier')).toBe(challenge);
    expect(service.pkceChallenge('other')).not.toBe(challenge);
  });
});
