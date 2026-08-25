/**
 * Tareas 2.1 y 2.5 — las rutas, con el guard global puesto.
 *
 * Esto no re-prueba la logica (eso esta en los specs de servicio): prueba el
 * CABLEADO, que es lo que se rompe en silencio. Concretamente:
 *
 *   · que `verificar` y `crear` sean publicas de verdad — sin ellas, una
 *     organizacion nueva no puede afiliarse porque no tiene con que entrar
 *   · que `transicion` exija `admin_plataforma` — aprobar una afiliacion
 *     mete una sede al ranking de urgencias de la ciudad
 *   · que aceptar una invitacion sea publica y devuelva 410 al reintento
 *   · que los codigos HTTP salgan como dice el contrato
 */

import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type {
  AceptarInvitacionResponse,
  CrearAfiliacionResponse,
  CrearInvitacionResponse,
  EquipoResponse,
  EstadoAfiliacionResponse,
  Organizacion,
  VerificarAfiliacionResponse,
} from '../contracts/types';
import { PulsoErrorFilter } from '../common/pulso-error.filter';
import { RepoActoresMemoria } from '../auth/actores';
import type { ActorSesion } from '../auth/carga';
import { CLAVE_PUBLICO } from '../auth/publico.decorator';
import { RolGuard } from '../auth/rol.guard';
import { RegistroSesiones } from '../auth/sesiones';
import { SEDES_CATALOGO } from '../sedes/catalogo.generado';
import { SedesService } from '../sedes/sedes.service';
import { InvitacionesController } from '../invitaciones/invitaciones.controller';
import { InvitacionesService } from '../invitaciones/invitaciones.service';
import { RepoInvitacionesMemoria } from '../invitaciones/invitaciones';
import { AfiliacionController } from './afiliacion.controller';
import { AfiliacionService } from './afiliacion.service';
import { LimiteIp } from './limite-ip';
import { RepoOrganizacionesMemoria } from './organizaciones';

const SEDE = SEDES_CATALOGO[0];
const CLAVE = 'una-clave-larga-de-verdad';

/**
 * Quien va en la sesion de la peticion. Lo cambia cada test antes de llamar.
 * `null` = sin sesion, que es como llega alguien de la calle.
 */
let actorActual: ActorSesion | null = null;

/**
 * Un doble del `SesionGuard` real: niega por defecto y abre con `@Publico()`,
 * que es exactamente su contrato. Se usa el doble y no el de verdad porque
 * ese exige emitir un token firmado, y lo que se prueba aqui es que las
 * rutas esten bien decoradas — no la criptografia de 1.3.
 */
class SesionGuardDoble {
  constructor(private readonly reflector: Reflector) {}
  canActivate(contexto: {
    getHandler: () => unknown;
    getClass: () => unknown;
    switchToHttp: () => { getRequest: () => Record<string, unknown> };
  }): boolean {
    const publico = this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ] as never);
    if (publico) return true;
    if (!actorActual) return false;
    contexto.switchToHttp().getRequest().actor = actorActual;
    return true;
  }
}

let app: INestApplication;
let afiliacion: AfiliacionService;

beforeAll(async () => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

  const modulo = await Test.createTestingModule({
    controllers: [AfiliacionController, InvitacionesController],
    providers: [
      AfiliacionService,
      InvitacionesService,
      LimiteIp,
      RepoOrganizacionesMemoria,
      RepoInvitacionesMemoria,
      RepoActoresMemoria,
      RegistroSesiones,
      { provide: ConfigService, useValue: { get: () => undefined } },
      {
        provide: SedesService,
        useValue: {
          todas: () => Promise.resolve(SEDES_CATALOGO),
          porCodigo: (codigo: string) =>
            Promise.resolve(SEDES_CATALOGO.find((s) => s.codigo === codigo)),
        },
      },
      { provide: APP_FILTER, useClass: PulsoErrorFilter },
      {
        provide: APP_GUARD,
        inject: [Reflector],
        useFactory: (r: Reflector) => new SesionGuardDoble(r),
      },
      { provide: APP_GUARD, useClass: RolGuard },
    ],
  }).compile();

  app = modulo.createNestApplication();
  afiliacion = modulo.get(AfiliacionService);
  await app.init();
});

afterAll(async () => {
  await app?.close();
  jest.restoreAllMocks();
});

