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
    /**
     * Estado HTTP. Por omision 400, que es lo que devolvia siempre.
     *
     * Lo agrega la tarea 2.11: un conflicto de idempotencia es 409 y un
     * limite de tasa es 429, y esos dos numeros son justo lo que un cliente
     * mira para decidir si reintenta. Con todo en 400, la cola offline de
     * /campo no puede distinguir "no insistas" de "espera y vuelve".
     *
     * ⚠️ ESTE HUNK ES IDENTICO AL DE LA TAREA 2.11 (PR #15), a proposito:
     *    la tarea 2.5 necesita 410 para una invitacion vencida y no puede
     *    esperar. Al mergear las dos ramas el conflicto se resuelve tomando
     *    cualquiera de los dos lados — dicen lo mismo.
     */
    readonly estado: number = HttpStatus.BAD_REQUEST,
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
          ? exception.estado
          : exception instanceof HttpException
            ? exception.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR,
      )
      .json(toPulsoErrorEnvelope(exception));
  }
}
