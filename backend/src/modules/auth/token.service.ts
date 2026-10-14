import { randomUUID } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import type { AccessTokenPayload, AuthenticatedUser } from '../../common/types/auth.types';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CryptoService } from '../../common/utils/crypto.service';
import type { UserModel } from '../../generated/prisma/models/User';
import { UserRole, type UserStatus } from '../../generated/prisma/enums';

const ALLOWED_STATUSES: UserStatus[] = ['ACTIVE'];

export interface SessionFingerprint {
  ipAddress?: string;
  userAgent?: string;
}

export interface IssuedRefreshToken extends SessionFingerprint {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export interface RotatedTokens {
  accessToken: string;
  refreshToken: IssuedRefreshToken;
  user: AuthenticatedUser;
}

@Injectable()
export class TokenService {
  private readonly config: AppConfig;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.config = config;
  }

  signAccessToken(user: Pick<UserModel, 'id' | 'role' | 'authVersion'>): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      ver: user.authVersion,
      typ: 'access',
    };

    return this.jwtService.sign(payload, {
      expiresIn: this.config.jwt.accessTokenTtlSeconds,
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience,
      });

      if (payload.typ !== 'access') {
        throw new UnauthorizedException('Invalid token type');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Access token is invalid or expired');
    }
  }

  async resolveUser(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        authVersion: true,
        tenant: { select: { id: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }

    if (!ALLOWED_STATUSES.includes(user.status)) {
      throw new UnauthorizedException(`Account is ${user.status.toLowerCase().replace(/_/g, ' ')}`);
    }

    if (user.authVersion !== payload.ver) {
      throw new UnauthorizedException('Session has been invalidated, please sign in again');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      status: user.status as UserStatus,
      authVersion: user.authVersion,
      tenantId: user.tenant?.id ?? null,
    };
  }

  async startSession(userId: string, fingerprint: SessionFingerprint): Promise<IssuedRefreshToken> {
    return this.issueSession(userId, randomUUID(), null, fingerprint);
  }

  async issueSession(
    userId: string,
    familyId: string,
    parentSessionId: string | null,
    fingerprint: SessionFingerprint,
  ): Promise<IssuedRefreshToken> {
    const token = this.crypto.generateOpaqueToken();
    const expiresAt = new Date(
      Date.now() + this.config.jwt.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );

    const session = await this.prisma.refreshSession.create({
      data: {
        userId,
        familyId,
        parentSessionId,
        tokenHash: this.crypto.hashToken(token),
        expiresAt,
        ipAddress: fingerprint.ipAddress,
        userAgent: fingerprint.userAgent?.slice(0, 512),
      },
    });

    return { token, sessionId: session.id, expiresAt };
  }

  async rotateSession(rawToken: string, fingerprint: SessionFingerprint): Promise<RotatedTokens> {
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: this.crypto.hashToken(rawToken) },
      include: {
        user: {
          select: {
            id: true,
            role: true,
            status: true,
            authVersion: true,
            email: true,
            tenant: { select: { id: true } },
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Refresh token is invalid');
    }

    if (session.usedAt || session.revokedAt) {
      await this.revokeFamily(session.familyId, 'REFRESH_TOKEN_REUSE');
      throw new UnauthorizedException('Refresh token reuse detected, session revoked');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    if (!ALLOWED_STATUSES.includes(session.user.status)) {
      throw new UnauthorizedException('Account is not active');
    }

    const next = await this.issueSession(session.userId, session.familyId, session.id, fingerprint);

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: {
        usedAt: new Date(),
        revokedAt: new Date(),
        revocationReason: 'ROTATED',
        replacedBySessionId: next.sessionId,
      },
    });

    return {
      accessToken: this.signAccessToken(session.user),
      refreshToken: next,
      user: {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role as UserRole,
        status: session.user.status as UserStatus,
        authVersion: session.user.authVersion,
        tenantId: session.user.tenant?.id ?? null,
      },
    };
  }

  async revokeSessionByToken(rawToken: string, reason: string): Promise<void> {
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: this.crypto.hashToken(rawToken) },
      select: { id: true, familyId: true },
    });

    if (!session) {
      return;
    }

    await this.revokeFamily(session.familyId, reason);
  }

  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    const result = await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: reason },
    });

    return result.count;
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: reason },
    });
  }
}
