/**
 * `Idempotency-Key` en toda mutacion — tarea 2.11.
 *
 * Se registra global: cualquier ruta nueva que mute queda cubierta sin que
 * nadie se acuerde de decorarla, igual que el `SesionGuard`.
 *
 * SOLO actua si el cliente manda la cabecera. Sin ella, todo sigue como
 * antes — no se inventa una clave a partir del cuerpo, porque dos casos
 * identicos de verdad (dos pacientes con el mismo cuadro en la misma
 * esquina) colisionarian y el segundo desapareceria en silencio. Eso es peor
 * que un duplicado: es una emergencia perdida.
 */

import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import { PulsoError } from './pulso-error.filter';
import {
  ALMACEN_IDEMPOTENCIA,
  huellaDe,
  type AlmacenIdempotencia,
} from './idempotencia';

export const CABECERA = 'idempotency-key';
const MUTACIONES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Rutas exentas, y la razon es una sola: **su efecto no viaja en el cuerpo,
 * viaja en las cabeceras**.
 *
 * `/auth/login` responde `{ok, expiraEn}` y una cookie `Set-Cookie`. Repetir
 * el cuerpo guardado sin la cookie devolveria un 200 alegre y una sesion que
 * no existe — el peor de los dos mundos. Ademas, cachear la rotacion de
 * `/auth/refresh` desharia la deteccion de reuso de la tarea 1.3.
 */
const EXENTAS = ['/auth/'];
/** Una clave mas larga que esto no es una clave: es un cuerpo disfrazado. */
const MAX_LARGO = 200;

@Injectable()
export class IdempotenciaInterceptor implements NestInterceptor {
  private readonly log = new Logger('Idempotencia');

  constructor(
    @Inject(ALMACEN_IDEMPOTENCIA)
    private readonly almacen: AlmacenIdempotencia,
  ) {}

  intercept(
    contexto: ExecutionContext,
    siguiente: CallHandler,
  ): Observable<unknown> {
    const req = contexto.switchToHttp().getRequest<Request>();
    const clave = cabecera(req);

    if (
      !MUTACIONES.has(req.method) ||
      !clave ||
      EXENTAS.some((prefijo) => req.path.startsWith(prefijo))
    )
      return siguiente.handle();

    if (clave.length > MAX_LARGO)
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        `Idempotency-Key demasiado larga (maximo ${MAX_LARGO})`,
      );

    const huella = huellaDe(req.method, req.path, req.body);

    return from(this.almacen.reservar(clave, huella)).pipe(
      switchMap((reserva) => {
        if (reserva.tipo === 'conflicto')
          throw new PulsoError(
            'PULSO_IDEMPOTENCY_CONFLICT',
            'Esa Idempotency-Key ya se uso con un cuerpo distinto',
            undefined,
            false,
            HttpStatus.CONFLICT,
          );

        if (reserva.tipo === 'repetido') {
          // ⭐ El efecto no se repite: se devuelve el resultado de la primera.
          this.log.log(`reintento resuelto por idempotencia: ${req.path}`);
          this.marcar(contexto);
          return of(reserva.resultado.cuerpo);
        }

        if (reserva.tipo === 'en_curso') {
          // Misma clave, misma peticion, todavia corriendo.
          //
          // En memoria se espera a la primera y se devuelve su resultado: es
          // el doble toque del paramedico y merece una respuesta, no un
          // error. Con Postgres la primera vive en otro proceso y no hay a
          // que esperar, asi que se pide reintentar — REINTENTABLE, que es
          // lo que separa "vuelve en un segundo" de "esto fallo".
          if (!reserva.espera)
            throw new PulsoError(
              'PULSO_IDEMPOTENCY_CONFLICT',
              'Esa peticion todavia se esta procesando; reintenta en un momento',
              undefined,
              true,
              HttpStatus.CONFLICT,
            );

          return from(reserva.espera).pipe(
            switchMap((resultado) => {
              if (!resultado)
                throw new PulsoError(
                  'PULSO_INTERNAL',
                  'La peticion original fallo; reintenta con la misma clave',
                  undefined,
                  true,
                );
              this.marcar(contexto);
              return of(resultado.cuerpo);
            }),
          );
        }

        return siguiente.handle().pipe(
          tap({
            next: (cuerpo) => {
              const res = contexto.switchToHttp().getResponse<Response>();
              void this.almacen.completar(clave, {
                estado: res.statusCode,
                cuerpo,
              });
            },
            // Un fallo NO se cachea: si core devolvio 500 por un timeout de
            // Mapbox, el reintento tiene que poder ejecutarse de verdad.
            // Guardar el error convertiria un fallo transitorio en permanente.
            error: () => void this.almacen.liberar(clave),
          }),
        );
      }),
    );
  }

  /** Que el cliente pueda distinguir la respuesta original de la repetida. */
  private marcar(contexto: ExecutionContext): void {
    contexto
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Idempotency-Replayed', 'true');
  }
}

function cabecera(req: Request): string | undefined {
  const valor = req.headers[CABECERA];
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  return bruto?.trim() || undefined;
}
