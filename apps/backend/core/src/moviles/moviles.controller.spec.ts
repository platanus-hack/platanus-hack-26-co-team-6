/**
 * El alcance por inquilino, probado EN EL SERVIDOR.
 *
 * Es la casilla que más importa de la tarea 3.7: un operador no puede ver los
 * móviles de otro operador, y el CRUE sí los ve todos. Que la consola no los
 * pinte no prueba nada — lo que se prueba aquí es que no salen del servidor.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { SedesService } from '../sedes/sedes.service';
import type { Sede } from '../contracts/types';
import { MovilesController } from './moviles.controller';
import { MovilesService } from './moviles.service';
import {
  ALMACEN_MOVILES,
  FLOTA_PROVISIONAL,
  MovilesMemoria,
} from './moviles.almacen';

const SEDES: Sede[] = [
  {
    codigo: '1',
    nombre: 'Hospital de Chapinero',
    direccion: '',
    localidad: 'Chapinero',
    coord: { lat: 4.65, lng: -74.06 },
    naturaleza: 'Pública',
    complejidad: 'alta',
    telefono: null,
    servicios: [],
    camas: [],
  },
  {
    codigo: '2',
    nombre: 'Hospital de Kennedy',
    direccion: '',
    localidad: 'Kennedy',
    coord: { lat: 4.63, lng: -74.15 },
    naturaleza: 'Pública',
    complejidad: 'alta',
    telefono: null,
    servicios: [],
    camas: [],
  },
];

/** Una petición con sesión de turno: es todo lo que core sabe hoy. */
const peticion = (extra: Record<string, unknown> = {}) =>
  ({ operador: 'operador', ...extra }) as unknown as Request;

