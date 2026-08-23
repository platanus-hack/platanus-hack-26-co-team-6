/**
 * Los tests de la tarea 2.5.
 *
 * Fijan comportamiento observable, no implementacion: entra una peticion con
 * una identidad concreta y sale un estado o un codigo HTTP. Por eso se prueba
 * contra el almacen de memoria real y no contra un doble — el que cambie el
 * almacen tiene que seguir pasando esto.
 *
 * Sin Postgres: `AlmacenEquipoMemoria` es una implementacion completa de la
 * interfaz, asi que la suite corre en cualquier maquina y en CI sin base.
 *
 * `randomUUID` y `randomBytes` son reales a proposito. Un test que mockea la
 * fuente de entropia no puede afirmar nada sobre la entropia.
 */

import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EquipoController } from './equipo.controller';
import { InvitacionController } from './invitacion.controller';
import { InvitacionesModule } from './invitaciones.module';
import { AlmacenEquipoMemoria } from './almacen-equipo.memoria';
import { CorreoService } from './correo.service';
import type { Actor, Rol } from './equipo.tipos';
import {
  IdentidadService,
  VAR_ORGANIZACION,
  VAR_ROLES,
  type ActorSesion,
} from './identidad.service';
import {
  hashDe,
  InvitacionesService,
  ORGANIZACION_PROPIA,
} from './invitaciones.service';
import { rolesOtorgables, puedeInvitar } from './permisos';

const ORG = 'org-hospital-san-carlos';
const OTRA_ORG = 'org-clinica-del-norte';

function config(valores: Record<string, string> = {}): ConfigService {
  return { get: (clave: string) => valores[clave] } as unknown as ConfigService;
}

function servicio(valores: Record<string, string> = {}) {
  const almacen = new AlmacenEquipoMemoria();
  const cfg = config({ PULSO_APP_URL: 'https://pulso.test', ...valores });
  return {
    almacen,
    invitaciones: new InvitacionesService(almacen, new CorreoService(cfg), cfg),
  };
}

function sesion(over: Partial<ActorSesion> = {}): ActorSesion {
  return {
    id: 'actor-admin',
    organizacionId: ORG,
    roles: ['admin_organizacion'],
    correo: 'admin@sancarlos.co',
    modo: 'actor',
    ...over,
  };
}

function actor(over: Partial<Actor> = {}): Actor {
  return {
    id: 'actor-admin',
    organizacionId: ORG,
    correo: 'admin@sancarlos.co',
    nombre: 'Admin',
    roles: ['admin_organizacion'],
    codigoSede: null,
    activo: true,
    creadoEn: '2026-08-01T00:00:00.000Z',
    ultimoAccesoEn: null,
    desactivadoEn: null,
    invitacionId: null,
    ...over,
  };
}

/** El estado HTTP de una llamada que debe fallar. Falla el test si no falla. */
async function estadoDe(fn: () => Promise<unknown>): Promise<number> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof HttpException) return error.getStatus();
    throw error;
  }
  throw new Error('Se esperaba una excepcion HTTP y no hubo ninguna');
}

async function mensajeDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof HttpException) return error.message;
    throw error;
  }
  throw new Error('Se esperaba una excepcion HTTP y no hubo ninguna');
}

/** El token que viaja en el enlace. Es la unica vez que se puede leer. */
function tokenDelEnlace(enlace: string): string {
  return enlace.slice(enlace.lastIndexOf('/') + 1);
}

// ═══════════════════════════════════════════════════════════════════
//  El token
// ═══════════════════════════════════════════════════════════════════

