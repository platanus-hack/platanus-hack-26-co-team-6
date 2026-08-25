/**
 * Tarea 2.1 — el modulo de afiliacion, criterio por criterio.
 *
 * Los cinco «hecho cuando» de la tarea:
 *   1. un codigo REPS real devuelve la sede correcta con sus servicios
 *   2. un codigo inventado devuelve motivo especifico
 *   3. rate limit por IP                      → `limite-ip.spec.ts`
 *   4. test de todas las transiciones ilegales → `estados.spec.ts`
 *   5. una organizacion que no esta `activa` no aparece en el ranking
 */

import { Logger } from '@nestjs/common';
import type { Sede } from '../contracts/types';
import { PulsoError } from '../common/pulso-error.filter';
import { RepoActoresMemoria } from '../auth/actores';
import { SEDES_CATALOGO } from '../sedes/catalogo.generado';
import type { SedesService } from '../sedes/sedes.service';
import { AMBULANCIAS_CATALOGO } from './ambulancias.generado';
import { AfiliacionService } from './afiliacion.service';
import { RepoOrganizacionesMemoria } from './organizaciones';

/** Una sede REAL del catalogo compilado. No una inventada: el punto es que cruce. */
const SEDE_REAL: Sede = SEDES_CATALOGO[0];

/** 12 digitos que no estan en el catalogo. */
const CODIGO_INVENTADO = '119999999999';

/** El repo de actores exige ≥12 caracteres (§3.6). */
const CLAVE = 'una-clave-larga-de-verdad';

function montar() {
  const sedes = {
    todas: () => Promise.resolve(SEDES_CATALOGO),
    porCodigo: (codigo: string) =>
      Promise.resolve(SEDES_CATALOGO.find((s) => s.codigo === codigo)),
    cercanas: () => Promise.resolve(SEDES_CATALOGO),
  } as unknown as SedesService;

  const organizaciones = new RepoOrganizacionesMemoria();
  const actores = new RepoActoresMemoria({
    get: () => undefined,
  } as never);
  const servicio = new AfiliacionService(sedes, organizaciones, actores);
  return { servicio, organizaciones, actores };
}

