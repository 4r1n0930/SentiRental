import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { getRequestContext } from '../context/request-context';
import type { AuthenticatedUser } from '../types/auth.types';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const store = getRequestContext();
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    if (store) {
      store.ipAddress = ipAddress;
      store.userAgent = userAgent;
      if (request.user) {
        store.userId = request.user.id;
      }
    }

    return next.handle();
  }
}
