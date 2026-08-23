/**
 * API de afiliación — tarea 2.1.
 *
 * Corre SIN Supabase y sin Postgres: `SupabaseService` sin credenciales
 * devuelve `null` y `SedesService` cae al catálogo compilado. Es el modo en
 * que corre el repo hoy, y es a propósito que los tests lo ejerciten — si solo
 * pasaran con base de datos, no probarían el camino que usa el equipo.
 *
 * Los códigos y nombres de sede son REALES: salen de `sedes/catalogo.generado.ts`.
 */

import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PulsoError } from '../common/pulso-error.filter';
import { SedesService } from '../sedes/sedes.service';
import { SupabaseService } from '../sedes/supabase.service';
import { AfiliacionService } from './afiliacion.service';
import { esDespachable } from './estados';

/** Fundación Santa Fe de Bogotá — 12 dígitos, 11 servicios, 6 tipos de cama. */
const CODIGO_REAL = '110010561801';
const NOMBRE_REAL = 'Fundación Santa Fe de Bogotá';
/** NIT válido (el dígito de verificación cuadra). */
const NIT = '9001234568';

describe('AfiliacionService', () => {
  let afiliacion: AfiliacionService;

  beforeEach(async () => {
    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        AfiliacionService,
        SedesService,
        SupabaseService,
        // Sin variables: SupabaseService queda en null y todo cae al
        // catálogo compilado. Ese es el punto.
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    modulo.get(SupabaseService).onModuleInit();
    afiliacion = modulo.get(AfiliacionService);
  });

  // ═══════════════════════════════════════════════════════════════
  //  Verificación contra el REPS
  // ═══════════════════════════════════════════════════════════════

  describe('un código REPS real devuelve la sede con sus servicios', () => {
    it('precarga todo lo que el afiliado no tiene que tipear', async () => {
      const resultado = await afiliacion.verificar({
        tipo: 'ips',
        codigoHabilitacion: CODIGO_REAL,
        nit: NIT,
        razonSocial: NOMBRE_REAL,
      });

      expect(resultado.encontrada).toBe(true);
      expect(resultado.requiereRevision).toBe(false);
      expect(resultado.coincidencia).toBe(1);

      const precarga = resultado.precargaSede;
      expect(precarga?.codigo).toBe(CODIGO_REAL);
      expect(precarga?.nombre).toBe(NOMBRE_REAL);
      expect(precarga?.localidad).toBe('Usaquén');
      expect(precarga?.naturaleza).toBe('Privada');
      expect(precarga?.complejidad).toBe('alta');
      expect(precarga?.direccion).toBeTruthy();
      expect(precarga?.coord.lat).toBeGreaterThan(4);
      expect(precarga?.coord.lng).toBeLessThan(-73);
      // 1102 es urgencias en el CodeSystem REPS: sin él la sede no es destino.
      expect(precarga?.servicios).toContain(1102);
      expect(precarga?.servicios.length).toBeGreaterThan(5);
      expect(precarga?.camas.length).toBeGreaterThan(0);
      expect(precarga?.camas[0]).toHaveProperty('ocupadasSnapshot');
    });

    it('dice de qué catálogo salió la respuesta', async () => {
      // Regla 2 de AGENTS.md: degrada, y lo dice. "No encontrada" contra 84
      // sedes no significa lo mismo que contra 16.181.
      const resultado = await afiliacion.verificar({
        tipo: 'ips',
        codigoHabilitacion: CODIGO_REAL,
        nit: NIT,
        razonSocial: NOMBRE_REAL,
      });
      expect(resultado.fuente).toBe('catalogo_compilado');
    });

    it('el nombre escrito con otra ortografía sigue cruzando', async () => {
      const resultado = await afiliacion.verificar({
        tipo: 'ips',
        codigoHabilitacion: CODIGO_REAL,
        nit: NIT,
        razonSocial: 'FUNDACION SANTA FE DE BOGOTA',
      });
      expect(resultado.requiereRevision).toBe(false);
    });
  });

  describe('un código que no cruza devuelve un motivo específico', () => {
    it('inventado pero bien formado: dice contra qué universo se buscó', async () => {
      const resultado = await afiliacion.verificar({
        tipo: 'ips',
        codigoHabilitacion: '999999999999',
        nit: NIT,
        razonSocial: 'Clínica Inventada',
      });

      expect(resultado.encontrada).toBe(false);
      expect(resultado.motivo).toBe('sede_fuera_del_catalogo_cargado');
      expect(resultado.mensaje).toContain('999999999999');
      expect(resultado.mensaje).toContain('84');
      expect(resultado.falta.length).toBeGreaterThan(0);
    });

    it('LA TRAMPA: 10 dígitos es el código de prestador, y se dice así', async () => {
      // `codigoprestador` colapsa una subred entera en un código. Aceptarlo
      // "por si acaso" ya metió nueve sedes distintas bajo el mismo id una vez.
      const resultado = await afiliacion.verificar({
        tipo: 'ips',
        codigoHabilitacion: '1100105618',
        nit: NIT,
        razonSocial: NOMBRE_REAL,
      });

      expect(resultado.motivo).toBe('codigo_es_de_prestador_no_de_sede');
      expect(resultado.mensaje).toContain('PRESTADOR');
      expect(resultado.mensaje).toContain('12 dígitos');
    });

    it('cada forma inválida tiene su propio motivo, ninguno genérico', async () => {
      const casos: [string, string][] = [
        ['', 'codigo_habilitacion_faltante'],
        ['11001AB18011', 'codigo_habilitacion_no_numerico'],
        ['1100105618010', 'codigo_habilitacion_longitud_invalida'],
      ];

      for (const [codigo, motivo] of casos) {
        const resultado = await afiliacion.verificar({
          tipo: 'ips',
          codigoHabilitacion: codigo,
          nit: NIT,
          razonSocial: NOMBRE_REAL,
        });
        expect(resultado.motivo).toBe(motivo);
      }
    });

    it('el nombre que no coincide no rechaza: manda a revisión y sugiere', async () => {
      const resultado = await afiliacion.verificar({
        tipo: 'ips',
        codigoHabilitacion: CODIGO_REAL,
        nit: NIT,
        razonSocial: 'Droguería La Rebaja',
      });

      expect(resultado.encontrada).toBe(true);
      expect(resultado.requiereRevision).toBe(true);
      expect(resultado.motivo).toBe('nombre_no_coincide_con_reps');
      expect(resultado.sugerencia).toBe(NOMBRE_REAL);
      expect(resultado.coincidencia).toBeLessThan(0.85);
    });

    it('sin razón social muestra la sede pero no la da por verificada', async () => {
      const resultado = await afiliacion.verificar({
        tipo: 'ips',
        codigoHabilitacion: CODIGO_REAL,
        nit: NIT,
      });

      expect(resultado.encontrada).toBe(true);
      expect(resultado.requiereRevision).toBe(true);
      expect(resultado.motivo).toBe('sin_razon_social_para_contrastar');
      expect(resultado.precargaSede?.nombre).toBe(NOMBRE_REAL);
    });
  });

  describe('el NIT', () => {
    it('falta → motivo propio, no "no encontrada" a secas', async () => {
      const resultado = await afiliacion.verificar({
        tipo: 'ips',
        codigoHabilitacion: CODIGO_REAL,
        nit: '',
      });
      expect(resultado.motivo).toBe('nit_faltante');
    });

    it('un dígito de verificación malo no bloquea, pero impide aprobar solo', async () => {
      const resultado = await afiliacion.verificar({
        tipo: 'ips',
        codigoHabilitacion: CODIGO_REAL,
        nit: '9001234567', // el DV correcto es 8
        razonSocial: NOMBRE_REAL,
      });

      // Sigue dando la precarga: es lo que hace útil la pantalla.
      expect(resultado.precargaSede?.codigo).toBe(CODIGO_REAL);
      // Pero ya no puede autoaprobarse.
      expect(resultado.requiereRevision).toBe(true);
      expect(resultado.falta.join(' ')).toContain('dígito de verificación');
    });
  });

  describe('tipos sin registro público', () => {
    it('un CRUE lo dice, en vez de fingir que buscó', async () => {
      const resultado = await afiliacion.verificar({ tipo: 'crue', nit: NIT });
      expect(resultado.motivo).toBe('tipo_sin_fuente_automatica');
      expect(resultado.requiereRevision).toBe(true);
    });

    it('un tipo inexistente es entrada inválida, no "no encontrada"', async () => {
      await expect(
        afiliacion.verificar({ tipo: 'panadería' as never, nit: NIT }),
      ).rejects.toMatchObject({ code: 'PULSO_INVALID_INPUT' });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  Alta
  // ═══════════════════════════════════════════════════════════════

  describe('POST /afiliacion crea organización, sede y admin', () => {
    const alta = {
      tipo: 'ips' as const,
      nit: NIT,
      razonSocial: NOMBRE_REAL,
      sedes: [CODIGO_REAL],
      admin: {
        nombre: 'Jefe de Urgencias',
        correo: 'jefe@ejemplo.co',
        password: 'una-contrasena-larga',
        telefono: '+573001112233',
      },
    };

    it('la organización queda vinculada a su sede y verificada por REPS', async () => {
      const salida = await afiliacion.crear(alta);

      expect(salida.organizacion.sedes).toEqual([
        expect.objectContaining({
          codigoSede: CODIGO_REAL,
          verificada: true,
          activa: true,
        }),
      ]);
      expect(salida.organizacion.verificacion).toBe('reps_automatico');
      expect(salida.actor.roles).toEqual(['admin_organizacion']);
      expect(salida.yaExistia).toBe(false);
    });

    it('el actor sale SIN correo, teléfono ni hash de contraseña', async () => {
      const salida = await afiliacion.crear(alta);

      // Lista blanca campo por campo: la PII de contacto no cruza el servidor.
      expect(Object.keys(salida.actor).sort()).toEqual([
        'activo',
        'creadoEn',
        'id',
        'nombre',
        'organizacionId',
        'roles',
        'sedes',
        'tipo',
      ]);
      expect(JSON.stringify(salida)).not.toContain('jefe@ejemplo.co');
      expect(JSON.stringify(salida)).not.toContain('una-contrasena-larga');
      expect(JSON.stringify(salida)).not.toContain('+573001112233');
    });

    it('el cruce limpio llega hasta aprobada y SE DETIENE ahí', async () => {
      // Activar es un acto humano: `activa` es el permiso para recibir un
      // paciente crítico (regla 6 de AGENTS.md).
      const salida = await afiliacion.crear(alta);
      expect(salida.organizacion.estado).toBe('aprobada');
      expect(esDespachable(salida.organizacion)).toBe(false);
    });

    it('sin cruce queda observada CON motivo, nunca rechazada', async () => {
      const salida = await afiliacion.crear({
        ...alta,
        nit: '8300086861',
        razonSocial: 'Clínica Que No Existe',
        sedes: ['999999999999'],
      });

      expect(salida.organizacion.estado).toBe('observada');
      const estado = afiliacion.estado(salida.organizacion.id);
      expect(estado.observaciones.length).toBeGreaterThan(0);
      expect(estado.observaciones.join(' ')).toContain('999999999999');
      expect(estado.observaciones.join(' ')).toContain('Falta');
    });

    it('el nombre que no cuadra se queda en verificación esperando humano', async () => {
      const salida = await afiliacion.crear({
        ...alta,
        nit: '8600073361',
        razonSocial: 'Otra Razón Social S.A.S.',
      });
      expect(salida.organizacion.estado).toBe('en_verificacion');
      expect(salida.organizacion.verificacion).toBe('pendiente');
    });

    it('repetir el POST con el mismo tipo+NIT no duplica nada', async () => {
      const primera = await afiliacion.crear(alta);
      const segunda = await afiliacion.crear(alta);

      expect(segunda.yaExistia).toBe(true);
      expect(segunda.organizacion.id).toBe(primera.organizacion.id);
      expect(afiliacion.listar()).toHaveLength(1);
    });

    it('faltar un campo obligatorio es PULSO_INVALID_INPUT con el nombre del campo', async () => {
      await expect(
        afiliacion.crear({ ...alta, admin: { nombre: '', correo: '' } }),
      ).rejects.toMatchObject({ code: 'PULSO_INVALID_INPUT' });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  Operadores de ambulancia — tarea 2.9, por el mismo endpoint
  // ═══════════════════════════════════════════════════════════════

  describe('un operador de ambulancias se afilia por la misma puerta', () => {
    it('cruza contra el registro de transporte y llega con su marca TAB/TAM', async () => {
      const salida = await afiliacion.crear({
        tipo: 'operador_ambulancia',
        nit: NIT,
        razonSocial: 'Ambulancias Primeros Auxilios Ltda.',
        admin: { nombre: 'Coordinador', correo: 'coord@ejemplo.co' },
      });

      // La marca es la que después alimenta `movil.tipo` en el alta de flota.
      expect(salida.verificacion.precargaOperador?.tipos).toEqual([
        'TAB',
        'TAM',
      ]);
      expect(salida.organizacion.estado).toBe('aprobada');
      expect(salida.organizacion.verificacion).toBe('reps_automatico');
      expect(salida.organizacion.sedes).toEqual([]);
    });

    it('sin cruce queda observada y la observación dice qué mandar', async () => {
      const salida = await afiliacion.crear({
        tipo: 'operador_ambulancia',
        nit: NIT,
        razonSocial: 'Ambulancias Que No Existen 2099',
        admin: { nombre: 'Coordinador', correo: 'coord@ejemplo.co' },
      });

      expect(salida.organizacion.estado).toBe('observada');
      const observaciones = afiliacion
        .estado(salida.organizacion.id)
        .observaciones.join(' ');
      expect(observaciones).toContain('225');
      expect(observaciones).toContain('código de habilitación');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  Estado, despachabilidad y auditoría
  // ═══════════════════════════════════════════════════════════════

  describe('solo una organización activa es despachable', () => {
    async function organizacionAprobada() {
      const salida = await afiliacion.crear({
        tipo: 'ips',
        nit: NIT,
        razonSocial: NOMBRE_REAL,
        sedes: [CODIGO_REAL],
        admin: { nombre: 'Admin', correo: 'admin@ejemplo.co' },
      });
      return salida.organizacion.id;
    }

    it('aprobada todavía no lo es; activa sí', async () => {
      const id = await organizacionAprobada();

      expect(afiliacion.estado(id).despachable).toBe(false);
      expect(afiliacion.despachables()).toHaveLength(0);

      afiliacion.transicionar(id, 'activa', 'operador');

      expect(afiliacion.estado(id).despachable).toBe(true);
      expect(afiliacion.despachables().map((o) => o.id)).toEqual([id]);
    });

    it('suspenderla la saca del conjunto despachable', async () => {
      const id = await organizacionAprobada();
      afiliacion.transicionar(id, 'activa', 'operador');
      afiliacion.transicionar(
        id,
        'suspendida',
        'operador',
        'habilitación vencida',
      );

      expect(afiliacion.estado(id).despachable).toBe(false);
      expect(afiliacion.despachables()).toHaveLength(0);
    });

    it('un salto ilegal lanza PULSO_ILLEGAL_TRANSITION y no mueve nada', async () => {
      const id = await organizacionAprobada();

      let capturado: unknown;
      try {
        afiliacion.transicionar(id, 'borrador', 'operador');
      } catch (error) {
        capturado = error;
      }

      expect(capturado).toBeInstanceOf(PulsoError);
      expect((capturado as PulsoError).code).toBe('PULSO_ILLEGAL_TRANSITION');
      expect(afiliacion.obtener(id).estado).toBe('aprobada');
    });

    it('la respuesta de estado dice a dónde puede ir', async () => {
      const id = await organizacionAprobada();
      expect(afiliacion.estado(id).transicionesPosibles).toEqual([
        'activa',
        'retirada',
      ]);
    });
  });

  describe('la auditoría es append-only', () => {
    it('cada transición deja su renglón y ninguno se pisa', async () => {
      const salida = await afiliacion.crear({
        tipo: 'ips',
        nit: NIT,
        razonSocial: NOMBRE_REAL,
        sedes: [CODIGO_REAL],
        admin: { nombre: 'Admin', correo: 'admin@ejemplo.co' },
      });
      const id = salida.organizacion.id;
      const antes = afiliacion.eventos(id);

      afiliacion.transicionar(
        id,
        'activa',
        'operador',
        'confirmado por el jefe',
      );

      const despues = afiliacion.eventos(id);
      expect(despues.length).toBe(antes.length + 1);
      // Los que ya estaban no cambiaron: corregir es escribir otro evento.
      expect(despues.slice(0, antes.length)).toEqual(antes);

      const ultimo = despues[despues.length - 1];
      expect(ultimo).toMatchObject({
        tipo: 'transicion',
        de: 'aprobada',
        a: 'activa',
        por: 'operador',
        mensaje: 'confirmado por el jefe',
      });
    });

    it('la auditoría no lleva PII: ni correo ni teléfono', async () => {
      const salida = await afiliacion.crear({
        tipo: 'ips',
        nit: NIT,
        razonSocial: NOMBRE_REAL,
        sedes: [CODIGO_REAL],
        admin: {
          nombre: 'Admin',
          correo: 'secreto@ejemplo.co',
          telefono: '+573009998877',
        },
      });

      const texto = JSON.stringify(afiliacion.eventos(salida.organizacion.id));
      expect(texto).not.toContain('secreto@ejemplo.co');
      expect(texto).not.toContain('+573009998877');
    });

    it('consultar una afiliación que no existe no revienta con 500', () => {
      expect(() => afiliacion.estado('no-existe')).toThrow(PulsoError);
    });
  });
});
