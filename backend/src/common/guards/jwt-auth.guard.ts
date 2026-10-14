import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { setRequestUserId } from '../context/request-context';
import type { AuthenticatedUser } from '../types/auth.types';
import { TokenService } from '../../modules/auth/token.service';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Access token is missing');
    }

    const payload = await this.tokenService.verifyAccessToken(token);
    const user = await this.tokenService.resolveUser(payload);

    request.user = user;
    setRequestUserId(user.id);

    return true;
  }
}

function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;

  if (header?.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  const cookieToken = (request as Request & { cookies?: Record<string, string> }).cookies?.[
    'access_token'
  ];

  return cookieToken;
}
