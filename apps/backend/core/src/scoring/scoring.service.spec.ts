/**
 * El rebote por sede. Con cero handshakes tiene que dar EXACTAMENTE 22
 * minutos: ese número ya está en el pitch y no se puede mover en un refactor.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AlmacenService } from '../almacen/almacen.service';
import { PulsoError } from '../common/pulso-error.filter';
import type { Caso, Sede } from '../contracts/types';
import { CongestionService } from './congestion.service';
import {
  ESPERA_RESPUESTA_PRIOR,
  PENALIZACION_REBOTE,
  SOBRECOSTO_REBOTE,
  ScoringService,
  type EtaSede,
} from './scoring.service';

describe('ScoringService · penalización de rebote', () => {
  let scoring: ScoringService;
  let almacen: AlmacenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScoringService, CongestionService, AlmacenService],
    }).compile();

    scoring = module.get(ScoringService);
    almacen = module.get(AlmacenService);
  });

  /** Simula que una sede respondió N handshakes tardando `segundos` cada uno. */
  function respondio(sede: string, segundos: number, veces = 1) {
    for (let i = 0; i < veces; i++) {
      almacen.registrarRespuesta(sede, 'aceptado', segundos);
    }
  }

  it('el número del pitch sigue siendo 22 y está descompuesto', () => {
    expect(PENALIZACION_REBOTE).toBe(22);
    expect(ESPERA_RESPUESTA_PRIOR + SOBRECOSTO_REBOTE).toBe(22);
  });

  it('sin handshakes devuelve exactamente el prior', () => {
    expect(scoring.penalizacionRebote('SIN-DATOS')).toBeCloseTo(22, 5);
  });

  it('una sede que contesta rápido cuesta menos rebotarla', () => {
    respondio('RAPIDA', 30, 3); // medio minuto
    expect(scoring.penalizacionRebote('RAPIDA')).toBeLessThan(22);
  });

  it('una sede que se demora cuesta más', () => {
    respondio('LENTA', 540, 3); // nueve minutos
    expect(scoring.penalizacionRebote('LENTA')).toBeGreaterThan(22);
  });

  it('nunca baja del sobrecosto fijo', () => {
    // Aunque conteste instantáneamente, descargar al paciente y re-rutear
    // sigue costando. Sin este piso el motor subestimaría el rebote.
    respondio('INSTANTANEA', 0, 50);
    expect(scoring.penalizacionRebote('INSTANTANEA')).toBeGreaterThan(
      SOBRECOSTO_REBOTE,
    );
  });

  it('con una sola observación rara manda el prior', () => {
    respondio('RARA', 1200); // veinte minutos, un solo caso
    const p = scoring.penalizacionRebote('RARA');
    expect(p).toBeGreaterThan(22);
    expect(p).toBeLessThan(27);
  });

  it('las sedes no se contaminan entre sí', () => {
    respondio('LENTA', 600, 5);
    expect(scoring.penalizacionRebote('OTRA')).toBeCloseTo(22, 5);
  });

  it('reiniciarTodo borra también las latencias', () => {
    respondio('X', 600, 5);
    almacen.reiniciarTodo();
    expect(scoring.penalizacionRebote('X')).toBeCloseTo(22, 5);
  });

  it('un rechazo sin latenciaS no rompe el cálculo', () => {
    // El webhook de Telegram podría no traerla en algún camino.
    almacen.registrarRespuesta('SIN-LATENCIA', 'rechazado', null);
    expect(scoring.penalizacionRebote('SIN-LATENCIA')).toBeCloseTo(22, 5);
  });
});

/**
 * `rankear()` — precondición de móvil a nivel de CASO (tarea 2.4).
 *
 * Antes, `movilCompatible()` corría N veces dentro del bucle por sede y
 * producía un `motivoDescarte` por cada hospital — atribuyéndoles una
 * condición del móvil que no es culpa de ninguno. Ahora es una precondición
 * de caso: se evalúa UNA vez, antes del bucle, y si falla, ninguna sede
 * llega a evaluarse.
 */
