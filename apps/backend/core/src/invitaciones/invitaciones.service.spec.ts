/**
 * Tarea 2.5 — CRUD de equipo e invitaciones, criterio por criterio.
 *
 * Los cinco «hecho cuando»:
 *   1. el token viaja en el enlace, en base solo esta el hash
 *   2. un token usado dos veces → 410
 *   3. un token de 73 h → 410 con mensaje claro
 *   4. `admin_organizacion` intentando crear `regulador_crue` → 403
 *   5. desactivar un actor no rompe la auditoria historica
 */

import { HttpStatus, Logger } from '@nestjs/common';
import type { Sede } from '../contracts/types';
import { PulsoError } from '../common/pulso-error.filter';
import { RepoActoresMemoria } from '../auth/actores';
import type { ActorSesion } from '../auth/carga';
import { SEDES_CATALOGO } from '../sedes/catalogo.generado';
import type { SedesService } from '../sedes/sedes.service';
import { AfiliacionService } from '../afiliacion/afiliacion.service';
import { RepoOrganizacionesMemoria } from '../afiliacion/organizaciones';
import { InvitacionesService } from './invitaciones.service';
import {
  RepoInvitacionesMemoria,
  VIGENCIA_MS,
  hashDeToken,
} from './invitaciones';

const SEDE: Sede = SEDES_CATALOGO[0];
const CLAVE = 'una-clave-larga-de-verdad';
const BASE = 'https://pulso.example';

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

async function montar() {
  const sedes = {
    todas: () => Promise.resolve(SEDES_CATALOGO),
    porCodigo: (codigo: string) =>
      Promise.resolve(SEDES_CATALOGO.find((s) => s.codigo === codigo)),
  } as unknown as SedesService;

  const organizaciones = new RepoOrganizacionesMemoria();
  const actores = new RepoActoresMemoria({ get: () => undefined } as never);
  const afiliacion = new AfiliacionService(sedes, organizaciones, actores);
  const invitaciones = new RepoInvitacionesMemoria();
  const servicio = new InvitacionesService(invitaciones, actores, afiliacion);

  const { organizacion, admin } = await afiliacion.crear({
    tipo: 'ips',
    nit: '900123456-1',
    razonSocial: SEDE.nombre,
    sedes: [SEDE.codigo],
    admin: { nombre: 'Ana Ruiz', correo: 'ana@ips.co', clave: CLAVE },
  });

  const sesionAdmin: ActorSesion = {
    id: admin.id,
    organizacionId: organizacion.id,
    roles: ['admin_organizacion'],
    sedes: [],
    tipo: 'humano',
    sesionId: 'sid-1',
    legado: false,
  };

  return {
    servicio,
    invitaciones,
    actores,
    afiliacion,
    organizacion,
    admin,
    sesionAdmin,
  };
}

// ═══════════════════════════════════════════════════════════════
//  Criterio 1 — el token viaja en el enlace, en base solo el hash
// ═══════════════════════════════════════════════════════════════

