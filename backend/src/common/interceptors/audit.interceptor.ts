import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { from, type Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { AUDIT_KEY, type AuditMetadata } from '../decorators/audited.decorator';
import { AuditService } from '../services/audit.service';
import type { AuthenticatedUser } from '../types/auth.types';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditMetadata | undefined>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return from(next.handle()).pipe(
      mergeMap(async (result: unknown) => {
        const resourceId =
          (metadata.resourceIdFromResult
            ? extractPath(result, metadata.resourceIdFromResult)
            : null) ??
          (request.params?.id as string | undefined) ??
          null;

        await this.auditService.record({
          actorUserId: request.user?.id ?? null,
          action: metadata.action,
          resourceType: metadata.resourceType,
          resourceId,
          metadata: sanitize(request.body),
        });

        return result;
      }),
    );
  }
}

function extractPath(source: unknown, path: string): string | null {
  const value = path
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        typeof current === 'object' && current !== null
          ? (current as Record<string, unknown>)[key]
          : undefined,
      source,
    );

  return value === undefined || value === null ? null : String(value);
}

const SENSITIVE_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'refreshToken',
  'code',
  'codeVerifier',
  'secret',
]);

function sanitize(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {};
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.has(key) ? '[redacted]' : value;
  }

  return result;
}