describe('MovilesController', () => {
  let controlador: MovilesController;
  let almacen: MovilesMemoria;
  /** Lo que el SERVIDOR dice de la sesión. Nunca lo manda el cliente. */
  let configuracion: Record<string, string | undefined>;

  beforeEach(async () => {
    configuracion = {};
    almacen = new MovilesMemoria();

    const modulo: TestingModule = await Test.createTestingModule({
      controllers: [MovilesController],
      providers: [
        MovilesService,
        { provide: ALMACEN_MOVILES, useValue: almacen },
        { provide: SedesService, useValue: { todas: async () => SEDES } },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => configuracion[k] },
        },
      ],
    }).compile();

    controlador = modulo.get(MovilesController);
  });

  // ── Alcance de lectura ───────────────────────────────────────

  it('un operador solo ve los móviles de su organización', async () => {
    // Sin configurar nada: paramédico de org-demo (ver actor.ts).
    const r = await controlador.listar(peticion());

    expect(r.alcance).toBe('organizacion');
    expect(r.moviles.map((m) => m.id).sort()).toEqual(['AMB-014', 'AMB-021']);
    expect(r.moviles.some((m) => m.organizacionId === 'org-vecina')).toBe(false);
  });

  it('el CRUE ve la red completa', async () => {
    configuracion.MOVILES_ROLES_PROVISIONAL = 'regulador_crue';

    const r = await controlador.listar(peticion());

    expect(r.alcance).toBe('red');
    expect(r.moviles).toHaveLength(FLOTA_PROVISIONAL.length);
  });

  it('un actor real (1.3) manda sobre la configuración provisional', async () => {
    const r = await controlador.listar(
      peticion({
        actor: { id: 'act_1', organizacionId: 'org-vecina', roles: ['paramedico'] },
      }),
    );

    expect(r.identidad).toBe('actor');
    expect(r.moviles.map((m) => m.id).sort()).toEqual(['AMB-102', 'AMB-118']);
  });

  it('un actor sin organización no ve nada — el "no sé" no deja pasar', async () => {
    const r = await controlador.listar(
      peticion({ actor: { id: 'act_1', roles: ['paramedico'] } }),
    );

    expect(r.moviles).toEqual([]);
  });

  it('declara que la identidad todavía es provisional', async () => {
    const r = await controlador.listar(peticion());
    // La consola lo pinta: un alcance resuelto con la contraseña de turno no
    // se puede mostrar igual que uno con identidad verificada.
    expect(r.identidad).toBe('provisional');
    expect(r.localidadDerivada).toBe('sede-mas-cercana');
  });

  // ── Reporte de posición ──────────────────────────────────────

  it('la posición llega, se guarda y sale con su precisión', async () => {
    const m = await controlador.reportar(peticion(), 'AMB-014', {
      lat: 4.651,
      lng: -74.061,
      velocidadKmh: 34,
      precisionM: 18,
      disponible: false,
    });

    expect(m.posicion?.lat).toBeCloseTo(4.651);
    expect(m.posicion?.precisionM).toBe(18);
    expect(m.disponible).toBe(false);
    // El sello es del servidor, no del tablet.
    expect(Date.parse(m.posicion!.reportadoEn)).toBeLessThanOrEqual(Date.now());
  });

  it('se ve moverse: el segundo reporte reemplaza al primero', async () => {
    await controlador.reportar(peticion(), 'AMB-014', {
      lat: 4.651,
      lng: -74.061,
      disponible: true,
    });
    const segundo = await controlador.reportar(peticion(), 'AMB-014', {
      lat: 4.632,
      lng: -74.151,
      disponible: true,
    });

    expect(segundo.posicion?.lng).toBeCloseTo(-74.151);
    const r = await controlador.listar(peticion());
    expect(r.moviles.find((m) => m.id === 'AMB-014')?.posicion?.lng).toBeCloseTo(
      -74.151,
    );
  });

  it('agrupa por localidad estimada desde la sede más cercana', async () => {
    await controlador.reportar(peticion(), 'AMB-014', {
      lat: 4.651,
      lng: -74.061,
      disponible: true,
    });
    await controlador.reportar(peticion(), 'AMB-021', {
      lat: 4.632,
      lng: -74.151,
      disponible: true,
    });

    const r = await controlador.listar(peticion());
    const porId = new Map(r.moviles.map((m) => [m.id, m.localidad]));
    expect(porId.get('AMB-014')).toBe('Chapinero');
    expect(porId.get('AMB-021')).toBe('Kennedy');
  });

  it('normaliza el indicativo: "amb 014" es el mismo móvil que AMB-014', async () => {
    await controlador.reportar(peticion(), 'amb 014', {
      lat: 4.651,
      lng: -74.061,
      disponible: true,
    });

    const r = await controlador.listar(peticion());
    // Si no normalizara, aquí habría tres móviles en org-demo.
    expect(r.moviles).toHaveLength(2);
    expect(r.moviles.find((m) => m.id === 'AMB-014')?.posicion).not.toBeNull();
  });

  // ── Lo que NO se puede hacer ─────────────────────────────────

  it('un operador NO puede reportar por un móvil de otra organización', async () => {
    await expect(
      controlador.reportar(peticion(), 'AMB-102', {
        lat: 4.651,
        lng: -74.061,
        disponible: true,
      }),
    ).rejects.toMatchObject({ status: 403 });

    // Y no lo escribió a medias.
    expect(almacen.obtener('AMB-102')?.ultima).toBeNull();
  });

  it('ni el CRUE mueve móviles: ver la red no da permiso de escribir', async () => {
    // PULSO le MUESTRA la cobertura al CRUE. Regular la flota es función legal
    // del CRUE fuera de PULSO (Res. 1220/2010), no un botón de esta consola.
    configuracion.MOVILES_ROLES_PROVISIONAL = 'regulador_crue';
    configuracion.MOVILES_ORG_PROVISIONAL = 'org-crue';

    await expect(
      controlador.reportar(peticion(), 'AMB-102', {
        lat: 4.651,
        lng: -74.061,
        disponible: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('un actor sin organización no puede reportar', async () => {
    await expect(
      controlador.reportar(peticion({ actor: { id: 'act_1', roles: [] } }), 'AMB-500', {
        lat: 4.651,
        lng: -74.061,
        disponible: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('un móvil desconocido entra en la flota del actor, sin tipo verificado', async () => {
    const m = await controlador.reportar(peticion(), 'AMB-777', {
      lat: 4.651,
      lng: -74.061,
      disponible: true,
    });

    expect(m.organizacionId).toBe('org-demo');
    // El tipo es filtro duro: un móvil que aparece solo no lo declara.
    expect(m.tipo).toBeNull();
    expect(m.tipoVerificado).toBe(false);
  });

  it('rechaza el cuerpo inválido con 400 y motivo legible', async () => {
    await expect(
      controlador.reportar(peticion(), 'AMB-014', { lat: 4.65, lng: -74.08 }),
    ).rejects.toMatchObject({ status: 400 });

    expect(almacen.obtener('AMB-014')?.ultima).toBeNull();
  });

  it('rechaza un identificador de móvil vacío', async () => {
    await expect(
      controlador.reportar(peticion(), '   ', {
        lat: 4.65,
        lng: -74.08,
        disponible: true,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  // ── Cableado ─────────────────────────────────────────────────

  it('el módulo se puede instanciar tal y como lo declara MovilesModule', async () => {
    // Regresión: `MovilesMemoria` tenía un parámetro con valor por defecto en
    // el constructor. Nest emite `design:paramtypes` para toda clase
    // `@Injectable()`, intentaba resolverlo como dependencia y core no
    // arrancaba —"Nest can't resolve dependencies of MovilesMemoria"—, algo que
    // ningún test que la instancie a mano puede ver. Esto usa `useClass`, que
    // es exactamente como la cablea el módulo real.
    const modulo = await Test.createTestingModule({
      controllers: [MovilesController],
      providers: [
        MovilesService,
        { provide: ALMACEN_MOVILES, useClass: MovilesMemoria },
        { provide: SedesService, useValue: { todas: async () => SEDES } },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    const r = await modulo.get(MovilesController).listar(peticion());
    expect(r.moviles.length).toBeGreaterThan(0);
  });

  // ── Degradación ──────────────────────────────────────────────

  it('un móvil registrado sin reporte aparece sin posición, no ausente', async () => {
    const r = await controlador.listar(peticion());
    // Es la degradación visible: "no ha reportado" tiene que poder pintarse,
    // y eso exige que el móvil esté en la lista.
    expect(r.moviles.every((m) => m.posicion === null)).toBe(true);
  });
});
