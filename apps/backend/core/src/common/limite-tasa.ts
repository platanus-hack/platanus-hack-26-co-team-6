/**
 * Limite de tasa por actor y por organizacion — tarea 2.11.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  LA TRAMPA QUE HAY QUE NO PISAR
 * ═══════════════════════════════════════════════════════════════════
 *  **`POST /triage` NO se limita con la misma dureza que el resto.**
 *
 *  Un paramedico con un paciente critico reintentando no es un abusador: es
 *  el usuario del sistema haciendo exactamente lo que el sistema le pide en
 *  el peor momento de su turno. Bloquearlo ahi es el peor fallo posible de
 *  PULSO — peor que caerse, porque caerse se ve y esto no.
 *
 *  Asi que `/triage` tiene su propio cubo, generoso, y cuando se pasa el
 *  `Retry-After` es de segundos, no de minutos. Lo caro de `/triage` es real
 *  (llama a un LLM), pero se paga con dinero; lo otro se paga con un
 *  paciente esperando.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  DOS EJES
 * ═══════════════════════════════════════════════════════════════════
 *  · **actor**        — el limite de una persona o de un servicio.
 *  · **organizacion** — el techo del inquilino entero. Sin el, una IPS con
 *                       200 actores puede tumbar el sistema para todos sin
 *                       que ninguno pase su propio limite.
 *
 * Ventana deslizante por conteo simple, en memoria. Con varias instancias
 * cada una cuenta lo suyo y el limite efectivo se multiplica por el numero
 * de instancias — se dice aqui en vez de fingir precision. La version con
 * Redis va con la observabilidad de la ola 5.
 */

import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ActorSesion } from '../auth/sesion.guard';
import { PulsoError } from './pulso-error.filter';

export interface Limite {
  /** Peticiones permitidas por ventana. */
  cupo: number;
  ventanaMs: number;
}

/**
 * Clases de ruta. El orden importa: gana la primera que casa.
 *
 * Los numeros son deliberadamente altos para un turno real y siguen siendo
 * un techo util contra un bucle: una consola que hace polling cada 2 s
 * consume 30 peticiones por minuto, asi que `/estado` tiene que aguantar
 * varias consolas por actor sin rozar el limite.
 */
const CLASES: readonly {
  nombre: string;
  casa: (metodo: string, ruta: string) => boolean;
  porActor: Limite;
  porOrganizacion: Limite;
}[] = [
  {
    // ⭐ El caso especial. Ver la cabecera del archivo.
    nombre: 'triage',
    casa: (_m, ruta) => ruta.startsWith('/triage'),
    porActor: { cupo: 60, ventanaMs: 60_000 },
    porOrganizacion: { cupo: 600, ventanaMs: 60_000 },
  },
  {
    // Lecturas de polling: baratas y constantes.
    nombre: 'lectura',
    casa: (metodo) => metodo === 'GET',
    porActor: { cupo: 600, ventanaMs: 60_000 },
    porOrganizacion: { cupo: 6_000, ventanaMs: 60_000 },
  },
  {
    nombre: 'mutacion',
    casa: () => true,
    porActor: { cupo: 120, ventanaMs: 60_000 },
    porOrganizacion: { cupo: 1_200, ventanaMs: 60_000 },
  },
];

/** Lo maximo que se le pide esperar a un dictado clinico. */
const ESPERA_MAXIMA_TRIAGE_S = 5;

interface Cubo {
  desde: number;
  cuenta: number;
}

@Injectable()
export class LimiteTasaGuard implements CanActivate {
  private readonly cubos = new Map<string, Cubo>();

  canActivate(contexto: ExecutionContext): boolean {
    const req = contexto
      .switchToHttp()
      .getRequest<Request & { actor?: ActorSesion }>();

    // Sin actor la peticion es publica (login, health, webhooks). El limite de
    // esas puertas es otro problema —y otra tarea—: aqui no hay a quien contar.
    const actor = req.actor;
    if (!actor) return true;

    const clase = CLASES.find((c) => c.casa(req.method, req.path))!;

    // Hasta que la sesión traiga organización propia (1.3), el segundo cubo
    // cuenta por tipo de actor: separa a los humanos del turno de `svc:voz`.
    const esperaActor = this.consumir(
      `a:${clase.nombre}:${actor.sub}`,
      clase.porActor,
    );
    const esperaOrg = this.consumir(
      `o:${clase.nombre}:${actor.tipo}`,
      clase.porOrganizacion,
    );
    const espera = Math.max(esperaActor, esperaOrg);
    if (espera === 0) return true;

    const segundos =
      clase.nombre === 'triage'
        ? Math.min(espera, ESPERA_MAXIMA_TRIAGE_S)
        : espera;

    const res = contexto.switchToHttp().getResponse<Response>();
    res.setHeader('Retry-After', String(segundos));

    // retryable: true, y ese booleano es la diferencia entre una UI que
    // reintenta sola y una que le dice al paramedico que algo se rompio.
    throw new PulsoError(
      'PULSO_INVALID_INPUT',
      `Demasiadas peticiones. Reintenta en ${segundos} s.`,
      { clase: clase.nombre, reintentarEnS: segundos },
      true,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Segundos que faltan, o 0 si hay cupo. Consume uno si lo hay. */
  private consumir(clave: string, limite: Limite): number {
    const ahora = Date.now();
    const cubo = this.cubos.get(clave);

    if (!cubo || ahora - cubo.desde >= limite.ventanaMs) {
      this.cubos.set(clave, { desde: ahora, cuenta: 1 });
      return 0;
    }

    if (cubo.cuenta < limite.cupo) {
      cubo.cuenta += 1;
      return 0;
    }

    return Math.max(
      1,
      Math.ceil((cubo.desde + limite.ventanaMs - ahora) / 1000),
    );
  }
}