describe('crear una invitacion', () => {
  it('devuelve el enlace con el token y guarda SOLO su hash', async () => {
    const { servicio, invitaciones, organizacion, sesionAdmin } =
      await montar();

    const r = await servicio.invitar(
      organizacion.id,
      { correo: 'Jefe@IPS.co', rol: 'jefe_urgencias', codigoSede: SEDE.codigo },
      sesionAdmin,
      BASE,
    );

    const token = r.enlace.split('/').pop()!;
    expect(r.enlace).toBe(`${BASE}/invitacion/${token}`);
    // 32 bytes en base64url son 43 caracteres.
    expect(token).toHaveLength(43);

    // Lo que queda guardado no contiene el token por ningun lado.
    const guardada = JSON.stringify(
      await invitaciones.deOrganizacion(organizacion.id),
    );
    expect(guardada).not.toContain(token);
    // Y el objeto que sale por el cable tampoco.
    expect(JSON.stringify(r.invitacion)).not.toContain(token);

    // Pero el hash SI resuelve: es lo unico que se guarda y alcanza.
    expect(await invitaciones.porToken(token)).toBeDefined();
    expect(hashDeToken(token)).toHaveLength(64);
  });

  it('dos invitaciones nunca comparten token', async () => {
    const { servicio, organizacion, sesionAdmin } = await montar();
    const a = await servicio.invitar(
      organizacion.id,
      { correo: 'uno@ips.co', rol: 'admin_organizacion' },
      sesionAdmin,
      BASE,
    );
    const b = await servicio.invitar(
      organizacion.id,
      { correo: 'dos@ips.co', rol: 'admin_organizacion' },
      sesionAdmin,
      BASE,
    );
    expect(a.enlace).not.toBe(b.enlace);
  });

  it('dice que NO la mando por correo, en vez de fingir que si', async () => {
    // Regla de degradacion del repo: sin proveedor, se degrada y se DICE.
    const { servicio, organizacion, sesionAdmin } = await montar();
    const r = await servicio.invitar(
      organizacion.id,
      { correo: 'jefe@ips.co', rol: 'admin_organizacion' },
      sesionAdmin,
      BASE,
    );
    expect(r.enviadoPorCorreo).toBe(false);
    expect(r.enlace).toContain('/invitacion/');
  });

  it('expira en 72 h', async () => {
    const { servicio, organizacion, sesionAdmin } = await montar();
    const r = await servicio.invitar(
      organizacion.id,
      { correo: 'jefe@ips.co', rol: 'admin_organizacion' },
      sesionAdmin,
      BASE,
    );
    const vida = Date.parse(r.invitacion.expiraEn) - Date.now();
    expect(vida).toBeGreaterThan(VIGENCIA_MS - 5_000);
    expect(vida).toBeLessThanOrEqual(VIGENCIA_MS);
  });

  it('no deja dos invitaciones vivas para el mismo correo', async () => {
    // Dos tokens buenos para la misma persona: el admin cree que el segundo
    // anulo al primero, y no.
    const { servicio, organizacion, sesionAdmin } = await montar();
    await servicio.invitar(
      organizacion.id,
      { correo: 'jefe@ips.co', rol: 'admin_organizacion' },
      sesionAdmin,
      BASE,
    );
    await expect(
      servicio.invitar(
        organizacion.id,
        { correo: 'JEFE@ips.co', rol: 'admin_organizacion' },
        sesionAdmin,
        BASE,
      ),
    ).rejects.toThrow(/ya tiene una invitacion pendiente/);
  });

  it('rechaza un correo sin arroba y un rol que no existe', async () => {
    const { servicio, organizacion, sesionAdmin } = await montar();
    await expect(
      servicio.invitar(
        organizacion.id,
        { correo: 'nada', rol: 'admin_organizacion' },
        sesionAdmin,
        BASE,
      ),
    ).rejects.toThrow(/correo valido/);
    await expect(
      servicio.invitar(
        organizacion.id,
        { correo: 'x@y.co', rol: 'jefe' as never },
        sesionAdmin,
        BASE,
      ),
    ).rejects.toThrow(/no es un rol del sistema/);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Criterio 4 — nadie otorga un rol que no tiene (invariante 3)
// ═══════════════════════════════════════════════════════════════

describe('el invariante 3: nadie otorga un rol que no tiene', () => {
  it('admin_organizacion intentando crear regulador_crue → 403', async () => {
    const { servicio, organizacion, sesionAdmin } = await montar();
    try {
      await servicio.invitar(
        organizacion.id,
        { correo: 'crue@ips.co', rol: 'regulador_crue' },
        sesionAdmin,
        BASE,
      );
      fail('deberia haber reventado');
    } catch (e) {
      const error = e as PulsoError;
      expect(error.estado).toBe(HttpStatus.FORBIDDEN);
      expect(error.message).toContain('regulador_crue');
      // El motivo dice QUE clase de rol es y quien si puede otorgarlo.
      expect(error.message).toContain('rol de red');
      expect(error.message).toContain('admin_plataforma');
    }
  });

  it('tampoco los otros dos roles de red', async () => {
    const { servicio, organizacion, sesionAdmin } = await montar();
    for (const rol of ['admin_plataforma', 'auditor'] as const) {
      await expect(
        servicio.invitar(
          organizacion.id,
          { correo: `${rol}@ips.co`, rol },
          sesionAdmin,
          BASE,
        ),
      ).rejects.toMatchObject({ estado: HttpStatus.FORBIDDEN });
    }
  });

  it('un actor de servicio no se invita por correo', async () => {
    // Se emite con POST /auth/servicio (tarea 1.8) y queda auditado. Por
    // correo se colaria un `svc:` con contraseña de humano.
    const { servicio, organizacion, sesionAdmin } = await montar();
    await expect(
      servicio.invitar(
        organizacion.id,
        { correo: 'bot@ips.co', rol: 'servicio' },
        sesionAdmin,
        BASE,
      ),
    ).rejects.toThrow(/POST \/auth\/servicio/);
  });

  it('SI puede invitar a los roles de su propia organizacion', async () => {
    // La otra mitad del invariante, y la que hace util a /panel/equipo: un
    // admin que no pudiera invitar al jefe de urgencias de su sede ni a sus
    // paramedicos no podria hacer crecer la organizacion.
    const { servicio, organizacion, sesionAdmin } = await montar();
    for (const rol of [
      'jefe_urgencias',
      'paramedico',
      'admin_organizacion',
    ] as const) {
      await expect(
        servicio.invitar(
          organizacion.id,
          { correo: `${rol}@ips.co`, rol },
          sesionAdmin,
          BASE,
        ),
      ).resolves.toBeDefined();
    }
  });

  it('ni siquiera un regulador_crue puede crear otro regulador_crue', async () => {
    // Los roles de red no se propagan solos: si lo hicieran, la red entera
    // creceria sin pasar nunca por la plataforma.
    const { servicio, organizacion } = await montar();
    const regulador: ActorSesion = {
      id: 'crue-1',
      organizacionId: organizacion.id,
      roles: ['regulador_crue'],
      sedes: [],
      tipo: 'humano',
      sesionId: 'sid-c',
      legado: false,
    };
    await expect(
      servicio.invitar(
        organizacion.id,
        { correo: 'otro-crue@ips.co', rol: 'regulador_crue' },
        regulador,
        BASE,
      ),
    ).rejects.toMatchObject({ estado: HttpStatus.FORBIDDEN });
  });

  it('admin_plataforma es la excepcion declarada y otorga cualquiera', async () => {
    const { servicio, organizacion } = await montar();
    const plataforma: ActorSesion = {
      id: 'plataforma-1',
      organizacionId: 'otra-org',
      roles: ['admin_plataforma'],
      sedes: [],
      tipo: 'humano',
      sesionId: 'sid-p',
      legado: false,
    };
    await expect(
      servicio.invitar(
        organizacion.id,
        { correo: 'crue@ips.co', rol: 'regulador_crue' },
        plataforma,
        BASE,
      ),
    ).resolves.toBeDefined();
  });

  it('el inquilino sale del token, no de la URL', async () => {
    // Caso limite 13 de §7: cambiar el uuid de la barra de direcciones no
    // puede invitar gente a otra organizacion.
    const { servicio, sesionAdmin, afiliacion } = await montar();
    const { organizacion: ajena } = await afiliacion.crear({
      tipo: 'ips',
      nit: '800777666-1',
      razonSocial: SEDES_CATALOGO[1].nombre,
      sedes: [SEDES_CATALOGO[1].codigo],
      admin: { nombre: 'Otro', correo: 'otro@ips2.co', clave: CLAVE },
    });
    await expect(
      servicio.invitar(
        ajena.id,
        { correo: 'x@y.co', rol: 'admin_organizacion' },
        sesionAdmin,
        BASE,
      ),
    ).rejects.toMatchObject({ estado: HttpStatus.FORBIDDEN });
  });
});

// ═══════════════════════════════════════════════════════════════
//  Criterios 2 y 3 — un solo uso, 72 h, y 410 en los dos casos
// ═══════════════════════════════════════════════════════════════

describe('aceptar una invitacion', () => {
  async function conInvitacion(
    rol: 'jefe_urgencias' | 'admin_organizacion' = 'admin_organizacion',
  ) {
    const ctx = await montar();
    const r = await ctx.servicio.invitar(
      ctx.organizacion.id,
      { correo: 'jefe@ips.co', rol, codigoSede: SEDE.codigo },
      ctx.sesionAdmin,
      BASE,
    );
    return {
      ...ctx,
      token: r.enlace.split('/').pop()!,
      invitacion: r.invitacion,
    };
  }

  it('crea el actor con su rol y su alcance de sede', async () => {
    const { servicio, token, organizacion } = await conInvitacion();
    const r = await servicio.aceptar(token, {
      nombre: 'Carlos Jefe',
      clave: CLAVE,
    });
    expect(r.actor.roles).toEqual(['admin_organizacion']);
    expect(r.actor.sedes).toEqual([SEDE.codigo]);
    expect(r.actor.organizacionId).toBe(organizacion.id);
    expect(r.organizacion.id).toBe(organizacion.id);
  });

  it('un token usado dos veces → 410', async () => {
    const { servicio, token } = await conInvitacion();
    await servicio.aceptar(token, { nombre: 'Carlos', clave: CLAVE });
    try {
      await servicio.aceptar(token, { nombre: 'Otro', clave: CLAVE });
      fail('deberia haber reventado');
    } catch (e) {
      const error = e as PulsoError;
      expect(error.estado).toBe(HttpStatus.GONE);
      expect(error.code).toBe('PULSO_INVITACION_YA_USADA');
      // Y dice cuando se uso: es lo que permite detectar que no fuiste tu.
      expect(error.message).toMatch(/ya se uso el \d{4}-\d{2}-\d{2}/);
    }
  });

  it('un token de 73 h → 410 con mensaje claro', async () => {
    const { servicio, invitaciones, invitacion, token } = await conInvitacion();

    // Se envejece la invitacion en vez de esperar 73 horas.
    await invitaciones.guardar({
      ...invitacion,
      expiraEn: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    try {
      await servicio.aceptar(token, { nombre: 'Carlos', clave: CLAVE });
      fail('deberia haber reventado');
    } catch (e) {
      const error = e as PulsoError;
      expect(error.estado).toBe(HttpStatus.GONE);
      expect(error.code).toBe('PULSO_INVITACION_EXPIRADA');
      // Claro = dice que vencio, cuanto duran, y que hacer ahora.
      expect(error.message).toMatch(/vencio/);
      expect(error.message).toContain('72 horas');
      expect(error.message).toMatch(/pidele otra/i);
    }
  });

  it('un token que nunca existio es 404, no 410', async () => {
    // 410 dice «existio y ya no sirve». Decir eso de un token inventado le
    // confirmaria al que prueba tokens que acerto con uno.
    const { servicio } = await montar();
    try {
      await servicio.aceptar('token-inventado', {
        nombre: 'X',
        clave: CLAVE,
      });
      fail('deberia haber reventado');
    } catch (e) {
      expect((e as PulsoError).estado).toBe(HttpStatus.NOT_FOUND);
    }
  });

  it('una invitacion revocada tampoco se acepta', async () => {
    const { servicio, organizacion, invitacion, token, sesionAdmin } =
      await conInvitacion();
    await servicio.revocar(organizacion.id, invitacion.id, sesionAdmin);
    await expect(
      servicio.aceptar(token, { nombre: 'Carlos', clave: CLAVE }),
    ).rejects.toMatchObject({ estado: HttpStatus.GONE });
  });

  it('si la contraseña es muy corta, la invitacion SIGUE sirviendo', async () => {
    // Quemarla antes de crear al actor dejaria a la persona sin cuenta y sin
    // token: tendria que pedir otra invitacion por escribir mal la clave.
    const { servicio, token } = await conInvitacion();
    await expect(
      servicio.aceptar(token, { nombre: 'Carlos', clave: 'corta' }),
    ).rejects.toBeDefined();

    await expect(
      servicio.aceptar(token, { nombre: 'Carlos', clave: CLAVE }),
    ).resolves.toBeDefined();
  });

  it('un correo que ya tiene cuenta lo dice, y dice por que', async () => {
    // Caso limite 1 de §7 (un medico en dos IPS) necesita la tabla de
    // identidad de la tarea 1.1. Se declara en vez de adivinar.
    const { servicio, organizacion, sesionAdmin } = await montar();
    const r = await servicio.invitar(
      organizacion.id,
      { correo: 'ana@ips.co', rol: 'admin_organizacion' },
      sesionAdmin,
      BASE,
    );
    await expect(
      servicio.aceptar(r.enlace.split('/').pop()!, {
        nombre: 'Ana otra vez',
        clave: CLAVE,
      }),
    ).rejects.toThrow(/tarea 1.1/);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Criterio 5 — desactivar no rompe la auditoria
// ═══════════════════════════════════════════════════════════════

describe('el equipo', () => {
  it('lista actores e invitaciones vivas, y solo las vivas', async () => {
    const { servicio, organizacion, sesionAdmin } = await montar();
    const viva = await servicio.invitar(
      organizacion.id,
      { correo: 'viva@ips.co', rol: 'admin_organizacion' },
      sesionAdmin,
      BASE,
    );
    const aRevocar = await servicio.invitar(
      organizacion.id,
      { correo: 'revocada@ips.co', rol: 'admin_organizacion' },
      sesionAdmin,
      BASE,
    );
    await servicio.revocar(
      organizacion.id,
      aRevocar.invitacion.id,
      sesionAdmin,
    );

    const equipo = await servicio.equipo(organizacion.id, sesionAdmin);
    expect(equipo.actores).toHaveLength(1);
    expect(equipo.invitacionesPendientes.map((i) => i.id)).toEqual([
      viva.invitacion.id,
    ]);
  });

  it('desactivar es activo=false: el actor sigue ahi para la auditoria', async () => {
    const { servicio, actores, organizacion, sesionAdmin } = await montar();
    const r = await servicio.invitar(
      organizacion.id,
      { correo: 'jefe@ips.co', rol: 'admin_organizacion' },
      sesionAdmin,
      BASE,
    );
    const { actor } = await servicio.aceptar(r.enlace.split('/').pop()!, {
      nombre: 'Carlos Jefe',
      clave: CLAVE,
    });

    const desactivado = await servicio.desactivar(
      organizacion.id,
      actor.id,
      sesionAdmin,
    );
    expect(desactivado.activo).toBe(false);

    // Sigue resolviendo por id: es lo que necesita un evento viejo para
    // poder pintar «Carlos Jefe (inactivo)» en vez de un uuid huerfano.
    const enBase = await actores.porId(actor.id);
    expect(enBase?.nombre).toBe('Carlos Jefe');
    expect(enBase?.activo).toBe(false);

    // Y sigue saliendo en la tabla del equipo, en gris, no escondido.
    const equipo = await servicio.equipo(organizacion.id, sesionAdmin);
    expect(equipo.actores.map((a) => a.id)).toContain(actor.id);
  });

  it('nadie se desactiva a si mismo', async () => {
    // Dejaria a la organizacion sin admin y sin forma de volver a entrar.
    const { servicio, organizacion, sesionAdmin } = await montar();
    await expect(
      servicio.desactivar(organizacion.id, sesionAdmin.id, sesionAdmin),
    ).rejects.toThrow(/a ti mismo/);
  });

  it('no se desactiva a un actor de otra organizacion', async () => {
    const { servicio, organizacion, sesionAdmin } = await montar();
    await expect(
      servicio.desactivar(organizacion.id, 'actor-ajeno', sesionAdmin),
    ).rejects.toThrow(/no es de esta organizacion/);
  });
});

describe('revocar', () => {
  it('es idempotente: revocar dos veces es la misma intencion', async () => {
    const { servicio, organizacion, sesionAdmin } = await montar();
    const r = await servicio.invitar(
      organizacion.id,
      { correo: 'jefe@ips.co', rol: 'admin_organizacion' },
      sesionAdmin,
      BASE,
    );
    const una = await servicio.revocar(
      organizacion.id,
      r.invitacion.id,
      sesionAdmin,
    );
    const otra = await servicio.revocar(
      organizacion.id,
      r.invitacion.id,
      sesionAdmin,
    );
    expect(otra.revocadaEn).toBe(una.revocadaEn);
  });

  it('una invitacion ya aceptada NO se revoca: eso es desactivar al actor', async () => {
    const { servicio, organizacion, sesionAdmin } = await montar();
    const r = await servicio.invitar(
      organizacion.id,
      { correo: 'jefe@ips.co', rol: 'admin_organizacion' },
      sesionAdmin,
      BASE,
    );
    await servicio.aceptar(r.enlace.split('/').pop()!, {
      nombre: 'Carlos',
      clave: CLAVE,
    });
    await expect(
      servicio.revocar(organizacion.id, r.invitacion.id, sesionAdmin),
    ).rejects.toThrow(/desactivar al actor/);
  });
});
