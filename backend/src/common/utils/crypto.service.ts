import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';

@Injectable()
export class CryptoService {
  private readonly pepper: string;
  private readonly argon2Options: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
    outputLength: number;
  };

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pepper = config.security.tokenPepper;
    this.argon2Options = {
      memoryCost: config.security.argon2.memoryCost,
      timeCost: config.security.argon2.timeCost,
      parallelism: config.security.argon2.parallelism,
      outputLength: config.security.argon2.outputLength,
    };
  }

  hashPassword(plainText: string): Promise<string> {
    return hash(plainText, this.argon2Options);
  }

  async verifyPassword(storedHash: string, plainText: string): Promise<boolean> {
    try {
      return await verify(storedHash, plainText, this.argon2Options);
    } catch {
      return false;
    }
  }

  generateOpaqueToken(byteLength = 48): string {
    return randomBytes(byteLength).toString('base64url');
  }

  generateState(byteLength = 32): string {
    return randomBytes(byteLength).toString('base64url');
  }

  generateCodeVerifier(byteLength = 32): string {
    return randomBytes(byteLength).toString('base64url');
  }

  pkceChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(`${this.pepper}:${token}`).digest('hex');
  }

  hashTokenMatches(token: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashToken(token), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
