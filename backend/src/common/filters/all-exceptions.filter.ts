import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getRequestContext } from '../context/request-context';

interface PrismaKnownError extends Error {
  code?: string;
  meta?: { target?: string[] | string; field_name?: string };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const requestId = getRequestContext()?.requestId ?? request.headers['x-request-id'];

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      response.status(status).json({
        statusCode: status,
        error: HttpStatus[status] ?? 'Error',
        message: extractMessage(payload, exception.message),
        requestId,
      });
      return;
    }

    if (isPrismaKnownError(exception)) {
      const mapped = mapPrismaError(exception);
      response.status(mapped.statusCode).json({
        statusCode: mapped.statusCode,
        error: HttpStatus[mapped.statusCode] ?? 'Error',
        message: mapped.message,
        requestId,
      });
      return;
    }

    this.logger.error(
      `Unhandled error requestId=${String(requestId)} path=${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      requestId,
    });
  }
}

function isPrismaKnownError(exception: unknown): exception is PrismaKnownError {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'code' in exception &&
    typeof (exception as PrismaKnownError).code === 'string'
  );
}

function mapPrismaError(error: PrismaKnownError): { statusCode: number; message: string } {
  switch (error.code) {
    case 'P2002':
      return {
        statusCode: HttpStatus.CONFLICT,
        message: `Unique constraint failed: ${describeTarget(error)}`,
      };
    case 'P2003':
      return { statusCode: HttpStatus.CONFLICT, message: 'Related record does not exist' };
    case 'P2025':
      return { statusCode: HttpStatus.NOT_FOUND, message: 'Record not found' };
    case 'P2014':
      return {
        statusCode: HttpStatus.CONFLICT,
        message: 'Relation violation, referenced record is in use',
      };
    default:
      return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Database error' };
  }
}

function describeTarget(error: PrismaKnownError): string {
  const target = error.meta?.target ?? error.meta?.field_name;

  if (Array.isArray(target)) {
    return target.join(', ');
  }

  return target ?? 'unknown field';
}

function extractMessage(payload: unknown, fallback: string): string | string[] {
  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (typeof message === 'string' || Array.isArray(message)) {
      return message as string | string[];
    }
  }

  return fallback;
}
