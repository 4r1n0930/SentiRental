import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthProvider, UserStatus } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CryptoService } from '../../common/utils/crypto.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { TokenService } from '../auth/token.service';
import { paginate, resolvePagination, type Paginated } from '../../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../../common/types/auth.types';
import type {
  ChangeEmailDto,
  ChangePasswordDto,
  SearchUsersQueryDto,
  UpdateProfileDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/users.dto';

const USER_VIEW_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { id: true, status: true, kycStatus: true } },
} satisfies Prisma.UserSelect;

export type UserView = Prisma.UserGetPayload<{ select: typeof USER_VIEW_SELECT }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly mail: MailService,
    private readonly tokenService: TokenService,
  ) {}

  async findById(id: string): Promise<UserView> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_VIEW_SELECT });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findMe(userId: string): Promise<UserView> {
    return this.findById(userId);
  }

  async search(query: SearchUsersQueryDto): Promise<Paginated<UserView>> {
    const { page, perPage, skip, sortOrder } = resolvePagination(query);

    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: USER_VIEW_SELECT,
        orderBy: { createdAt: sortOrder },
        skip,
        take: perPage,
      }),
    ]);

    return paginate(Promise.resolve(total), Promise.resolve(items), page, perPage);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserView> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
      },
    });

    return this.findById(userId);
  }

  async changeEmail(user: AuthenticatedUser, dto: ChangeEmailDto): Promise<UserView> {
    const emailNormalized = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { emailNormalized },
      select: { id: true },
    });

    if (existing && existing.id !== user.id) {
      throw new ConflictException('This email is already in use');
    }

    const token = this.crypto.generateOpaqueToken();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          email: dto.email.trim(),
          emailNormalized,
          emailVerifiedAt: null,
          status: UserStatus.PENDING_VERIFICATION,
          authVersion: { increment: 1 },
        },
      }),
      this.prisma.authIdentity.updateMany({
        where: { userId: user.id, provider: AuthProvider.CREDENTIALS },
        data: { providerEmail: dto.email.trim() },
      }),
      this.prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: this.crypto.hashToken(token),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    await this.tokenService.revokeAllForUser(user.id, 'EMAIL_CHANGED');
    await this.mail.sendVerificationEmail(dto.email.trim(), token);

    return this.findById(user.id);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const identity = await this.prisma.authIdentity.findUnique({
      where: { userId_provider: { userId, provider: AuthProvider.CREDENTIALS } },
      select: { id: true, credentialHash: true },
    });

    if (!identity?.credentialHash) {
      throw new ForbiddenException('This account signs in with a social provider');
    }

    const valid = await this.crypto.verifyPassword(identity.credentialHash, dto.currentPassword);
    if (!valid) {
      throw new ForbiddenException('Current password is incorrect');
    }

    const passwordHash = await this.crypto.hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.authIdentity.update({
        where: { id: identity.id },
        data: { credentialHash: passwordHash },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { authVersion: { increment: 1 } },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revocationReason: 'PASSWORD_CHANGED' },
      }),
    ]);

    return { message: 'Password changed, please sign in again' };
  }

  async setStatus(actorId: string, userId: string, dto: UpdateUserStatusDto): Promise<UserView> {
    if (actorId === userId) {
      throw new ForbiddenException('You cannot change your own status');
    }

    await this.prisma.user.update({ where: { id: userId }, data: { status: dto.status } });

    if (dto.status === UserStatus.SUSPENDED || dto.status === UserStatus.DISABLED) {
      await this.tokenService.revokeAllForUser(userId, `STATUS_${dto.status}`);
    }

    return this.findById(userId);
  }

  async setRole(actorId: string, userId: string, dto: UpdateUserRoleDto): Promise<UserView> {
    if (actorId === userId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    await this.prisma.user.update({ where: { id: userId }, data: { role: dto.role } });

    return this.findById(userId);
  }

  async listSessions(userId: string) {
    const sessions = await this.prisma.refreshSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        familyId: true,
        createdAt: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        revocationReason: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    return sessions.map((session) => ({
      ...session,
      active: !session.usedAt && !session.revokedAt && session.expiresAt.getTime() > Date.now(),
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.refreshSession.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date(), revocationReason: 'REVOKED_BY_USER' },
    });

    if (result.count === 0) {
      throw new NotFoundException('Session not found');
    }
  }
}
