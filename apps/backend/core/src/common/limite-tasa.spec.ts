/**
 * Tarea 2.11 — límite de tasa.
 *
 * El test que más importa es el de `/triage`: **un paramédico con un paciente
 * crítico reintentando no es un abusador**, y bloquearlo es el peor fallo
 * posible del sistema.
 */

import type { ExecutionContext } from '@nestjs/common';
import type { ActorSesion } from '../auth/carga';
import { LimiteTasaGuard } from './limite-tasa';
import { PulsoError } from './pulso-error.filter';

const ACTOR: ActorSesion = {
  id: 'actor-1',
  organizacionId: 'org-sur',
  roles: ['paramedico'],
  sedes: [],
  tipo: 'humano',
  sesionId: 'sid-1',
  legado: false,
};

function contexto(
  metodo: string,
  ruta: string,
  actor: ActorSesion | null = ACTOR,
): { ctx: ExecutionContext; cabeceras: Record<string, string> } {
  const cabeceras: Record<string, string> = {};
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: metodo,
        path: ruta,
        actor: actor ?? undefined,
      }),
      getResponse: () => ({
        setHeader: (k: string, v: string) => {
          cabeceras[k] = v;
        },
      }),
    }),
  } as unknown as ExecutionContext;
  return { ctx, cabeceras };
}

/** Consume hasta que rebote, o falla el test si nunca rebota. */
function agotar(
  guard: LimiteTasaGuard,
  metodo: string,
  ruta: string,
  actor: ActorSesion = ACTOR,
  maximo = 10_000,
): PulsoError {
  for (let i = 0; i < maximo; i += 1) {
    const { ctx, cabeceras } = contexto(metodo, ruta, actor);
    try {
      guard.canActivate(ctx);
    } catch (e) {
      (e as PulsoError & { cabeceras?: unknown }).cabeceras = cabeceras;
      return e as PulsoError;
    }
  }
  throw new Error(`el limite de ${metodo} ${ruta} nunca se aplicó`);
}

describe('LimiteTasaGuard', () => {
  it('deja pasar el uso normal de una consola', () => {
    const guard = new LimiteTasaGuard();
    // Polling cada 2 s durante un minuto = 30 peticiones. Ni se acerca.
    for (let i = 0; i < 30; i += 1) {
      const { ctx } = contexto('GET', '/estado');
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('una ruta sin actor (pública) no se cuenta aquí', () => {
    // /health y los webhooks no tienen a quién contarle. Su límite es otro
    // problema y otra tarea; inventarlo aquí bloquearía a Telegram.
    const guard = new LimiteTasaGuard();
    for (let i = 0; i < 5_000; i += 1) {
      const { ctx } = contexto('POST', '/telegram/webhook', null);
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('al pasarse devuelve 429, reintentable y con Retry-After', () => {
    const guard = new LimiteTasaGuard();
    const error = agotar(guard, 'POST', '/dispatch');

    expect(error).toBeInstanceOf(PulsoError);
    expect(error.estado).toBe(429);
    expect(error.retryable).toBe(true);
    expect(
      (error as PulsoError & { cabeceras: Record<string, string> }).cabeceras[
        'Retry-After'
      ],
    ).toBeDefined();
  });

  it('⭐ /triage nunca hace esperar más de 5 s', () => {
    // La trampa de la tarea. Un dictado clínico reintentado no puede quedar
    // en cola detrás de un minuto de castigo.
    const guard = new LimiteTasaGuard();
    const error = agotar(guard, 'POST', '/triage');
    const espera = Number(
      (error as PulsoError & { cabeceras: Record<string, string> }).cabeceras[
        'Retry-After'
      ],
    );

    expect(espera).toBeGreaterThan(0);
    expect(espera).toBeLessThanOrEqual(5);
  });

  it('/triage aguanta mucho más que una mutación normal', () => {
    // El paramédico que reintenta tres veces seguidas porque no vio respuesta
    // tiene que pasar, siempre.
    const guard = new LimiteTasaGuard();
    for (let i = 0; i < 50; i += 1) {
      const { ctx } = contexto('POST', '/triage');
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('el techo de la organización topa aunque cada actor esté bajo el suyo', () => {
    // Sin este eje, una IPS con 200 actores tumba el sistema para todos sin
    // que ninguno pase su propio límite.
    const guard = new LimiteTasaGuard();
    let rebotes = 0;

    for (let persona = 0; persona < 20; persona += 1) {
      const actor = { ...ACTOR, id: `actor-${persona}` };
      for (let i = 0; i < 120; i += 1) {
        const { ctx } = contexto('POST', '/dispatch', actor);
        try {
          guard.canActivate(ctx);
        } catch {
          rebotes += 1;
        }
      }
    }

    expect(rebotes).toBeGreaterThan(0);
  });

  it('dos organizaciones no se estorban', () => {
    const guard = new LimiteTasaGuard();
    agotar(guard, 'POST', '/dispatch');

    const otra = { ...ACTOR, id: 'actor-9', organizacionId: 'org-norte' };
    const { ctx } = contexto('POST', '/dispatch', otra);
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
