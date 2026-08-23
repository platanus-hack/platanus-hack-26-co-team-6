/* eslint-disable @typescript-eslint/unbound-method --
 * Al Reflector se le pasa el objeto función para leer su metadata; nunca lo
 * invoca, así que `this` no entra en juego. Es lo mismo que hace Nest con
 * context.getHandler().
 */

/**
 * El guard con tokens de servicio (tarea 1.8).
 *
 * La pregunta que responde este archivo es una sola: ¿puede `voz` aceptar un
 * traslado? La respuesta tiene que ser 403, y tiene que seguir siéndolo
 * cuando alguien agregue una ruta nueva y se olvide de decorarla.
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Alcance } from './alcance.decorator';
import { Publico } from './publico.decorator';
import { SesionGuard, type RequestConActor } from './sesion.guard';
import { SesionService } from './sesion.service';
import { ALCANCE_VOZ } from './token-servicio';

const SECRETO = 'secreto-de-pruebas-largo-1';

function sesionService(): SesionService {
  const s = new SesionService({
    get: (clave: string) =>
      ({ SESION_SECRET: SECRETO, OPERADOR_PASSWORD: 'turno' })[clave],
  } as unknown as ConfigService);
  s.onModuleInit();
  return s;
}

/** Un ExecutionContext mínimo: lo que el guard realmente mira. */
function contexto(
  req: Partial<RequestConActor>,
  handler: () => void = () => {},
): { ctx: ExecutionContext; req: RequestConActor } {
  const completo = {
    headers: {},
    method: 'GET',
    path: '/',
    ...req,
  } as RequestConActor;
  const ctx = {
    switchToHttp: () => ({ getRequest: () => completo }),
    getHandler: () => handler,
    getClass: () => class Controlador {},
  } as unknown as ExecutionContext;
  return { ctx, req: completo };
}

describe('SesionGuard con token de servicio', () => {
  const sesion = sesionService();
  const guard = new SesionGuard(new Reflector(), sesion);
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  const tokenVoz = sesion.emitirServicio('voz', ALCANCE_VOZ).token;

  it('deja pasar a voz por las rutas de su alcance', () => {
    for (const [method, path] of [
      ['POST', '/triage'],
      ['POST', '/match'],
      ['GET', '/estado'],
      ['POST', '/dispatch'],
    ]) {
      const { ctx, req } = contexto({
        headers: bearer(tokenVoz),
        method,
        path,
      });
      expect(guard.canActivate(ctx)).toBe(true);
      expect(req.actor).toEqual({
        sub: 'svc:voz',
        tipo: 'servicio',
        alcance: [...ALCANCE_VOZ],
      });
    }
  });

  it('voz intentando POST /handshake/respond → 403', () => {
    // El requisito literal de la tarea: aceptar un traslado es humano.
    const { ctx } = contexto({
      headers: bearer(tokenVoz),
      method: 'POST',
      path: '/handshake/respond',
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow(/handshake:responder/);
  });

  it('una ruta nueva sin declarar tampoco se le abre a un servicio', () => {
    // El olvido cierra, no abre. Es lo que hace que esto envejezca bien.
    const { ctx } = contexto({
      headers: bearer(tokenVoz),
      method: 'POST',
      path: '/ruta-que-alguien-agregara-manana',
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('@Alcance() en el controlador gana sobre la tabla', () => {
    class Cualquiera {
      @Alcance('caso:leer')
      leer(): void {}

      @Alcance('capacidad:declarar')
      declarar(): void {}
    }
    const c = new Cualquiera();

    const permitido = contexto(
      { headers: bearer(tokenVoz), method: 'GET', path: '/casos/abc-123' },
      c.leer,
    );
    expect(guard.canActivate(permitido.ctx)).toBe(true);

    const negado = contexto(
      { headers: bearer(tokenVoz), method: 'POST', path: '/casos/abc-123' },
      c.declarar,
    );
    expect(() => guard.canActivate(negado.ctx)).toThrow(/capacidad:declarar/);
  });

  it('el sub viaja: la auditoría distingue svc:voz de un humano', () => {
    const servicio = contexto({
      headers: bearer(tokenVoz),
      method: 'POST',
      path: '/triage',
    });
    guard.canActivate(servicio.ctx);

    const humano = contexto({
      headers: bearer(sesion.emitir().token),
      method: 'POST',
      path: '/triage',
    });
    guard.canActivate(humano.ctx);

    expect(servicio.req.actor?.sub).toBe('svc:voz');
    expect(servicio.req.actor?.tipo).toBe('servicio');
    expect(humano.req.actor?.sub).toBe('operador');
    expect(humano.req.actor?.tipo).toBe('humano');
    // `operador` se conserva para el código que ya lo miraba.
    expect(servicio.req.operador).toBe('svc:voz');
  });
});

describe('SesionGuard con token humano: nada cambió', () => {
  const sesion = sesionService();
  const guard = new SesionGuard(new Reflector(), sesion);

  it('un humano pasa por donde pasaba, con tabla o sin ella', () => {
    const token = sesion.emitir().token;
    for (const [method, path] of [
      ['POST', '/handshake/respond'],
      ['POST', '/triage'],
      ['GET', '/capacidades'],
      ['POST', '/voz/transcribir'],
    ]) {
      const { ctx } = contexto({
        headers: { authorization: `Bearer ${token}` },
        method,
        path,
      });
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('sin token sigue siendo 401, no 403', () => {
    const { ctx } = contexto({ method: 'POST', path: '/triage' });
    expect(() => guard.canActivate(ctx)).toThrow('Sesión requerida');
  });

  it('la cookie sigue sirviendo (es como entra el navegador)', () => {
    const token = sesion.emitir().token;
    const { ctx } = contexto({
      headers: { cookie: `pulso_sesion=${encodeURIComponent(token)}` },
      method: 'POST',
      path: '/dispatch',
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('@Publico() se salta todo, también para un servicio', () => {
    class Sonda {
      @Publico()
      health(): void {}
    }
    const { ctx } = contexto(
      { method: 'GET', path: '/health' },
      new Sonda().health,
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