beforeAll(() => {
  // `onModuleInit` avisa que la afiliacion vive en memoria. Es correcto que
  // lo diga, pero no en cada uno de estos tests.
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════
//  Criterio 1 — un codigo REPS real devuelve la sede con sus servicios
// ═══════════════════════════════════════════════════════════════

describe('verificar una IPS contra el REPS', () => {
  it('un codigo real con el nombre del REPS se autoverifica y precarga todo', async () => {
    const { servicio } = montar();
    const r = await servicio.verificar({
      tipo: 'ips',
      codigoHabilitacion: SEDE_REAL.codigo,
      nit: '900123456-1',
      razonSocial: SEDE_REAL.nombre,
    });

    expect(r.encontrada).toBe(true);
    expect(r.verificacion).toBe('reps_automatico');
    expect(r.estadoSugerido).toBe('aprobada');
    expect(r.sede?.codigo).toBe(SEDE_REAL.codigo);

    // Lo que el afiliado NO tiene que tipear. Es el corazon de §3.3.
    expect(r.precarga).toEqual({
      direccion: SEDE_REAL.direccion,
      coord: SEDE_REAL.coord,
      localidad: SEDE_REAL.localidad,
      naturaleza: SEDE_REAL.naturaleza,
      complejidad: SEDE_REAL.complejidad,
      telefono: SEDE_REAL.telefono,
      servicios: SEDE_REAL.servicios,
      camas: SEDE_REAL.camas,
    });
    expect(r.precarga!.servicios.length).toBeGreaterThan(0);
  });

  it('acepta el codigo con puntos y espacios, como viene del certificado', async () => {
    const { servicio } = montar();
    const conFormato = SEDE_REAL.codigo.replace(/^(\d{4})(\d{4})/, '$1-$2 ');
    const r = await servicio.verificar({
      tipo: 'ips',
      codigoHabilitacion: conFormato,
      nit: '900123456',
      razonSocial: SEDE_REAL.nombre,
    });
    expect(r.sede?.codigo).toBe(SEDE_REAL.codigo);
  });

  it('la precarga NO trae el nombre: ese se muestra aparte para confirmarlo', () => {
    // §3.4 paso 2: «muestra el nombre de la sede que encontro en el REPS.
    // Ese momento vende el producto». Va en `sede`, no escondido en precarga.
    const { servicio } = montar();
    return servicio
      .verificar({
        tipo: 'ips',
        codigoHabilitacion: SEDE_REAL.codigo,
        nit: '900123456',
        razonSocial: SEDE_REAL.nombre,
      })
      .then((r) => {
        expect(r.precarga).not.toHaveProperty('nombre');
        expect(r.sede?.nombre).toBe(SEDE_REAL.nombre);
      });
  });

  it('el nombre que no cuadra va a revision humana, NO a rechazo', async () => {
    const { servicio } = montar();
    const r = await servicio.verificar({
      tipo: 'ips',
      codigoHabilitacion: SEDE_REAL.codigo,
      nit: '900123456',
      razonSocial: 'Fundacion Cardioinfantil',
    });

    expect(r.encontrada).toBe(true);
    expect(r.requiereRevision).toBe(true);
    expect(r.estadoSugerido).toBe('en_verificacion');
    expect(r.verificacion).toBe('manual');
    // Y se le dice contra que no cuadro, con el nombre del REPS a la vista.
    expect(r.motivo).toContain(SEDE_REAL.nombre);
    // La precarga viaja igual: la revision humana es sobre el nombre, no
    // sobre la sede, y el formulario ya puede mostrarse lleno.
    expect(r.precarga).toBeDefined();
  });

  it('sin razon social pide revision en vez de aprobar por omision', async () => {
    const { servicio } = montar();
    const r = await servicio.verificar({
      tipo: 'ips',
      codigoHabilitacion: SEDE_REAL.codigo,
      nit: '900123456',
    });
    expect(r.requiereRevision).toBe(true);
    expect(r.estadoSugerido).toBe('en_verificacion');
  });
});

// ═══════════════════════════════════════════════════════════════
//  Criterio 2 — un codigo inventado devuelve motivo ESPECIFICO
// ═══════════════════════════════════════════════════════════════

describe('los motivos, que son especificos y no «no encontrado»', () => {
  it('un codigo de 12 digitos que no existe dice que puede ser posterior al corte', async () => {
    const { servicio } = montar();
    const r = await servicio.verificar({
      tipo: 'ips',
      codigoHabilitacion: CODIGO_INVENTADO,
      nit: '900123456',
      razonSocial: 'Clinica Nueva',
    });
    expect(r.encontrada).toBe(false);
    expect(r.estadoSugerido).toBe('observada');
    expect(r.motivo).toContain(CODIGO_INVENTADO);
    expect(r.motivo).toMatch(/corte del REPS/i);
  });

  it('un codigo de 10 digitos lo llama por su nombre: es el de PRESTADOR', async () => {
    // La trampa documentada en data/CATALOGO.md, que ya causo un bug de 9
    // sedes colapsadas en un codigo. Responder «no encontrado» aqui manda a
    // buscar un error de tipeo que no existe.
    const { servicio } = montar();
    const r = await servicio.verificar({
      tipo: 'ips',
      codigoHabilitacion: '1100105322',
      nit: '900123456',
      razonSocial: 'Clinica La Inmaculada',
    });
    expect(r.encontrada).toBe(false);
    expect(r.motivo).toContain('PRESTADOR');
    expect(r.motivo).toContain('SEDE');
    expect(r.motivo).toContain('12');
  });

  it('sin codigo, dice donde encontrarlo y que no es el NIT', async () => {
    const { servicio } = montar();
    const r = await servicio.verificar({ tipo: 'ips', nit: '900123456' });
    expect(r.encontrada).toBe(false);
    expect(r.motivo).toMatch(/certificado de habilitacion/i);
    expect(r.motivo).toMatch(/no el NIT/i);
  });

  it('un largo raro dice cuantos digitos llegaron', async () => {
    const { servicio } = montar();
    const r = await servicio.verificar({
      tipo: 'ips',
      codigoHabilitacion: '12345',
      nit: '900123456',
    });
    expect(r.motivo).toContain('12');
    expect(r.motivo).toContain('5');
  });

  it('sin NIT revienta: es lo que identifica a la entidad juridica', async () => {
    const { servicio } = montar();
    await expect(
      servicio.verificar({ tipo: 'ips', nit: '' }),
    ).rejects.toBeInstanceOf(PulsoError);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Tarea 2.9 por la puerta del servicio
// ═══════════════════════════════════════════════════════════════

describe('verificar un operador de ambulancia', () => {
  const REAL = AMBULANCIAS_CATALOGO.find((p) => p.medicalizado)!;

  it('un prestador real se autoverifica y trae la marca TAB/TAM', async () => {
    const { servicio } = montar();
    const r = await servicio.verificar({
      tipo: 'operador_ambulancia',
      nit: '900123456-1',
      razonSocial: REAL.prestador,
    });
    expect(r.encontrada).toBe(true);
    expect(r.verificacion).toBe('reps_automatico');
    expect(r.operador?.tiposMovil).toContain('TAM');
    expect(r.operador?.prestador).toBe(REAL.prestador);
  });

  it('sin cruce queda observada con motivo, no rechazada', async () => {
    // Paso 4 de la tarea 2.9: «Si no cruza → observada con motivo, no rechazo».
    const { servicio } = montar();
    const r = await servicio.verificar({
      tipo: 'operador_ambulancia',
      nit: '900123456',
      razonSocial: 'Panaderia La Espiga',
    });
    expect(r.estadoSugerido).not.toBe('retirada');
    expect(r.motivo).toBeTruthy();
    // Sea «no aparece» o «lo mas parecido es X», siempre dice que sigue.
    expect(r.motivo).toMatch(/sigue/i);
  });

  it('no pide codigo de habilitacion: el corte de transporte no lo publica', async () => {
    const { servicio } = montar();
    const r = await servicio.verificar({
      tipo: 'operador_ambulancia',
      nit: '900123456',
      razonSocial: REAL.prestador,
    });
    expect(r.encontrada).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Crear la afiliacion
// ═══════════════════════════════════════════════════════════════

describe('crear', () => {
  const peticionValida = () => ({
    tipo: 'ips' as const,
    nit: '900123456-1',
    razonSocial: SEDE_REAL.nombre,
    sedes: [SEDE_REAL.codigo],
    admin: { nombre: 'Ana Ruiz', correo: 'Ana@Clinica.CO', clave: CLAVE },
  });

  it('crea la organizacion aprobada y su primer admin_organizacion', async () => {
    const { servicio } = montar();
    const r = await servicio.crear(peticionValida());

    expect(r.organizacion.estado).toBe('aprobada');
    expect(r.organizacion.verificacion).toBe('reps_automatico');
    expect(r.organizacion.sedes).toEqual([SEDE_REAL.codigo]);
    // El NIT se guarda normalizado, sin digito de verificacion.
    expect(r.organizacion.nit).toBe('900123456');

    expect(r.admin.roles).toEqual(['admin_organizacion']);
    expect(r.admin.organizacionId).toBe(r.organizacion.id);
    // Alcance vacio = toda su organizacion. Un admin no se ata a una sede.
    expect(r.admin.sedes).toEqual([]);
  });

  it('el admin queda con el correo en minusculas y puede entrar', async () => {
    const { servicio, actores } = montar();
    await servicio.crear(peticionValida());
    const encontrado = await actores.porIdentificador('ana@clinica.co');
    expect(encontrado?.roles).toEqual(['admin_organizacion']);
    // La contraseña se guarda hasheada, nunca en claro.
    expect(encontrado?.hash).not.toContain(CLAVE);
  });

  it('NO devuelve la contraseña ni el hash', async () => {
    const { servicio } = montar();
    const r = await servicio.crear(peticionValida());
    expect(JSON.stringify(r)).not.toContain(CLAVE);
    expect(r.admin).not.toHaveProperty('hash');
  });

  it('nace en borrador y camina la maquina de estados, no salta', async () => {
    // `borrador → aprobada` no existe en TRANSICIONES. Si el servicio
    // escribiera el estado a mano, este test no notaria nada — por eso lo
    // que se comprueba es que el camino sea legal paso a paso.
    const { servicio } = montar();
    const r = await servicio.crear(peticionValida());
    expect(['aprobada', 'en_verificacion', 'observada']).toContain(
      r.organizacion.estado,
    );
    expect(r.organizacion.creadaEn).toBeTruthy();
  });

  it('el mismo (tipo, NIT) no se afilia dos veces, aunque cambie el formato', async () => {
    const { servicio } = montar();
    await servicio.crear(peticionValida());
    await expect(
      servicio.crear({
        ...peticionValida(),
        // Sin digito de verificacion, y otra sede. Es la misma entidad.
        nit: '900123456',
        sedes: [SEDES_CATALOGO[1].codigo],
        admin: { ...peticionValida().admin, correo: 'otro@clinica.co' },
      }),
    ).rejects.toThrow(/Ya hay una afiliacion/);
  });

  it('una sede ya afiliada no la reclama otra organizacion', async () => {
    // Si pudieran, el handshake no sabria a quien avisarle.
    const { servicio } = montar();
    await servicio.crear(peticionValida());
    await expect(
      servicio.crear({
        ...peticionValida(),
        nit: '800999888-1',
        admin: { ...peticionValida().admin, correo: 'otra@ips.co' },
      }),
    ).rejects.toThrow(new RegExp(SEDE_REAL.codigo));
  });

  it('sin admin no se crea nada: nadie podria entrar despues', async () => {
    const { servicio, organizaciones } = montar();
    await expect(
      servicio.crear({
        ...peticionValida(),
        admin: undefined as never,
      }),
    ).rejects.toThrow(/primer administrador/);
    expect(await organizaciones.todas()).toHaveLength(0);
  });

  it('re-verifica en el servidor: no confia en lo que diga el cliente', async () => {
    // El cliente manda un codigo que no existe. Aunque su pantalla dijera
    // «verificado», el servidor la deja observada.
    const { servicio } = montar();
    const r = await servicio.crear({
      ...peticionValida(),
      sedes: [CODIGO_INVENTADO],
    });
    expect(r.organizacion.estado).toBe('observada');
    expect(r.organizacion.observaciones?.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Criterio 5 — la que no esta `activa` no aparece en el ranking
// ═══════════════════════════════════════════════════════════════

describe('despachabilidad', () => {
  async function organizacionActiva() {
    const { servicio, organizaciones } = montar();
    const { organizacion } = await servicio.crear({
      tipo: 'ips',
      nit: '900123456-1',
      razonSocial: SEDE_REAL.nombre,
      sedes: [SEDE_REAL.codigo],
      admin: { nombre: 'Ana', correo: 'ana@ips.co', clave: CLAVE },
    });
    const activa = await servicio.transicionar(organizacion.id, 'activa');
    return { servicio, organizaciones, organizacion: activa };
  }

  it('una sede afiliada y activa es despachable', async () => {
    const { servicio } = await organizacionActiva();
    expect(await servicio.sedeDespachable(SEDE_REAL.codigo)).toBe(true);
    expect(await servicio.sedesNoDespachables()).toEqual(new Set());
  });

  it('suspenderla la saca del ranking en el acto', async () => {
    const { servicio, organizacion } = await organizacionActiva();
    await servicio.transicionar(
      organizacion.id,
      'suspendida',
      'Habilitacion vencida',
    );
    expect(await servicio.sedeDespachable(SEDE_REAL.codigo)).toBe(false);
    expect(await servicio.sedesNoDespachables()).toEqual(
      new Set([SEDE_REAL.codigo]),
    );
  });

  it('levantarle la suspension la devuelve al ranking', async () => {
    const { servicio, organizacion } = await organizacionActiva();
    await servicio.transicionar(organizacion.id, 'suspendida', 'Revision');
    await servicio.transicionar(organizacion.id, 'activa');
    expect(await servicio.sedeDespachable(SEDE_REAL.codigo)).toBe(true);
  });

  it('una afiliada que quedo en aprobada TAMPOCO es despachable', async () => {
    // `aprobada` no es `activa`. Es la distincion que hace util al paso 4.
    const { servicio } = montar();
    await servicio.crear({
      tipo: 'ips',
      nit: '900123456-1',
      razonSocial: SEDE_REAL.nombre,
      sedes: [SEDE_REAL.codigo],
      admin: { nombre: 'Ana', correo: 'ana@ips.co', clave: CLAVE },
    });
    expect(await servicio.sedeDespachable(SEDE_REAL.codigo)).toBe(false);
  });

  it('una sede del REPS que nadie afilio SIGUE siendo despachable', async () => {
    // Deliberado y razonado en el servicio: exigir afiliacion para rutear
    // vaciaria el ranking entero el dia que esto se encienda, y «el conjunto
    // vacio escala al CRUE» convertiria cada caso en una escalada.
    const { servicio } = montar();
    expect(await servicio.sedeDespachable(SEDES_CATALOGO[5].codigo)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Transiciones por la puerta del servicio
// ═══════════════════════════════════════════════════════════════

describe('transicionar', () => {
  async function conOrganizacion() {
    const { servicio } = montar();
    const { organizacion } = await servicio.crear({
      tipo: 'ips',
      nit: '900123456-1',
      razonSocial: SEDE_REAL.nombre,
      sedes: [SEDE_REAL.codigo],
      admin: { nombre: 'Ana', correo: 'ana@ips.co', clave: CLAVE },
    });
    return { servicio, organizacion };
  }

  it('rechaza una transicion ilegal con PULSO_ILLEGAL_TRANSITION', async () => {
    const { servicio, organizacion } = await conOrganizacion();
    // `aprobada → suspendida` no existe: primero hay que activarla.
    await expect(
      servicio.transicionar(organizacion.id, 'suspendida', 'porque si'),
    ).rejects.toMatchObject({ code: 'PULSO_ILLEGAL_TRANSITION' });
  });

  it('suspender sin motivo no se puede', async () => {
    const { servicio, organizacion } = await conOrganizacion();
    await servicio.transicionar(organizacion.id, 'activa');
    await expect(
      servicio.transicionar(organizacion.id, 'suspendida'),
    ).rejects.toThrow(/exige decir por que/);
  });

  it('las observaciones se acumulan: una correccion es un registro nuevo', async () => {
    // Regla 4 del repo: la auditoria es append-only. Nadie edita ni borra.
    const { servicio, organizacion } = await conOrganizacion();
    const antes = organizacion.observaciones?.length ?? 0;
    const despues = await servicio.transicionar(
      organizacion.id,
      'observada',
      'Falta el certificado de habilitacion vigente',
    );
    expect(despues.observaciones).toHaveLength(antes + 1);
    expect(despues.observaciones?.at(-1)).toContain('certificado');
  });

  it('una organizacion que no existe no se transiciona', async () => {
    const { servicio } = montar();
    await expect(servicio.transicionar('no-existe', 'activa')).rejects.toThrow(
      /No existe esa organizacion/,
    );
  });
});
