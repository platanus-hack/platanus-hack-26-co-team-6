/**
 * POST /auth/servicio — la puerta por la que se emite la identidad de `voz`.
 *
 * Lo importante aquí no es que emita: es a quién le dice que no.
 */

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthController } from './auth.controller';
import { SesionService } from './sesion.service';
import { ALCANCE_VOZ } from './token-servicio';

const SECRETO = 'secreto-de-pruebas-largo-1';
const ADMIN = 'credencial-de-plataforma-1';

function controlador(valores: Record<string, string>): {
  ctl: AuthController;
  sesion: SesionService;
} {
  const config = {
    get: (clave: string) => valores[clave],
  } as unknown as ConfigService;
  const sesion = new SesionService(config);
  sesion.onModuleInit();
  return { ctl: new AuthController(sesion, config), sesion };
}

const conAdmin = (valor?: string): Request =>
  ({
    headers: valor === undefined ? {} : { 'x-pulso-admin-token': valor },
  }) as unknown as Request;

describe('POST /auth/servicio', () => {
  it('sin PULSO_ADMIN_TOKEN la ruta niega a todo el mundo', () => {
    // La excepción a la regla de degradación del repo: aquí un fallback
    // abierto ES la vulnerabilidad. Sin credencial, no hay puerta.
    const { ctl } = controlador({ SESION_SECRET: SECRETO });
    expect(() => ctl.servicio({ nombre: 'voz' }, conAdmin(ADMIN))).toThrow(
      ForbiddenException,
    );
    expect(() => ctl.servicio({ nombre: 'voz' }, conAdmin(ADMIN))).toThrow(
      /PULSO_ADMIN_TOKEN/,
    );
  });

  it('con la credencial equivocada, 403', () => {
    const { ctl } = controlador({
      SESION_SECRET: SECRETO,
      PULSO_ADMIN_TOKEN: ADMIN,
    });
    expect(() => ctl.servicio({ nombre: 'voz' }, conAdmin('otra'))).toThrow(
      ForbiddenException,
    );
    expect(() => ctl.servicio({ nombre: 'voz' }, conAdmin())).toThrow(
      ForbiddenException,
    );
  });

  it('una sesión de operador NO sirve para emitir tokens de servicio', () => {
    // Es el punto entero de la tarea: la contraseña de turno no puede
    // fabricar bots. La cabecera de admin es otra credencial, a propósito.
    const { ctl, sesion } = controlador({
      SESION_SECRET: SECRETO,
      OPERADOR_PASSWORD: 'turno',
      PULSO_ADMIN_TOKEN: ADMIN,
    });
    const tokenHumano = sesion.emitir().token;
    expect(() =>
      ctl.servicio({ nombre: 'voz' }, conAdmin(tokenHumano)),
    ).toThrow(ForbiddenException);
  });

  it('con la credencial correcta emite el token de voz con su alcance', () => {
    const { ctl, sesion } = controlador({
      SESION_SECRET: SECRETO,
      PULSO_ADMIN_TOKEN: ADMIN,
    });

    const r = ctl.servicio({ nombre: 'voz' }, conAdmin(ADMIN));

    expect(r.sub).toBe('svc:voz');
    expect(r.alcance).toEqual([...ALCANCE_VOZ]);
    expect(sesion.verificar(r.token)?.tip).toBe('servicio');
  });

  it('el alcance por defecto no se puede olvidar, pero sí acotar', () => {
    const { ctl } = controlador({
      SESION_SECRET: SECRETO,
      PULSO_ADMIN_TOKEN: ADMIN,
    });

    const r = ctl.servicio(
      { nombre: 'voz', alcance: ['caso:leer'] },
      conAdmin(ADMIN),
    );
    expect(r.alcance).toEqual(['caso:leer']);
  });

  it('un servicio sin alcance por defecto tiene que declararlo', () => {
    const { ctl } = controlador({
      SESION_SECRET: SECRETO,
      PULSO_ADMIN_TOKEN: ADMIN,
    });
    expect(() => ctl.servicio({ nombre: 'etl' }, conAdmin(ADMIN))).toThrow(
      BadRequestException,
    );
  });

  it('un alcance inventado es 400, no un token con un permiso fantasma', () => {
    const { ctl } = controlador({
      SESION_SECRET: SECRETO,
      PULSO_ADMIN_TOKEN: ADMIN,
    });
    expect(() =>
      ctl.servicio(
        { nombre: 'voz', alcance: ['handshake:responder!'] },
        conAdmin(ADMIN),
      ),
    ).toThrow(/desconocido/i);
  });

  it('la auditoría registra la emisión sin filtrar el token', () => {
    const { ctl } = controlador({
      SESION_SECRET: SECRETO,
      PULSO_ADMIN_TOKEN: ADMIN,
    });
    const log = jest
      .spyOn(
        (ctl as unknown as { log: { warn: (m: string) => void } }).log,
        'warn',
      )
      .mockImplementation(() => {});

    const r = ctl.servicio({ nombre: 'voz' }, conAdmin(ADMIN));

    const linea = log.mock.calls[0][0];
    expect(linea).toContain('svc:voz');
    expect(linea).toContain('caso:crear');
    expect(linea).toContain('huella=');
    // El token es la credencial: en un log es una fuga, no una traza.
    expect(linea).not.toContain(r.token);
    log.mockRestore();
  });
});

describe('login de operador: no lo tocamos', () => {
  it('sigue emitiendo un token humano y poniendo la cookie', () => {
    const { ctl, sesion } = controlador({
      SESION_SECRET: SECRETO,
      OPERADOR_PASSWORD: 'turno',
    });
    const cookies: Array<[string, string]> = [];
    const res = {
      cookie: (n: string, v: string) => cookies.push([n, v]),
    } as unknown as Parameters<AuthController['login']>[1];

    const r = ctl.login({ password: 'turno' }, res);

    expect(r.ok).toBe(true);
    expect(cookies[0][0]).toBe('pulso_sesion');
    expect(sesion.verificar(cookies[0][1])?.tip).toBe('humano');
  });
});
