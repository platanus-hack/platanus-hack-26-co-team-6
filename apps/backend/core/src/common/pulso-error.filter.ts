import {
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { PulsoCode, PulsoErrorEnvelope } from '../contracts/types';

export class PulsoError extends Error {
  constructor(
    readonly code: PulsoCode,
    message: string,
    readonly details?: unknown,
    readonly retryable = false,
  ) {
    super(message);
  }
}
export const toPulsoErrorEnvelope = (error: unknown): PulsoErrorEnvelope =>
  error instanceof PulsoError
    ? {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
          retryable: error.retryable,
        },
      }
    : error instanceof HttpException &&
        error.getStatus() < HttpStatus.INTERNAL_SERVER_ERROR
      ? {
          error: {
            code: 'PULSO_INVALID_INPUT',
            message: 'Invalid request',
            retryable: false,
          },
        }
      : {
          error: {
            code: 'PULSO_INTERNAL',
            message: 'Unexpected routing error',
            retryable: true,
          },
        };
@Catch()
export class PulsoErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    response
      .status(
        exception instanceof PulsoError
          ? HttpStatus.BAD_REQUEST
          : exception instanceof HttpException
            ? exception.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR,
      )
      .json(toPulsoErrorEnvelope(exception));
  }
}
