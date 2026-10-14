import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthProvider, UserRole, UserStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { CryptoService } from '../../common/utils/crypto.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type {
  ForgotPasswordDto,
  GoogleAuthQueryDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { GoogleOAuthService } from './google-oauth.service';
import { TokenService, type SessionFingerprint } from './token.service';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresAt: Date;
  user: AuthenticatedUser;
}

export interface PublicUserView {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  tenantId: string | null;
  createdAt: Date;
  /** Only populated when DEV_EXPOSE_TOKENS is on; never reachable in production. */
  devVerificationToken?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly config: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
    private readonly googleOAuth: GoogleOAuthService,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.config = config;
  }

  async register(dto: RegisterDto): Promise<PublicUserView> {
    const emailNormalized = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { emailNormalized },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await this.crypto.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.trim(),
        emailNormalized,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() ?? null,
        phone: dto.phone ?? null,
        role: dto.role ?? UserRole.TENANT,
        status: UserStatus.PENDING_VERIFICATION,
        identities: {
          create: {
            provider: AuthProvider.CREDENTIALS,
            providerKey: `credentials:${emailNormalized}`,
            credentialHash: passwordHash,
            providerEmail: dto.email.trim(),
          },
        },
        ...(dto.role === UserRole.TENANT || dto.role === undefined
          ? { tenant: { create: {} } }
          : {}),
      },
      include: { tenant: { select: { id: true } } },
    });

    const verificationToken = await this.issueVerificationToken(user.id);
    await this.mail.sendVerificationEmail(user.email, verificationToken);

    const view = this.toPublicView(user);

    return this.config.dev.exposeTokens
      ? { ...view, devVerificationToken: verificationToken }
      : view;
  }

  async login(dto: LoginDto, fingerprint: SessionFingerprint): Promise<AuthTokensResponse> {
    const emailNormalized = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
      include: {
        identities: { where: { provider: AuthProvider.CREDENTIALS }, take: 1 },
        tenant: { select: { id: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const identity = user.identities[0];
    if (!identity?.credentialHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await this.crypto.verifyPassword(identity.credentialHash, dto.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DISABLED) {
      throw new ForbiddenException(`Account is ${user.status.toLowerCase()}`);
    }

    if (user.status === UserStatus.PENDING_VERIFICATION) {
      throw new ForbiddenException('Verify your email address before signing in');
    }

    if (user.status === UserStatus.PENDING_ACTIVATION) {
      throw new ForbiddenException('Your account is awaiting owner activation');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.prisma.authIdentity.update({
      where: { id: identity.id },
      data: { lastUsedAt: new Date() },
    });

    return this.issueSession(
      user.id,
      user.authVersion,
      user.role,
      user.email,
      user.tenant?.id ?? null,
      fingerprint,
    );
  }

  async refresh(
    refreshToken: string,
    fingerprint: SessionFingerprint,
  ): Promise<AuthTokensResponse> {
    const rotated = await this.tokenService.rotateSession(refreshToken, fingerprint);

    return {
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken.token,
      tokenType: 'Bearer',
      expiresIn: this.config.jwt.accessTokenTtlSeconds,
      refreshExpiresAt: rotated.refreshToken.expiresAt,
      user: rotated.user,
    };
  }

  async logout(refreshToken: string | undefined, userId: string): Promise<void> {
    if (refreshToken) {
      await this.tokenService.revokeSessionByToken(refreshToken, 'LOGOUT');
      return;
    }

    await this.tokenService.revokeAllForUser(userId, 'LOGOUT_ALL');
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string; devToken?: string }> {
    const emailNormalized = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized },
      select: { id: true, email: true, status: true },
    });

    if (!user || user.status === UserStatus.DISABLED) {
      return { message: 'If the account exists, a reset link has been sent' };
    }

    const token = this.crypto.generateOpaqueToken();

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.crypto.hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    await this.mail.sendPasswordResetEmail(user.email, token);

    // The message stays identical either way so it never reveals whether an
    // account exists. Only in dev, and only behind the boot-time production
    // lockout, is the token itself handed back.
    return {
      message: 'If the account exists, a reset link has been sent',
      ...(this.config.dev.exposeTokens ? { devToken: token } : {}),
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.crypto.hashToken(dto.token) },
      select: { id: true, userId: true, expiresAt: true, consumedAt: true },
    });

    if (!record || record.consumedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Reset token is invalid or has expired');
    }

    const passwordHash = await this.crypto.hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.authIdentity.update({
        where: { userId_provider: { userId: record.userId, provider: AuthProvider.CREDENTIALS } },
        data: { credentialHash: passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { authVersion: { increment: 1 } },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date(), revocationReason: 'PASSWORD_RESET' },
      }),
    ]);

    return { message: 'Password updated, please sign in again' };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: this.crypto.hashToken(dto.token) },
      select: { id: true, userId: true, expiresAt: true, consumedAt: true },
    });

    if (!record || record.consumedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Verification token is invalid or has expired');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          emailVerifiedAt: new Date(),
          status: UserStatus.ACTIVE,
        },
      }),
    ]);

    return { message: 'Email verified, your account is now active' };
  }

  async startGoogleLogin(redirectUri?: string): Promise<{ authorizationUrl: string }> {
    if (!this.config.google.enabled) {
      throw new ForbiddenException('Google sign-in is disabled');
    }

    const state = this.crypto.generateState();
    const codeVerifier = this.crypto.generateCodeVerifier();
    const redirect = this.safeRedirect(redirectUri);

    await this.prisma.oAuthFlow.create({
      data: {
        purpose: 'LOGIN_STATE',
        codeHash: this.crypto.hashToken(state),
        nonceHash: this.crypto.hashToken(codeVerifier),
        codeVerifierEncrypted: codeVerifier,
        redirectUri: redirect,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const params = new URLSearchParams({
      client_id: this.config.google.clientId,
      redirect_uri: this.config.google.callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: this.crypto.pkceChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });

    return {
      authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  }

  async completeGoogleLogin(
    dto: GoogleAuthQueryDto,
    fingerprint: SessionFingerprint,
  ): Promise<AuthTokensResponse> {
    if (!this.config.google.enabled) {
      throw new ForbiddenException('Google sign-in is disabled');
    }

    const flow = await this.prisma.oAuthFlow.findUnique({
      where: { codeHash: this.crypto.hashToken(dto.state ?? '') },
      select: {
        id: true,
        consumedAt: true,
        expiresAt: true,
        redirectUri: true,
        codeVerifierEncrypted: true,
      },
    });

    if (!flow || flow.consumedAt || flow.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('OAuth state is invalid or has expired');
    }

    const tokens = await this.googleOAuth.exchangeCode({
      code: dto.code,
      redirectUri: this.config.google.callbackUrl,
      codeVerifier: flow.codeVerifierEncrypted ?? undefined,
    });

    const profile = await this.googleOAuth.fetchUserInfo(tokens.accessToken);

    await this.prisma.oAuthFlow.update({
      where: { id: flow.id },
      data: { consumedAt: new Date() },
    });

    const emailNormalized = profile.email.toLowerCase();
    let user = await this.prisma.user.findUnique({
      where: { emailNormalized },
      include: { tenant: { select: { id: true } } },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          emailNormalized,
          firstName: profile.givenName ?? profile.email.split('@')[0],
          lastName: profile.familyName ?? null,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          role: UserRole.TENANT,
          identities: {
            create: {
              provider: AuthProvider.GOOGLE,
              providerKey: `google:${profile.subject}`,
              providerSubject: profile.subject,
              providerIssuer: 'https://accounts.google.com',
              providerEmail: profile.email,
            },
          },
          tenant: { create: {} },
        },
        include: { tenant: { select: { id: true } } },
      });
    } else {
      await this.prisma.authIdentity.upsert({
        where: { userId_provider: { userId: user.id, provider: AuthProvider.GOOGLE } },
        create: {
          provider: AuthProvider.GOOGLE,
          providerKey: `google:${profile.subject}`,
          providerSubject: profile.subject,
          providerIssuer: 'https://accounts.google.com',
          providerEmail: profile.email,
          user: { connect: { id: user.id } },
        },
        update: { lastUsedAt: new Date(), providerEmail: profile.email },
      });

      if (user.status === UserStatus.PENDING_VERIFICATION) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { status: UserStatus.ACTIVE, emailVerifiedAt: new Date() },
          include: { tenant: { select: { id: true } } },
        });
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueSession(
      user.id,
      user.authVersion,
      user.role,
      user.email,
      user.tenant?.id ?? null,
      fingerprint,
    );
  }

  async resendVerificationEmail(email: string): Promise<{ message: string; devToken?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: email.trim().toLowerCase() },
      select: { id: true, email: true, status: true },
    });

    if (!user || user.status !== UserStatus.PENDING_VERIFICATION) {
      return { message: 'If the account needs verification, a link has been sent' };
    }

    const token = await this.issueVerificationToken(user.id);
    await this.mail.sendVerificationEmail(user.email, token);

    return {
      message: 'If the account needs verification, a link has been sent',
      ...(this.config.dev.exposeTokens ? { devToken: token } : {}),
    };
  }

  private async issueVerificationToken(userId: string): Promise<string> {
    const token = this.crypto.generateOpaqueToken();

    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: this.crypto.hashToken(token),
        expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });

    return token;
  }

  private async issueSession(
    userId: string,
    authVersion: number,
    role: UserRole,
    email: string,
    tenantId: string | null,
    fingerprint: SessionFingerprint,
  ): Promise<AuthTokensResponse> {
    const session = await this.tokenService.startSession(userId, fingerprint);

    return {
      accessToken: this.tokenService.signAccessToken({ id: userId, role, authVersion }),
      refreshToken: session.token,
      tokenType: 'Bearer',
      expiresIn: this.config.jwt.accessTokenTtlSeconds,
      refreshExpiresAt: session.expiresAt,
      user: {
        id: userId,
        email,
        role,
        status: UserStatus.ACTIVE,
        authVersion,
        tenantId,
      },
    };
  }

  private toPublicView(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string | null;
    phone: string | null;
    role: UserRole;
    status: UserStatus;
    emailVerifiedAt: Date | null;
    createdAt: Date;
    tenant: { id: string } | null;
  }): PublicUserView {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
      tenantId: user.tenant?.id ?? null,
      createdAt: user.createdAt,
    };
  }

  private safeRedirect(candidate: string | undefined): string {
    const fallback = this.config.app.frontendUrl;
    if (!candidate) {
      return fallback;
    }

    try {
      const url = new URL(candidate);
      return this.config.app.corsOrigins.includes(url.origin) ? url.toString() : fallback;
    } catch {
      this.logger.warn(`Rejected unsafe redirect uri: ${String(candidate)}`);
      return fallback;
    }
  }
}
