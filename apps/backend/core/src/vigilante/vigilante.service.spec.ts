/**
 * El vigilante del reloj.
 *
 * Antes de esto, `timeout` existía en el tipo y NADIE lo escribía nunca: un
 * hospital que no contestaba dejaba el caso colgado para siempre. Estos tests
 * fijan las tres cosas que el barrido resuelve.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { Caso, Handshake } from '../contracts/types';
import { AlmacenService } from '../almacen/almacen.service';
import { SedesService } from '../sedes/sedes.service';
import { MatchService } from '../match/match.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { VozClient } from '../voz/voz.client';
import { EscalamientoService } from '../escalamiento/escalamiento.service';
import { VigilanteService } from './vigilante.service';

const AHORA = Date.parse('2026-08-22T20:00:00.000Z');

const CASO: Caso = {
  id: 'caso-1',
  resumen: 'IAM',
  triage: 2,
  dxCie10: 'I21.1',
  dxDescripcion: 'Infarto',
  serviciosRequeridos: [743, 110],
  complejidadRequerida: 'alta',
  edad: 54,
  sexo: 'M',
  signosAlarma: [],
  requiereMedicoABordo: true,
  confianza: 0.9,
  textoCrudo: 'x',
  telefonoReporta: '573001234567',
  origen: { lat: 4.6, lng: -74.08 },
  tipoMovil: 'TAM',
  unidad: { id: 'AMB-014' },
  creadoEn: new Date(AHORA).toISOString(),
};

/** El plazo que DispatchService sella al despachar. Ver common/plazos.ts. */
const ESPERA_S = 45;

function handshake(over: Partial<Handshake> = {}): Handshake {
  return {
    id: 'h1',
    casoId: 'caso-1',
    sedeCodigo: 'S1',
    canal: 'telegram',
    estado: 'enviado',
    motivoRechazo: null,
    enviadoEn: new Date(AHORA).toISOString(),
    expiraEn: new Date(AHORA + ESPERA_S * 1000).toISOString(),
    respondidoEn: null,
    latenciaS: null,
    ...over,
  };
}

