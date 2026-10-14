import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { startRequestContext } from '../context/request-context';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : undefined;

    const context = startRequestContext({
      requestId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    response.setHeader('x-request-id', context.requestId);
    next();
  }
}