describe('ScoringService · rankear — precondición de móvil (tarea 2.4)', () => {
  let scoring: ScoringService;

  const CASO_TAM_CON_TAB: Caso = {
    id: 'caso-1',
    resumen: 'IAM con inestabilidad',
    triage: 1,
    dxCie10: 'I21.1',
    dxDescripcion: 'Infarto agudo de miocardio',
    serviciosRequeridos: [743],
    complejidadRequerida: 'alta',
    edad: 60,
    sexo: 'M',
    signosAlarma: ['dolor precordial'],
    requiereMedicoABordo: true,
    confianza: 0.9,
    textoCrudo: 'x',
    origen: { lat: 4.6, lng: -74.08 },
    tipoMovil: 'TAB',
    unidad: { id: 'AMB-014' },
    creadoEn: '2026-01-01T00:00:00.000Z',
  };

  const sede = (codigo: string, over: Partial<Sede> = {}): Sede => ({
    codigo,
    nombre: codigo,
    direccion: 'calle 1',
    localidad: null,
    coord: { lat: 4.6, lng: -74.08 },
    naturaleza: 'Pública',
    complejidad: 'alta',
    telefono: null,
    servicios: [743, 1102],
    camas: [{ tipo: 'ICU', total: 2, ocupadasSnapshot: 0 }],
    ...over,
  });

  const etaDe = (codigo: string): EtaSede => ({ codigo, etaMin: 10, distKm: 3 });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScoringService, CongestionService, AlmacenService],
    }).compile();
    scoring = module.get(ScoringService);
  });

  it('móvil TAB en un caso que requiere TAM lanza PulsoError y ninguna sede se evalúa', () => {
    const sedes = [sede('S1'), sede('S2'), sede('S3')];
    const etas = sedes.map((s) => etaDe(s.codigo));
    const espia = jest.spyOn(scoring, 'calcularDesglose');

    expect(() => scoring.rankear(CASO_TAM_CON_TAB, sedes, etas)).toThrow(PulsoError);
    // El bucle por sede no corrió: calcularDesglose() es el efecto por sede
    // más temprano del método, y nunca se llamó.
    expect(espia).not.toHaveBeenCalled();
  });

  it('el detalle del error nombra el móvil despachado y el tipo requerido por el caso', () => {
    const sedes = [sede('S1')];
    const etas = [etaDe('S1')];

    try {
      scoring.rankear(CASO_TAM_CON_TAB, sedes, etas);
      throw new Error('rankear() debía lanzar y no lanzó');
    } catch (e) {
      expect(e).toBeInstanceOf(PulsoError);
      const err = e as PulsoError;
      expect(err.code).toBe('PULSO_MOVIL_INCOMPATIBLE');
      expect(err.retryable).toBe(false);
      expect(err.message).toContain('AMB-014');
      expect(err.message).toContain('TAB');
      // Regla 5 de AGENTS.md: nada de textoCrudo ni origen en el detalle.
      expect(err.message).not.toContain(CASO_TAM_CON_TAB.textoCrudo);
    }
  });

  it('sin unidad declarada, el detalle degrada a "el móvil despachado" en vez de reventar', () => {
    const casoSinUnidad = { ...CASO_TAM_CON_TAB, unidad: null };

    try {
      scoring.rankear(casoSinUnidad, [sede('S1')], [etaDe('S1')]);
      throw new Error('rankear() debía lanzar y no lanzó');
    } catch (e) {
      expect((e as PulsoError).message).toContain('el móvil despachado');
    }
  });

  it('móvil compatible (TAM) rankea con normalidad, sin lanzar', () => {
    const casoCompatible = { ...CASO_TAM_CON_TAB, tipoMovil: 'TAM' as const };
    const resultado = scoring.rankear(casoCompatible, [sede('S1')], [etaDe('S1')]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].motivoDescarte).toBeNull();
  });

  it('equivalencia: con móvil compatible, el motivoDescarte real por sede no cambia', () => {
    // El gate de elegibilidad (evaluateEligibility con checkBeds:false) solo
    // puede AGREGAR el motivo genérico cuando el motivo real ya es null — la
    // intersección nunca reemplaza el filtro duro en línea (design.md D1/§2).
    const casoCompatible: Caso = { ...CASO_TAM_CON_TAB, tipoMovil: 'TAM' };
    const sinServicio = sede('SIN-SERVICIO', { servicios: [1102] }); // le falta 743
    const bajaComplejidad = sede('BAJA', { complejidad: 'baja' });
    const viable = sede('OK');
    const sedes = [sinServicio, bajaComplejidad, viable];
    const etas = sedes.map((s) => etaDe(s.codigo));

    const resultado = scoring.rankear(casoCompatible, sedes, etas, { incluirDescartadas: true });
    const motivoPorCodigo = new Map(resultado.map((c) => [c.sede.codigo, c.motivoDescarte]));

    expect(motivoPorCodigo.get('SIN-SERVICIO')).toContain('No tiene');
    expect(motivoPorCodigo.get('BAJA')).toContain('Complejidad');
    expect(motivoPorCodigo.get('OK')).toBeNull();
  });
});