beforeEach(() => (actorActual = null));

/**
 * `app.getHttpServer()` esta tipado `any` en Nest. Mismo criterio que
 * `pedir()`: se acota una vez aqui en vez de apagar la regla en el archivo.
 */
const servidor = () => request(app.getHttpServer() as import('http').Server);

/**
 * `supertest` tipa `.body` como `any` y este proyecto tiene las reglas
 * `no-unsafe-*` encendidas — con razon.
 *
 * En vez de apagarlas para todo el archivo, que dejaria pasar cualquier `any`
 * de verdad, el unico `as` vive aqui. Todo lo demas queda tipado contra el
 * contrato, que ademas es lo que se quiere probar: si una ruta deja de
 * devolver lo que dice `contracts/types.ts`, esto no compila.
 */
async function pedir<T>(llamada: request.Test, estado: number): Promise<T> {
  const r = await llamada.expect(estado);
  return r.body as T;
}

/** El sobre de error de PULSO, para las rutas que tienen que fallar. */
type Sobre = { error: { code: string; message: string; retryable: boolean } };

// ═══════════════════════════════════════════════════════════════
//  Las dos rutas publicas
// ═══════════════════════════════════════════════════════════════

describe('POST /afiliacion/verificar', () => {
  it('responde 200 sin sesion: quien se afilia todavia no tiene cuenta', async () => {
    const cuerpo = await pedir<VerificarAfiliacionResponse>(
      servidor().post('/afiliacion/verificar').send({
        tipo: 'ips',
        codigoHabilitacion: SEDE.codigo,
        nit: '900123456-1',
        razonSocial: SEDE.nombre,
      }),
      200,
    );

    expect(cuerpo.encontrada).toBe(true);
    expect(cuerpo.sede?.codigo).toBe(SEDE.codigo);
  });

  it('un codigo que no existe tambien es 200, con el motivo', async () => {
    // Un 404 aqui obligaria al afiliado a adivinar si escribio mal.
    const cuerpo = await pedir<VerificarAfiliacionResponse>(
      servidor().post('/afiliacion/verificar').send({
        tipo: 'ips',
        codigoHabilitacion: '119999999999',
        nit: '900123456',
      }),
      200,
    );
    expect(cuerpo.encontrada).toBe(false);
    expect(cuerpo.motivo).toBeTruthy();
  });

  it('NO dice si esa sede ya esta afiliada a PULSO', async () => {
    // El REPS es publico; nuestra cartera de clientes no.
    await pedir<CrearAfiliacionResponse>(
      servidor()
        .post('/afiliacion')
        .send({
          tipo: 'ips',
          nit: '900555444-1',
          razonSocial: SEDE.nombre,
          sedes: [SEDE.codigo],
          admin: { nombre: 'Ana', correo: 'sigilo@ips.co', clave: CLAVE },
        }),
      201,
    );

    const cuerpo = await pedir<VerificarAfiliacionResponse>(
      servidor().post('/afiliacion/verificar').send({
        tipo: 'ips',
        codigoHabilitacion: SEDE.codigo,
        nit: '900555444-1',
        razonSocial: SEDE.nombre,
      }),
      200,
    );

    const texto = JSON.stringify(cuerpo);
    expect(texto).not.toMatch(/organizacion/i);
    expect(texto).not.toMatch(/afiliad/i);
    expect(cuerpo).not.toHaveProperty('estado');
  });

  it('sin NIT devuelve 400 con el sobre de error de PULSO', async () => {
    const cuerpo = await pedir<Sobre>(
      servidor().post('/afiliacion/verificar').send({ tipo: 'ips' }),
      400,
    );
    expect(cuerpo.error.code).toBe('PULSO_INVALID_INPUT');
    expect(cuerpo.error.retryable).toBe(false);
  });
});