describe('el token de invitacion', () => {
  it('viaja en el enlace y en el almacen solo queda su hash', async () => {
    const { almacen, invitaciones } = servicio();

    const res = await invitaciones.invitar(sesion(), ORG, {
      correo: 'jefe@sancarlos.co',
      rol: 'jefe_urgencias',
    });

    expect(res.enlace).toBeDefined();
    const token = tokenDelEnlace(res.enlace!);

    // 32 bytes en base64url son 43 caracteres sin relleno.
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);

    const guardada = await almacen.invitacionPorHash(hashDe(token));
    expect(guardada).toBeDefined();
    expect(guardada!.tokenHash).toBe(hashDe(token));
    // Lo que importa: el token en claro no esta en ningun campo de la fila.
    expect(JSON.stringify(guardada)).not.toContain(token);
  });

  it('no sale en la respuesta ni en la lista del equipo', async () => {
    const { invitaciones } = servicio();

    const res = await invitaciones.invitar(sesion(), ORG, {
      correo: 'jefe@sancarlos.co',
      rol: 'jefe_urgencias',
    });
    const token = tokenDelEnlace(res.enlace!);

    // El enlace lleva el token; la invitacion serializada, jamas.
    expect(JSON.stringify(res.invitacion)).not.toContain(token);
    expect(JSON.stringify(res.invitacion)).not.toContain('tokenHash');

    const equipo = await invitaciones.equipo(sesion(), ORG);
    expect(JSON.stringify(equipo)).not.toContain(token);
    expect(JSON.stringify(equipo)).not.toContain('tokenHash');
  });

  it('dos invitaciones nunca comparten token', async () => {
    const { invitaciones } = servicio();

    const uno = await invitaciones.invitar(sesion(), ORG, {
      correo: 'a@sancarlos.co',
      rol: 'paramedico',
    });
    const dos = await invitaciones.invitar(sesion(), ORG, {
      correo: 'b@sancarlos.co',
      rol: 'paramedico',
    });

    expect(uno.enlace).not.toBe(dos.enlace);
  });

  it('no aparece en ningun log', async () => {
    // El riesgo real de la tarea: "no pongas el token en la URL de un correo
    // Y en el log". Se espia el transporte de Nest, que es por donde sale
    // cualquier Logger del modulo, incluidos los avisos de degradacion.
    const escritos: string[] = [];
    const espia = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((trozo: any) => {
        escritos.push(String(trozo));
        return true;
      });
    const espiaError = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((trozo: any) => {
        escritos.push(String(trozo));
        return true;
      });

    try {
      const { invitaciones } = servicio();
      const res = await invitaciones.invitar(sesion(), ORG, {
        correo: 'jefe@sancarlos.co',
        rol: 'jefe_urgencias',
      });
      const token = tokenDelEnlace(res.enlace!);

      await invitaciones.describir(token);
      await invitaciones.aceptar(token, { nombre: 'Jefe' });

      const salida = escritos.join('');
      expect(salida).not.toContain(token);
      expect(salida).not.toContain(res.enlace);
    } finally {
      espia.mockRestore();
      espiaError.mockRestore();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Un solo uso, y 410 cuando ya no sirve
// ═══════════════════════════════════════════════════════════════════

describe('el ciclo de vida de una invitacion', () => {
  it('se acepta una vez y crea al actor con su rol', async () => {
    const { invitaciones } = servicio();

    const res = await invitaciones.invitar(sesion(), ORG, {
      correo: 'jefe@sancarlos.co',
      rol: 'jefe_urgencias',
      codigoSede: '1100100123',
    });
    const token = tokenDelEnlace(res.enlace!);

    const descrita = await invitaciones.describir(token);
    expect(descrita.rol).toBe('jefe_urgencias');
    expect(descrita.correo).toBe('jefe@sancarlos.co');
    expect(descrita.organizacionId).toBe(ORG);

    const aceptada = await invitaciones.aceptar(token, { nombre: 'Ana Ruiz' });
    expect(aceptada.actor.roles).toEqual(['jefe_urgencias']);
    expect(aceptada.actor.correo).toBe('jefe@sancarlos.co');
    expect(aceptada.actor.codigoSede).toBe('1100100123');
    expect(aceptada.actor.activo).toBe(true);

    const equipo = await invitaciones.equipo(sesion(), ORG);
    expect(equipo.actores.map((a) => a.correo)).toContain('jefe@sancarlos.co');
    expect(equipo.invitaciones[0].estado).toBe('aceptada');
  });

  it('un token usado dos veces devuelve 410', async () => {
    const { invitaciones } = servicio();

    const res = await invitaciones.invitar(sesion(), ORG, {
      correo: 'jefe@sancarlos.co',
      rol: 'jefe_urgencias',
    });
    const token = tokenDelEnlace(res.enlace!);

    await invitaciones.aceptar(token, {});

    expect(await estadoDe(() => invitaciones.aceptar(token, {}))).toBe(410);
    expect(await mensajeDe(() => invitaciones.aceptar(token, {}))).toMatch(
      /ya se uso/i,
    );
    // Y tambien deja de describirse: el enlace esta muerto para todo.
    expect(await estadoDe(() => invitaciones.describir(token))).toBe(410);
  });

  it('dos aceptaciones simultaneas crean UN actor, no dos', async () => {
    // El uso unico tiene que sobrevivir a la carrera, no solo a la secuencia:
    // el enlace se abre en dos pestañas y se pulsa a la vez.
    const { invitaciones } = servicio();

    const res = await invitaciones.invitar(sesion(), ORG, {
      correo: 'jefe@sancarlos.co',
      rol: 'jefe_urgencias',
    });
    const token = tokenDelEnlace(res.enlace!);

    const resultados = await Promise.allSettled([
      invitaciones.aceptar(token, {}),
      invitaciones.aceptar(token, {}),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const equipo = await invitaciones.equipo(sesion(), ORG);
    expect(
      equipo.actores.filter((a) => a.correo === 'jefe@sancarlos.co'),
    ).toHaveLength(1);
  });

  it('un token de 73 h devuelve 410 con un mensaje que dice que vencio', async () => {
    const { almacen, invitaciones } = servicio();

    const res = await invitaciones.invitar(sesion(), ORG, {
      correo: 'jefe@sancarlos.co',
      rol: 'jefe_urgencias',
    });
    const token = tokenDelEnlace(res.enlace!);

    // 73 h despues de crearla. Se envejece la fila en vez de mover el reloj
    // del proceso: es el mismo efecto y no deja jest con timers falsos.
    const guardada = (await almacen.invitacionPorHash(hashDe(token)))!;
    const hace73h = Date.now() - 73 * 60 * 60 * 1000;
    await almacen.guardarInvitacion({
      ...guardada,
      creadaEn: new Date(hace73h).toISOString(),
      expiraEn: new Date(hace73h + 72 * 60 * 60 * 1000).toISOString(),
    });

    expect(await estadoDe(() => invitaciones.describir(token))).toBe(410);
    const mensaje = await mensajeDe(() => invitaciones.describir(token));
    expect(mensaje).toMatch(/vencio/i);
    expect(mensaje).toMatch(/72 horas/);
    expect(await estadoDe(() => invitaciones.aceptar(token, {}))).toBe(410);
  });

  it('a las 71 h sigue viva: la vigencia es de 72, no de menos', async () => {
    const { almacen, invitaciones } = servicio();

    const res = await invitaciones.invitar(sesion(), ORG, {
      correo: 'jefe@sancarlos.co',
      rol: 'jefe_urgencias',
    });
    const token = tokenDelEnlace(res.enlace!);
    const guardada = (await almacen.invitacionPorHash(hashDe(token)))!;

    // La invitacion se creo hace 71 h: expira en una.
    expect(Date.parse(guardada.expiraEn) - Date.parse(guardada.creadaEn)).toBe(
      72 * 60 * 60 * 1000,
    );

    const hace71h = Date.now() - 71 * 60 * 60 * 1000;
    await almacen.guardarInvitacion({
      ...guardada,
      creadaEn: new Date(hace71h).toISOString(),
      expiraEn: new Date(hace71h + 72 * 60 * 60 * 1000).toISOString(),
    });

    await expect(invitaciones.describir(token)).resolves.toBeDefined();
  });

  it('una invitacion revocada devuelve 410 y lo dice', async () => {
    const { invitaciones } = servicio();

    const res = await invitaciones.invitar(sesion(), ORG, {
      correo: 'jefe@sancarlos.co',
      rol: 'jefe_urgencias',
    });
    const token = tokenDelEnlace(res.enlace!);

    await invitaciones.revocar(sesion(), ORG, res.invitacion.id);

    expect(await estadoDe(() => invitaciones.describir(token))).toBe(410);
    expect(await mensajeDe(() => invitaciones.aceptar(token, {}))).toMatch(
      /revoco/i,
    );
  });

  it('revocar dos veces no agrega un segundo evento', async () => {
    const { invitaciones } = servicio();

    const res = await invitaciones.invitar(sesion(), ORG, {
      correo: 'jefe@sancarlos.co',
      rol: 'jefe_urgencias',
    });

    await invitaciones.revocar(sesion(), ORG, res.invitacion.id);
    await invitaciones.revocar(sesion(), ORG, res.invitacion.id);

    const equipo = await invitaciones.equipo(sesion(), ORG);
    expect(
      equipo.eventos.filter((e) => e.tipo === 'invitacion_revocada'),
    ).toHaveLength(1);
  });

  it('un token inventado es 404, no 410', async () => {
    // 410 diria "esto existio". 404 no dice nada, y no filtra nada: sin los
    // 32 bytes correctos nadie llega hasta aqui de todos modos.
    const { invitaciones } = servicio();
    expect(await estadoDe(() => invitaciones.describir('no-existo'))).toBe(404);
  });

  it('reinvitar al mismo correo mata el enlace anterior', async () => {
    const { invitaciones } = servicio();

    const primera = await invitaciones.invitar(sesion(), ORG, {
      correo: 'jefe@sancarlos.co',
      rol: 'jefe_urgencias',
    });
    const segunda = await invitaciones.invitar(sesion(), ORG, {
      correo: 'jefe@sancarlos.co',
      rol: 'jefe_urgencias',
    });

    // Dos enlaces vivos para el mismo puesto es una credencial de mas.
    expect(
      await estadoDe(() =>
        invitaciones.describir(tokenDelEnlace(primera.enlace!)),
      ),
    ).toBe(410);
    await expect(
      invitaciones.describir(tokenDelEnlace(segunda.enlace!)),
    ).resolves.toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Invariante 3: nadie otorga un rol que no tiene
// ═══════════════════════════════════════════════════════════════════

describe('invariante 3 — nadie otorga un rol que no tiene', () => {
  it('admin_organizacion intentando crear regulador_crue recibe 403', async () => {
    const { invitaciones } = servicio();

    const estado = await estadoDe(() =>
      invitaciones.invitar(sesion(), ORG, {
        correo: 'regulador@crue.gov.co',
        rol: 'regulador_crue',
      }),
    );

    expect(estado).toBe(403);
  });

  it('tampoco puede crear auditor ni admin_plataforma', async () => {
    const { invitaciones } = servicio();

    for (const rol of ['auditor', 'admin_plataforma'] as Rol[]) {
      expect(
        await estadoDe(() =>
          invitaciones.invitar(sesion(), ORG, { correo: 'x@y.co', rol }),
        ),
      ).toBe(403);
    }
  });

  it('el 403 deja evento: un 403 mudo pierde la señal', async () => {
    const { invitaciones } = servicio();

    await estadoDe(() =>
      invitaciones.invitar(sesion(), ORG, {
        correo: 'regulador@crue.gov.co',
        rol: 'regulador_crue',
      }),
    );

    const equipo = await invitaciones.equipo(sesion(), ORG);
    const evento = equipo.eventos.find((e) => e.tipo === 'rol_no_otorgable');
    expect(evento).toBeDefined();
    expect(evento!.detalle.rolPedido).toBe('regulador_crue');
    expect(evento!.autorId).toBe('actor-admin');
  });

  it('si el actor SI tiene el rol, lo puede repartir', async () => {
    const { invitaciones } = servicio();
    const adminDelCrue = sesion({
      organizacionId: ORG,
      roles: ['admin_organizacion', 'regulador_crue'],
    });

    await expect(
      invitaciones.invitar(adminDelCrue, ORG, {
        correo: 'regulador@crue.gov.co',
        rol: 'regulador_crue',
      }),
    ).resolves.toBeDefined();
  });

  it('nadie invita un rol de servicio: eso lo emite 1.8', async () => {
    const { invitaciones } = servicio();
    const plataforma = sesion({ roles: ['admin_plataforma'] });

    expect(
      await estadoDe(() =>
        invitaciones.invitar(plataforma, ORG, {
          correo: 'svc@pulso.co',
          rol: 'servicio',
        }),
      ),
    ).toBe(403);
  });

  it('quien no tiene actor:invitar recibe 403 aunque pida su propio rol', async () => {
    const { invitaciones } = servicio();
    const paramedico = sesion({ id: 'actor-para', roles: ['paramedico'] });

    expect(
      await estadoDe(() =>
        invitaciones.invitar(paramedico, ORG, {
          correo: 'otro@sancarlos.co',
          rol: 'paramedico',
        }),
      ),
    ).toBe(403);
  });

  it('la tabla de roles otorgables es la que se le manda a la UI', () => {
    expect(rolesOtorgables(['admin_organizacion'])).toEqual([
      'paramedico',
      'jefe_urgencias',
      'admin_organizacion',
    ]);
    expect(rolesOtorgables(['admin_plataforma'])).not.toContain('servicio');
    expect(rolesOtorgables(['jefe_urgencias'])).toEqual(['jefe_urgencias']);
    expect(puedeInvitar(['jefe_urgencias'])).toBe(false);
    expect(puedeInvitar(['admin_organizacion'])).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Alcance de inquilino, verificado en el servidor
// ═══════════════════════════════════════════════════════════════════

describe('alcance de inquilino', () => {
  it('nadie invita a una organizacion que no es la suya', async () => {
    const { invitaciones } = servicio();

    expect(
      await estadoDe(() =>
        invitaciones.invitar(sesion(), OTRA_ORG, {
          correo: 'jefe@norte.co',
          rol: 'jefe_urgencias',
        }),
      ),
    ).toBe(403);
  });

  it('tampoco lee el equipo ajeno, y el intento queda registrado', async () => {
    const { invitaciones } = servicio();

    expect(
      await estadoDe(() => invitaciones.equipo(sesion(), OTRA_ORG)),
    ).toBe(403);

    const equipo = await invitaciones.equipo(sesion(), ORG);
    const evento = equipo.eventos.find((e) => e.tipo === 'intento_cruzado');
    expect(evento).toBeDefined();
    expect(evento!.detalle.organizacionSolicitada).toBe(OTRA_ORG);
  });

  it('`mi` lo resuelve el servidor, no el cliente', async () => {
    const { invitaciones } = servicio();

    const equipo = await invitaciones.equipo(sesion(), ORGANIZACION_PROPIA);
    expect(equipo.organizacionId).toBe(ORG);
  });

  it('admin_plataforma si cruza: es la excepcion escrita en la matriz', async () => {
    const { invitaciones } = servicio();
    const plataforma = sesion({ id: 'actor-plat', roles: ['admin_plataforma'] });

    const res = await invitaciones.invitar(plataforma, OTRA_ORG, {
      correo: 'jefe@norte.co',
      rol: 'jefe_urgencias',
    });
    expect(res.invitacion.organizacionId).toBe(OTRA_ORG);
  });

  it('el actor de una organizacion no se ve desde otra', async () => {
    const { almacen, invitaciones } = servicio();
    await almacen.guardarActor(
      actor({ id: 'actor-ajeno', organizacionId: OTRA_ORG, correo: 'x@norte.co' }),
    );

    const equipo = await invitaciones.equipo(sesion(), ORG);
    expect(equipo.actores.map((a) => a.id)).not.toContain('actor-ajeno');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Desactivar es activo=false, nunca DELETE
// ═══════════════════════════════════════════════════════════════════

describe('desactivar un actor', () => {
  async function conDosActores() {
    const { almacen, invitaciones } = servicio();
    await almacen.guardarActor(actor());
    await almacen.guardarActor(
      actor({
        id: 'actor-jefe',
        correo: 'jefe@sancarlos.co',
        nombre: 'Ana Ruiz',
        roles: ['jefe_urgencias'],
      }),
    );
    return { almacen, invitaciones };
  }

  it('no borra: el actor sigue en la lista, inactivo y con fecha', async () => {
    const { invitaciones } = await conDosActores();

    const res = await invitaciones.cambiarActivo(
      sesion(),
      ORG,
      'actor-jefe',
      false,
      'se fue a otra IPS',
    );

    expect(res.actor.activo).toBe(false);
    expect(res.actor.desactivadoEn).not.toBeNull();

    const equipo = await invitaciones.equipo(sesion(), ORG);
    const jefe = equipo.actores.find((a) => a.id === 'actor-jefe');
    // Sigue estando. Es lo que permite pintar "Ana Ruiz (inactivo)" en vez de
    // un id huerfano — caso limite 4 de multitenancy §7.
    expect(jefe).toBeDefined();
    expect(jefe!.nombre).toBe('Ana Ruiz');
    expect(jefe!.activo).toBe(false);
  });

  it('no rompe la auditoria historica: los eventos viejos siguen resolviendo', async () => {
    const { invitaciones } = await conDosActores();

    // Historia previa del actor: invito a alguien.
    const jefeSesion = sesion({ id: 'actor-jefe', roles: ['admin_organizacion'] });
    const invitacion = await invitaciones.invitar(jefeSesion, ORG, {
      correo: 'nuevo@sancarlos.co',
      rol: 'paramedico',
    });

    await invitaciones.cambiarActivo(sesion(), ORG, 'actor-jefe', false);

    const equipo = await invitaciones.equipo(sesion(), ORG);

    // 1. El evento viejo sigue ahi, con su autor intacto.
    const creada = equipo.eventos.find((e) => e.tipo === 'invitacion_creada');
    expect(creada!.autorId).toBe('actor-jefe');

    // 2. Y ese autor sigue resolviendo a una persona con nombre.
    expect(equipo.actores.find((a) => a.id === creada!.autorId)?.nombre).toBe(
      'Ana Ruiz',
    );

    // 3. La invitacion que creo tampoco desaparecio.
    expect(equipo.invitaciones.map((i) => i.id)).toContain(invitacion.invitacion.id);

    // 4. Y la desactivacion es un evento mas, no una edicion del anterior.
    expect(equipo.eventos.filter((e) => e.tipo === 'actor_desactivado')).toHaveLength(1);
  });

  it('se puede reactivar, y queda como otro evento', async () => {
    const { invitaciones } = await conDosActores();

    await invitaciones.cambiarActivo(sesion(), ORG, 'actor-jefe', false);
    const res = await invitaciones.cambiarActivo(sesion(), ORG, 'actor-jefe', true);

    expect(res.actor.activo).toBe(true);
    expect(res.actor.desactivadoEn).toBeNull();

    const equipo = await invitaciones.equipo(sesion(), ORG);
    expect(equipo.eventos.filter((e) => e.tipo === 'actor_desactivado')).toHaveLength(1);
    expect(equipo.eventos.filter((e) => e.tipo === 'actor_reactivado')).toHaveLength(1);
  });

  it('desactivar dos veces es idempotente y no duplica el evento', async () => {
    const { invitaciones } = await conDosActores();

    await invitaciones.cambiarActivo(sesion(), ORG, 'actor-jefe', false);
    await invitaciones.cambiarActivo(sesion(), ORG, 'actor-jefe', false);

    const equipo = await invitaciones.equipo(sesion(), ORG);
    expect(equipo.eventos.filter((e) => e.tipo === 'actor_desactivado')).toHaveLength(1);
  });

  it('nadie se desactiva a si mismo', async () => {
    const { invitaciones } = await conDosActores();
    expect(
      await estadoDe(() =>
        invitaciones.cambiarActivo(sesion(), ORG, 'actor-admin', false),
      ),
    ).toBe(409);
  });

  it('no se desactiva al ultimo administrador activo', async () => {
    const { almacen, invitaciones } = servicio();
    await almacen.guardarActor(actor());
    await almacen.guardarActor(
      actor({ id: 'actor-otro', correo: 'otro@sancarlos.co', roles: ['paramedico'] }),
    );

    // Lo intenta otro admin, no el propio: el guard que corta aqui es el de
    // "la organizacion se queda sin quien la administre", no el de si mismo.
    const otroAdmin = sesion({ id: 'actor-plat', roles: ['admin_plataforma'] });
    const mensaje = await mensajeDe(() =>
      invitaciones.cambiarActivo(otroAdmin, ORG, 'actor-admin', false),
    );
    expect(mensaje).toMatch(/ultimo administrador/i);
  });

  it('un actor de otra organizacion no se toca', async () => {
    const { almacen, invitaciones } = servicio();
    await almacen.guardarActor(
      actor({ id: 'actor-ajeno', organizacionId: OTRA_ORG, correo: 'x@norte.co' }),
    );

    expect(
      await estadoDe(() =>
        invitaciones.cambiarActivo(sesion(), ORG, 'actor-ajeno', false),
      ),
    ).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Degradacion: sin proveedor de correo, se enseña el enlace
// ═══════════════════════════════════════════════════════════════════

describe('sin proveedor de correo', () => {
  it('no finge que envio: devuelve el motivo y el enlace', async () => {
    const { invitaciones } = servicio();

    const res = await invitaciones.invitar(sesion(), ORG, {
      correo: 'jefe@sancarlos.co',
      rol: 'jefe_urgencias',
    });

    expect(res.correo).toEqual({ enviado: false, motivo: 'sin-proveedor' });
    expect(res.enlace).toMatch(/^https:\/\/pulso\.test\/invitacion\//);
  });

  it('la respuesta de /equipo declara la degradacion', async () => {
    const { invitaciones } = servicio();
    const equipo = await invitaciones.equipo(sesion(), ORG);

    expect(equipo.degradaciones.correo).toBe('ninguno');
    // 1.3 tampoco existe: nadie escribe el ultimo acceso todavia.
    expect(equipo.degradaciones.ultimoAcceso).toBe(false);
  });

  it('con proveedor configurado, el modo cambia y lo dice', () => {
    const correo = new CorreoService(config({ RESEND_API_KEY: 'x' }));
    expect(correo.configurado()).toBe(true);
    expect(correo.proveedor()).toBe('resend');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Validacion de entrada
// ═══════════════════════════════════════════════════════════════════

describe('entrada invalida', () => {
  it('un correo que no es correo es 400', async () => {
    const { invitaciones } = servicio();
    for (const correo of ['', 'sin-arroba', 'a@b', null, 42]) {
      expect(
        await estadoDe(() =>
          invitaciones.invitar(sesion(), ORG, { correo, rol: 'paramedico' }),
        ),
      ).toBe(400);
    }
  });

  it('un rol inventado es 400, no 403', async () => {
    // 400 y no 403: no es que no puedas, es que eso no existe.
    const { invitaciones } = servicio();
    expect(
      await estadoDe(() =>
        invitaciones.invitar(sesion(), ORG, {
          correo: 'x@y.co',
          rol: 'jefe_supremo',
        }),
      ),
    ).toBe(400);
  });

  it('el correo se normaliza a minusculas para no partir la identidad', async () => {
    const { invitaciones } = servicio();
    const res = await invitaciones.invitar(sesion(), ORG, {
      correo: '  Jefe@SanCarlos.CO ',
      rol: 'jefe_urgencias',
    });
    expect(res.invitacion.correo).toBe('jefe@sancarlos.co');
  });

  it('invitar a alguien que ya es del equipo es 409', async () => {
    const { almacen, invitaciones } = servicio();
    await almacen.guardarActor(actor({ correo: 'jefe@sancarlos.co' }));

    expect(
      await estadoDe(() =>
        invitaciones.invitar(sesion(), ORG, {
          correo: 'jefe@sancarlos.co',
          rol: 'jefe_urgencias',
        }),
      ),
    ).toBe(409);
  });

  it('a un desactivado se le reactiva, no se le reinvita', async () => {
    const { almacen, invitaciones } = servicio();
    await almacen.guardarActor(
      actor({ id: 'actor-ido', correo: 'ido@sancarlos.co', activo: false }),
    );

    const mensaje = await mensajeDe(() =>
      invitaciones.invitar(sesion(), ORG, {
        correo: 'ido@sancarlos.co',
        rol: 'jefe_urgencias',
      }),
    );
    expect(mensaje).toMatch(/reactiva/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  La costura con 1.3
// ═══════════════════════════════════════════════════════════════════

describe('identidad de turno (se borra con 1.3)', () => {
  const turno = config({
    [VAR_ROLES]: 'admin_organizacion',
    [VAR_ORGANIZACION]: ORG,
  });

  it('sin sesion no hay actor: es 401, no un permiso menor', () => {
    expect(new IdentidadService(turno).actorDe({})).toBeNull();
  });

  it('sin configurar no acredita nada, y por eso todo es 403', async () => {
    // El punto entero de esta tarea. Si aqui hubiera un rol de cortesia, los
    // dos 403 que 2.5 tiene que probar dejarian de poder fallar nunca.
    const identidad = new IdentidadService(config());
    const nadie = identidad.actorDe({ operador: 'operador' })!;

    expect(nadie.roles).toEqual([]);
    expect(nadie.organizacionId).toBeNull();

    const { invitaciones } = servicio();
    const mensaje = await mensajeDe(() =>
      invitaciones.equipo(nadie, ORGANIZACION_PROPIA),
    );
    // El 403 dice exactamente que falta, no "no autorizado" a secas.
    expect(mensaje).toContain(VAR_ORGANIZACION);
    expect(mensaje).toContain(VAR_ROLES);
  });

  it('declarado en el servidor, el turno si acredita', async () => {
    const delTurno = new IdentidadService(turno).actorDe({ operador: 'operador' })!;

    expect(delTurno.modo).toBe('turno');
    expect(delTurno.organizacionId).toBe(ORG);
    expect(delTurno.roles).toEqual(['admin_organizacion']);

    const { invitaciones } = servicio();
    const equipo = await invitaciones.equipo(delTurno, ORGANIZACION_PROPIA);
    expect(equipo.degradaciones.identidad).toBe('turno');
  });

  it('el turno tampoco puede saltarse el invariante 3', async () => {
    const delTurno = new IdentidadService(turno).actorDe({ operador: 'operador' })!;
    const { invitaciones } = servicio();

    // Los roles vienen de una variable de entorno, no de quien llama: no hay
    // forma de pedirse `regulador_crue` desde el navegador.
    expect(rolesOtorgables(delTurno.roles)).not.toContain('regulador_crue');
    expect(
      await estadoDe(() =>
        invitaciones.invitar(delTurno, ORGANIZACION_PROPIA, {
          correo: 'x@crue.gov.co',
          rol: 'regulador_crue',
        }),
      ),
    ).toBe(403);
  });

  it('un token de servicio no hereda el turno ni invita a nadie', async () => {
    // `svc:voz` reporta hechos; no reparte puestos en un hospital.
    const svc = new IdentidadService(turno).actorDe({ operador: 'svc:voz' })!;

    expect(svc.roles).toEqual(['servicio']);
    expect(puedeInvitar(svc.roles)).toBe(false);
    expect(svc.organizacionId).toBeNull();

    const { invitaciones } = servicio();
    expect(
      await estadoDe(() =>
        invitaciones.invitar(svc, ORG, { correo: 'x@y.co', rol: 'paramedico' }),
      ),
    ).toBe(403);
  });

  it('cuando 1.3 ponga el actor real, esa rama gana', () => {
    const real = new IdentidadService(turno).actorDe({
      operador: 'operador',
      actor: {
        id: 'actor-7',
        organizacionId: OTRA_ORG,
        roles: ['jefe_urgencias', 'rol_que_no_existe'],
      },
    })!;

    expect(real.modo).toBe('actor');
    expect(real.id).toBe('actor-7');
    // Gana sobre la variable de turno: la identidad real manda.
    expect(real.organizacionId).toBe(OTRA_ORG);
    // Un rol que este build no conoce se descarta: "no puedo hacer esto" es el
    // lado correcto del degradado.
    expect(real.roles).toEqual(['jefe_urgencias']);
  });

  it('el turno no invita a una organizacion que no es la declarada', async () => {
    const delTurno = new IdentidadService(turno).actorDe({ operador: 'operador' })!;
    const { invitaciones } = servicio();

    expect(
      await estadoDe(() =>
        invitaciones.invitar(delTurno, OTRA_ORG, {
          correo: 'x@y.co',
          rol: 'paramedico',
        }),
      ),
    ).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Cableado del modulo
// ═══════════════════════════════════════════════════════════════════

describe('el modulo levanta', () => {
  it('resuelve sus proveedores y expone las rutas por sus controladores', async () => {
    // Un error de inyeccion no lo ve `tsc`: aparece al arrancar core, que es
    // el peor momento para descubrirlo. Este test lo adelanta.
    const modulo = await Test.createTestingModule({
      // `isGlobal` como en app.module.ts: el modulo inyecta ConfigService sin
      // importar ConfigModule, igual que el resto de core.
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        InvitacionesModule,
      ],
    }).compile();

    await modulo.init();

    expect(modulo.get(InvitacionesService)).toBeInstanceOf(InvitacionesService);
    expect(modulo.get(EquipoController)).toBeInstanceOf(EquipoController);
    expect(modulo.get(InvitacionController)).toBeInstanceOf(InvitacionController);

    // Sin sesion, el controlador responde 401 y no un actor de cortesia.
    const controlador = modulo.get(EquipoController);
    expect(
      await estadoDe(async () => controlador.equipo({} as never, 'mi')),
    ).toBe(401);

    await modulo.close();
  });
});
