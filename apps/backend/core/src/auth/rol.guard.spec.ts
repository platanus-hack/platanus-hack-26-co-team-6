/**
 * Tarea 1.3, paso 5 — RolGuard.
 *
 * El invariante que importa es el primero de §5.3: un `jefe_urgencias` no
 * puede actuar sobre una sede que no es la suya, y el intento **queda
 * registrado**. Un 403 mudo pierde la señal mas interesante del sistema.
 */

import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ActorSesion } from './carga';
import {
  CLAVE_ALCANCE_LLAVE,
  CLAVE_ALCANCE_SEDE,
  CLAVE_ROLES,
} from './rol.decorator';
import { RolGuard } from './rol.guard';
import { RegistroSesiones } from './sesiones';

const JEFE_DEL_SUR: ActorSesion = {
  id: 'actor-1',
  organizacionId: 'org-sur',
  roles: ['jefe_urgencias'],
  sedes: ['SEDE-SUR'],
  tipo: 'humano',
  sesionId: 'sid-1',
  legado: false,
};

/** Un contexto de Nest con lo justo: metadatos de la ruta y el request. */
function contexto(
  metadatos: { roles?: string[]; campoSede?: string; alcances?: string[] },
  cuerpo: Record<string, unknown> = {},
  // `null` y no `undefined`: un `undefined` explicito dispara el valor por
  // defecto del parametro y el test se probaria a si mismo, no al guard.
  actor: ActorSesion | null = JEFE_DEL_SUR,
): { ctx: ExecutionContext; reflector: Reflector } {
  const reflector = {
    getAllAndOverride: (clave: string) =>
      clave === CLAVE_ROLES
        ? metadatos.roles
        : clave === CLAVE_ALCANCE_SEDE
          ? metadatos.campoSede
          : clave === CLAVE_ALCANCE_LLAVE
            ? metadatos.alcances
            : undefined,
  } as unknown as Reflector;

  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        actor: actor ?? undefined,
        body: cuerpo,
        params: {},
        query: {},
      }),
    }),
  } as unknown as ExecutionContext;

  return { ctx, reflector };
}

describe('RolGuard', () => {
  it('una ruta sin decorar pasa: el guard global ya exigio sesion', () => {
    const { ctx, reflector } = contexto({});
    expect(
      new RolGuard(reflector, new RegistroSesiones()).canActivate(ctx),
    ).toBe(true);
  });

  it('deja pasar si el actor tiene UNO de los roles pedidos', () => {
    const { ctx, reflector } = contexto({
      roles: ['jefe_urgencias', 'regulador_crue'],
    });
    expect(
      new RolGuard(reflector, new RegistroSesiones()).canActivate(ctx),
    ).toBe(true);
  });

  it('niega si el rol no alcanza', () => {
    const { ctx, reflector } = contexto({ roles: ['admin_plataforma'] });
    expect(() =>
      new RolGuard(reflector, new RegistroSesiones()).canActivate(ctx),
    ).toThrow(ForbiddenException);
  });

  it('⭐ niega y REGISTRA cuando la sede no esta en el alcance del actor', () => {
    const registro = new RegistroSesiones();
    const { ctx, reflector } = contexto(
      { roles: ['jefe_urgencias'], campoSede: 'sedeCodigo' },
      { sedeCodigo: 'SEDE-NORTE' },
    );

    expect(() => new RolGuard(reflector, registro).canActivate(ctx)).toThrow(
      ForbiddenException,
    );

    const eventos = registro.ultimosEventos();
    expect(eventos).toHaveLength(1);
    expect(eventos[0].tipo).toBe('intento_cruzado');
    expect(eventos[0].actorId).toBe('actor-1');
  });

  it('deja pasar sobre su propia sede', () => {
    const registro = new RegistroSesiones();
    const { ctx, reflector } = contexto(
      { roles: ['jefe_urgencias'], campoSede: 'sedeCodigo' },
      { sedeCodigo: 'SEDE-SUR' },
    );

    expect(new RolGuard(reflector, registro).canActivate(ctx)).toBe(true);
    expect(registro.ultimosEventos()).toHaveLength(0);
  });

  it('un rol de red actua sobre cualquier sede', () => {
    // El CRUE regula la red entera: acotarlo a una sede seria acotarlo a
    // nada. `auditor` y `admin_plataforma` van por la misma puerta.
    const regulador: ActorSesion = {
      ...JEFE_DEL_SUR,
      roles: ['regulador_crue'],
      sedes: [],
    };
    const { ctx, reflector } = contexto(
      { roles: ['regulador_crue'], campoSede: 'sedeCodigo' },
      { sedeCodigo: 'SEDE-NORTE' },
      regulador,
    );

    expect(
      new RolGuard(reflector, new RegistroSesiones()).canActivate(ctx),
    ).toBe(true);
  });

  it('sin actor en una ruta decorada, niega', () => {
    // Seria un fallo de cableado: RolGuard corriendo sin SesionGuard delante.
    // El lado seguro del fallo es negar.
    const { ctx, reflector } = contexto(
      { roles: ['jefe_urgencias'] },
      {},
      null,
    );
    expect(() =>
      new RolGuard(reflector, new RegistroSesiones()).canActivate(ctx),
    ).toThrow(ForbiddenException);
  });
});

/**
 * Tarea 5.9 — una llave de API no es una persona.
 *
 * Tiene una lista corta de cosas que puede hacer, y todo lo demas esta
 * cerrado **incluyendo las rutas que nadie decoró**.
 */
describe('RolGuard · llaves de API (5.9)', () => {
  const LLAVE: ActorSesion = {
    id: 'llave:k1',
    organizacionId: 'org-sur',
    roles: ['servicio'],
    sedes: [],
    tipo: 'servicio',
    sesionId: 'llave:k1',
    legado: false,
    alcances: ['caso:leer'],
    llaveId: 'k1',
  };

  it('pasa en una ruta que pide justo su alcance', () => {
    const { ctx, reflector } = contexto({ alcances: ['caso:leer'] }, {}, LLAVE);
    expect(
      new RolGuard(reflector, new RegistroSesiones()).canActivate(ctx),
    ).toBe(true);
  });

  it('niega si la ruta pide un alcance que la llave no tiene', () => {
    const { ctx, reflector } = contexto(
      { alcances: ['capacidad:declarar'] },
      {},
      LLAVE,
    );
    expect(() =>
      new RolGuard(reflector, new RegistroSesiones()).canActivate(ctx),
    ).toThrow(ForbiddenException);
  });

  it('⭐ una ruta SIN @Alcance no la puede usar ninguna llave', () => {
    // El minimo por defecto vale tambien para las rutas: olvidarse de abrir
    // una se ve enseguida; haberlas dejado todas abiertas, no.
    const { ctx, reflector } = contexto({}, {}, LLAVE);
    expect(() =>
      new RolGuard(reflector, new RegistroSesiones()).canActivate(ctx),
    ).toThrow(ForbiddenException);
  });

  it('una ruta de rol tampoco se abre por tener el rol `servicio`', () => {
    const { ctx, reflector } = contexto({ roles: ['servicio'] }, {}, LLAVE);
    expect(() =>
      new RolGuard(reflector, new RegistroSesiones()).canActivate(ctx),
    ).toThrow(ForbiddenException);
  });

  it('una persona sigue pasando por las rutas sin decorar', () => {
    const { ctx, reflector } = contexto({});
    expect(
      new RolGuard(reflector, new RegistroSesiones()).canActivate(ctx),
    ).toBe(true);
  });
});