describe('VigilanteService', () => {
  let vigilante: VigilanteService;
  let almacen: AlmacenService;
  const voz = {
    configurado: jest.fn().mockReturnValue(true),
    notificar: jest.fn().mockResolvedValue(true),
    llamarSeguimiento: jest.fn().mockResolvedValue(true),
  };
  const match = { rankear: jest.fn() };
  const dispatch = { despachar: jest.fn().mockResolvedValue({}) };
  const sedes = { porCodigo: jest.fn().mockResolvedValue({ nombre: 'Clínica X' }) };
  const escalamiento = { escalar: jest.fn().mockReturnValue({ escalamiento: {} }) };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(AHORA);

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        VigilanteService,
        AlmacenService,
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: SedesService, useValue: sedes },
        { provide: MatchService, useValue: match },
        { provide: DispatchService, useValue: dispatch },
        { provide: VozClient, useValue: voz },
        { provide: EscalamientoService, useValue: escalamiento },
      ],
    }).compile();

    vigilante = modulo.get(VigilanteService);
    almacen = modulo.get(AlmacenService);
    almacen.guardarCaso(CASO);
  });

  afterEach(() => jest.useRealTimers());

  const avanzar = (segundos: number) =>
    jest.setSystemTime(AHORA + segundos * 1000);

  // ── 1. Handshakes sin respuesta ────────────────────────────────

  it('un handshake reciente no se toca', async () => {
    almacen.guardarHandshake(handshake());
    avanzar(30);

    await vigilante.barrer();

    expect(almacen.obtenerHandshake('h1')!.estado).toBe('enviado');
    expect(dispatch.despachar).not.toHaveBeenCalled();
  });

  it('pasado el límite lo marca timeout — el estado que nadie escribía', async () => {
    almacen.guardarHandshake(handshake());
    match.rankear.mockResolvedValue({ candidatos: [] });
    avanzar(90);

    await vigilante.barrer();

    const h = almacen.obtenerHandshake('h1')!;
    expect(h.estado).toBe('timeout');
    expect(h.latenciaS).toBeGreaterThanOrEqual(90);
  });

  it('tras el timeout re-rutea al siguiente candidato', async () => {
    almacen.guardarHandshake(handshake());
    match.rankear.mockResolvedValue({
      candidatos: [{ rank: 1, sede: { codigo: 'S2', nombre: 'Clínica Y' } }],
    });
    avanzar(90);

    await vigilante.barrer();

    expect(dispatch.despachar).toHaveBeenCalledWith(
      expect.objectContaining({ casoId: 'caso-1', sedeCodigo: 'S2' }),
    );
    expect(voz.notificar).toHaveBeenCalledWith(
      '573001234567',
      expect.stringContaining('Clínica Y'),
    );
  });

  it('sin más candidatos avisa y manda escalar al CRUE', async () => {
    almacen.guardarHandshake(handshake());
    match.rankear.mockResolvedValue({ candidatos: [] });
    avanzar(90);

    await vigilante.barrer();

    expect(dispatch.despachar).not.toHaveBeenCalled();
    expect(voz.notificar).toHaveBeenCalledWith(
      '573001234567',
      expect.stringContaining('CRUE'),
    );
  });

  it('no vence dos veces el mismo handshake', async () => {
    almacen.guardarHandshake(handshake());
    match.rankear.mockResolvedValue({ candidatos: [] });
    avanzar(90);

    await vigilante.barrer();
    await vigilante.barrer();

    expect(voz.notificar).toHaveBeenCalledTimes(1);
  });

  // ── 2. Traslados demorados ─────────────────────────────────────

  it('un traslado dentro de su ETA no dispara nada', async () => {
    almacen.guardarHandshake(
      handshake({
        estado: 'aceptado',
        respondidoEn: new Date(AHORA).toISOString(),
        etaMinAlDespachar: 20,
      }),
    );
    avanzar(20 * 60);

    await vigilante.barrer();

    expect(voz.llamarSeguimiento).not.toHaveBeenCalled();
  });

  it('pasado 1.5x el ETA pide la llamada de seguimiento', async () => {
    almacen.guardarHandshake(
      handshake({
        estado: 'aceptado',
        respondidoEn: new Date(AHORA).toISOString(),
        etaMinAlDespachar: 20,
      }),
    );
    avanzar(31 * 60);

    await vigilante.barrer();

    expect(voz.llamarSeguimiento).toHaveBeenCalledWith(
      '573001234567',
      expect.stringContaining('31 minutos'),
    );
  });

  it('la llamada se dispara UNA sola vez', async () => {
    // El barrido corre cada 5s: sin la marca, llamaría cada 5 segundos.
    almacen.guardarHandshake(
      handshake({
        estado: 'aceptado',
        respondidoEn: new Date(AHORA).toISOString(),
        etaMinAlDespachar: 20,
      }),
    );
    avanzar(40 * 60);

    await vigilante.barrer();
    await vigilante.barrer();
    await vigilante.barrer();

    expect(voz.llamarSeguimiento).toHaveBeenCalledTimes(1);
  });

  it('sin ETA base no inventa un umbral', async () => {
    // Pasa cuando Mapbox no respondió al despachar. Se deja pasar en vez de
    // adivinar: una llamada falsa a las 3am cuesta credibilidad.
    almacen.guardarHandshake(
      handshake({
        estado: 'aceptado',
        respondidoEn: new Date(AHORA).toISOString(),
        etaMinAlDespachar: null,
      }),
    );
    avanzar(5 * 60 * 60);

    await vigilante.barrer();

    expect(voz.llamarSeguimiento).not.toHaveBeenCalled();
  });

  // ── Robustez ───────────────────────────────────────────────────

  it('si el barrido revienta no propaga — mataría el intervalo', async () => {
    almacen.guardarHandshake(handshake());
    match.rankear.mockRejectedValue(new Error('core caído'));
    avanzar(90);

    await expect(vigilante.barrer()).resolves.toBeUndefined();
    expect(almacen.obtenerHandshake('h1')!.estado).toBe('timeout');
  });

  it('sin voz configurada sigue venciendo handshakes', async () => {
    voz.configurado.mockReturnValue(false);
    almacen.guardarHandshake(handshake());
    match.rankear.mockResolvedValue({
      candidatos: [{ rank: 1, sede: { codigo: 'S2', nombre: 'Y' } }],
    });
    avanzar(90);

    await vigilante.barrer();

    expect(almacen.obtenerHandshake('h1')!.estado).toBe('timeout');
    expect(dispatch.despachar).toHaveBeenCalled();
    expect(voz.notificar).not.toHaveBeenCalled();
  });
});
