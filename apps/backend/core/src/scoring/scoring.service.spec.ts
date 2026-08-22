/**
 * El rebote por sede. Con cero handshakes tiene que dar EXACTAMENTE 22
 * minutos: ese número ya está en el pitch y no se puede mover en un refactor.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AlmacenService } from '../almacen/almacen.service';
import { CongestionService } from './congestion.service';
import {
  ESPERA_RESPUESTA_PRIOR,
  PENALIZACION_REBOTE,
  SOBRECOSTO_REBOTE,
  ScoringService,
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