describe('POST /afiliacion', () => {
  it('responde 201 sin sesion y devuelve organizacion y admin', async () => {
    const cuerpo = await pedir<CrearAfiliacionResponse>(
      servidor()
        .post('/afiliacion')
        .send({
          tipo: 'ips',
          nit: '901000111-1',
          razonSocial: SEDES_CATALOGO[3].nombre,
          sedes: [SEDES_CATALOGO[3].codigo],
          admin: { nombre: 'Ana Ruiz', correo: 'ana201@ips.co', clave: CLAVE },
        }),
      201,
    );

    expect(cuerpo.organizacion.estado).toBe('aprobada');
    expect(cuerpo.admin.roles).toEqual(['admin_organizacion']);
  });

  it('nunca devuelve la contraseña', async () => {
    const cuerpo = await pedir<CrearAfiliacionResponse>(
      servidor()
        .post('/afiliacion')
        .send({
          tipo: 'ips',
          nit: '901000222-1',
          razonSocial: SEDES_CATALOGO[4].nombre,
          sedes: [SEDES_CATALOGO[4].codigo],
          admin: { nombre: 'Ana', correo: 'ana202@ips.co', clave: CLAVE },
        }),
      201,
    );
    expect(JSON.stringify(cuerpo)).not.toContain(CLAVE);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Las que exigen sesion, y la que exige rol
// ═══════════════════════════════════════════════════════════════

describe('GET /afiliacion/:id/estado', () => {
  it('sin sesion es 403: el guard global niega por defecto', async () => {
    await servidor().get('/afiliacion/lo-que-sea/estado').expect(403);
  });

  it('con sesion devuelve estado y observaciones, y nada mas', async () => {
    const { organizacion } = await afiliacion.crear({
      tipo: 'ips',
      nit: '901000333-1',
      razonSocial: SEDES_CATALOGO[5].nombre,
      sedes: [SEDES_CATALOGO[5].codigo],
      admin: { nombre: 'Ana', correo: 'ana203@ips.co', clave: CLAVE },
    });
    actorActual = sesion(['admin_organizacion'], organizacion.id);

    const cuerpo = await pedir<EstadoAfiliacionResponse>(
      servidor().get(`/afiliacion/${organizacion.id}/estado`),
      200,
    );

    expect(cuerpo.id).toBe(organizacion.id);
    expect(cuerpo.estado).toBe('aprobada');
    expect(cuerpo.verificacion).toBe('reps_automatico');
    expect(cuerpo.observaciones).toEqual([]);
    expect(typeof cuerpo.actualizadaEn).toBe('string');

    // Y NADA mas. Se comparan las llaves en vez de listar lo que no puede
    // salir: asi el dia que alguien agregue un campo al controlador, este
    // test lo obliga a decidir si ese campo puede viajar.
    expect(Object.keys(cuerpo).sort()).toEqual([
      'actualizadaEn',
      'estado',
      'id',
      'observaciones',
      'verificacion',
    ]);
  });
});

describe('POST /afiliacion/:id/transicion', () => {
  async function unaOrganizacion(nit: string, correo: string, i: number) {
    const { organizacion } = await afiliacion.crear({
      tipo: 'ips',
      nit,
      razonSocial: SEDES_CATALOGO[i].nombre,
      sedes: [SEDES_CATALOGO[i].codigo],
      admin: { nombre: 'Ana', correo, clave: CLAVE },
    });
    return organizacion;
  }

  it('un admin_organizacion NO puede activarse a si mismo: 403', async () => {
    // Es la casilla `afiliacion:aprobar` de §5.2, marcada solo para
    // admin_plataforma. Si esto pasara, cualquiera se mete al ranking.
    const org = await unaOrganizacion('901000444-1', 'ana204@ips.co', 6);
    actorActual = sesion(['admin_organizacion'], org.id);
    await servidor()
      .post(`/afiliacion/${org.id}/transicion`)
      .send({ estado: 'activa' })
      .expect(403);
  });

  it('un admin_plataforma si, y responde 200', async () => {
    const org = await unaOrganizacion('901000555-1', 'ana205@ips.co', 7);
    actorActual = sesion(['admin_plataforma'], 'plataforma');
    const cuerpo = await pedir<{ organizacion: Organizacion }>(
      servidor()
        .post(`/afiliacion/${org.id}/transicion`)
        .send({ estado: 'activa' }),
      200,
    );
    expect(cuerpo.organizacion.estado).toBe('activa');
  });

  it('una transicion ilegal devuelve 400 con PULSO_ILLEGAL_TRANSITION', async () => {
    const org = await unaOrganizacion('901000666-1', 'ana206@ips.co', 8);
    actorActual = sesion(['admin_plataforma'], 'plataforma');
    const cuerpo = await pedir<Sobre>(
      servidor()
        .post(`/afiliacion/${org.id}/transicion`)
        .send({ estado: 'suspendida', motivo: 'porque si' }),
      400,
    );
    expect(cuerpo.error.code).toBe('PULSO_ILLEGAL_TRANSITION');
  });
});

// ═══════════════════════════════════════════════════════════════
//  Invitaciones — el cableado de la 2.5
// ═══════════════════════════════════════════════════════════════

describe('invitaciones', () => {
  async function conAdmin(nit: string, correo: string, i: number) {
    const { organizacion, admin } = await afiliacion.crear({
      tipo: 'ips',
      nit,
      razonSocial: SEDES_CATALOGO[i].nombre,
      sedes: [SEDES_CATALOGO[i].codigo],
      admin: { nombre: 'Ana', correo, clave: CLAVE },
    });
    return {
      organizacion,
      sesionAdmin: sesion(['admin_organizacion'], organizacion.id, admin.id),
    };
  }

  it('crear una invitacion exige rol y responde 201 con el enlace', async () => {
    const { organizacion, sesionAdmin } = await conAdmin(
      '901001111-1',
      'ana301@ips.co',
      9,
    );

    actorActual = sesion(['paramedico'], organizacion.id);
    await servidor()
      .post(`/organizaciones/${organizacion.id}/invitaciones`)
      .send({ correo: 'jefe@ips.co', rol: 'jefe_urgencias' })
      .expect(403);

    actorActual = sesionAdmin;
    const cuerpo = await pedir<CrearInvitacionResponse>(
      servidor()
        .post(`/organizaciones/${organizacion.id}/invitaciones`)
        .send({ correo: 'jefe@ips.co', rol: 'jefe_urgencias' }),
      201,
    );
    expect(cuerpo.enlace).toContain('/invitacion/');
    expect(cuerpo.enviadoPorCorreo).toBe(false);
  });

  it('aceptar es publico, y el segundo intento es 410', async () => {
    const { organizacion, sesionAdmin } = await conAdmin(
      '901002222-1',
      'ana302@ips.co',
      10,
    );
    actorActual = sesionAdmin;
    const creada = await pedir<CrearInvitacionResponse>(
      servidor()
        .post(`/organizaciones/${organizacion.id}/invitaciones`)
        .send({ correo: 'jefe302@ips.co', rol: 'jefe_urgencias' }),
      201,
    );
    const token = creada.enlace.split('/').pop();

    // Sin sesion: quien acepta todavia no tiene cuenta.
    actorActual = null;
    const aceptada = await pedir<AceptarInvitacionResponse>(
      servidor()
        .post(`/invitaciones/${token}/aceptar`)
        .send({ nombre: 'Carlos Jefe', clave: CLAVE }),
      201,
    );
    expect(aceptada.actor.roles).toEqual(['jefe_urgencias']);

    const segunda = await pedir<Sobre>(
      servidor()
        .post(`/invitaciones/${token}/aceptar`)
        .send({ nombre: 'Otro', clave: CLAVE }),
      410,
    );
    expect(segunda.error.code).toBe('PULSO_INVITACION_YA_USADA');
  });

  it('un token inventado es 404, no 410', async () => {
    const cuerpo = await pedir<Sobre>(
      servidor()
        .post('/invitaciones/token-que-no-existe/aceptar')
        .send({ nombre: 'X', clave: CLAVE }),
      404,
    );
    expect(cuerpo.error.code).toBe('PULSO_INVALID_INPUT');
  });

  it('GET /organizaciones/:id/equipo exige rol', async () => {
    const { organizacion, sesionAdmin } = await conAdmin(
      '901003333-1',
      'ana303@ips.co',
      11,
    );
    actorActual = sesion(['jefe_urgencias'], organizacion.id);
    await servidor()
      .get(`/organizaciones/${organizacion.id}/equipo`)
      .expect(403);

    actorActual = sesionAdmin;
    const cuerpo = await pedir<EquipoResponse>(
      servidor().get(`/organizaciones/${organizacion.id}/equipo`),
      200,
    );
    expect(cuerpo.actores).toHaveLength(1);
  });
});

function sesion(
  roles: ActorSesion['roles'],
  organizacionId: string,
  id = 'actor-de-prueba',
): ActorSesion {
  return {
    id,
    organizacionId,
    roles,
    sedes: [],
    tipo: 'humano',
    sesionId: 'sid',
    legado: false,
  };
}
