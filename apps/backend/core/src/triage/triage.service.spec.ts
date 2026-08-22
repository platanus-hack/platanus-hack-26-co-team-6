/**
 * La cascada del triaje: ai-core → Claude local → heurística.
 *
 * La garantía que estos tests protegen es del contrato y no se negocia:
 * `POST /triage` NUNCA falla por falta de credencial ni porque ai-core esté
 * caído. Siempre devuelve un caso.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { AlmacenService } from '../almacen/almacen.service';
import { AiCoreClient } from '../ai-core/ai-core.client';
import { TriageService } from './triage.service';

const DICTADO =
  'Paciente masculino de 54 años, dolor precordial, supradesnivel del ST, inestable.';

const CASO_DE_AI_CORE = {
  id: 'caso-de-ai-core',
  resumen: 'IAM con supra ST',
  triage: 2,
  dxCie10: 'I21.1',
  dxDescripcion: 'Infarto agudo de miocardio',
  serviciosRequeridos: [743, 110],
  complejidadRequerida: 'alta',
  edad: 54,
  sexo: 'M',
  signosAlarma: ['Supradesnivel del ST'],
  requiereMedicoABordo: true,
  confianza: 0.92,
  textoCrudo: DICTADO,
  origen: { lat: 4.5981, lng: -74.0758 },
  tipoMovil: 'TAM',
  creadoEn: '2026-08-22T20:00:00.000Z',
};

async function construir(
  vars: Record<string, string | undefined>,
  aiCore: Partial<AiCoreClient>,
) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      TriageService,
      AlmacenService,
      { provide: ConfigService, useValue: { get: (k: string) => vars[k] } },
      { provide: AiCoreClient, useValue: aiCore },
    ],
  }).compile();

  return {
    triage: module.get(TriageService),
    almacen: module.get(AlmacenService),
  };
}

const AI_CORE_APAGADO = { configurado: () => false, triage: jest.fn() };

describe('TriageService · cascada', () => {
  it('sin AI_CORE_BASE_URL ni API key: heurística, via core', async () => {
    const { triage } = await construir({}, AI_CORE_APAGADO);

    const r = await triage.procesar({ texto: DICTADO }, DICTADO);

    expect(r.motor).toBe('heuristica');
    expect(r.via).toBe('core');
    expect(r.caso.confianza).toBe(0.35);
    expect(AI_CORE_APAGADO.triage).not.toHaveBeenCalled();
  });

  it('con ai-core configurado usa su respuesta y lo reporta', async () => {
    const aiCore = {
      configurado: () => true,
      triage: jest
        .fn()
        .mockResolvedValue({ caso: CASO_DE_AI_CORE, latenciaMs: 900, motor: 'claude' }),
    };
    const { triage } = await construir({}, aiCore as never);

    const r = await triage.procesar({ texto: DICTADO }, DICTADO);

    expect(r.via).toBe('ai-core');
    expect(r.motor).toBe('claude');
    expect(r.caso.id).toBe('caso-de-ai-core');
  });

  it('el caso que viene de ai-core queda guardado y /estado lo encuentra', async () => {
    // Sin esto, dispatch y el polling de /campo no hallarían el caso.
    const aiCore = {
      configurado: () => true,
      triage: jest
        .fn()
        .mockResolvedValue({ caso: CASO_DE_AI_CORE, latenciaMs: 900, motor: 'claude' }),
    };
    const { triage, almacen } = await construir({}, aiCore as never);

    await triage.procesar({ texto: DICTADO }, DICTADO);

    expect(almacen.obtenerCaso('caso-de-ai-core')).toBeDefined();
  });

  // ── La garantía: ai-core caído NO tumba el endpoint ────────────

  it('si ai-core está caído sigue local, sin lanzar', async () => {
    const aiCore = {
      configurado: () => true,
      triage: jest.fn().mockRejectedValue(new ServiceUnavailableException()),
    };
    const { triage } = await construir({}, aiCore as never);

    const r = await triage.procesar({ texto: DICTADO }, DICTADO);

    expect(r.via).toBe('core');
    expect(r.motor).toBe('heuristica');
    expect(r.caso).toBeDefined();
  });

  it('si ai-core tarda de más sigue local', async () => {
    const aiCore = {
      configurado: () => true,
      triage: jest.fn().mockRejectedValue(new Error('GatewayTimeout')),
    };
    const { triage } = await construir({}, aiCore as never);

    await expect(
      triage.procesar({ texto: DICTADO }, DICTADO),
    ).resolves.toMatchObject({ via: 'core' });
  });

  it('si ai-core responde con SU heurística y core tiene key, resuelve local', async () => {
    // Sin esta regla, un ai-core sin credencial degradaría en silencio a un
    // core que sí podía llamar a Claude. Es exactamente la trampa de
    // "la heurística se te va a colar".
    const aiCore = {
      configurado: () => true,
      triage: jest.fn().mockResolvedValue({
        caso: { ...CASO_DE_AI_CORE, confianza: 0.35 },
        latenciaMs: 3,
        motor: 'heuristica',
      }),
    };
    const { triage } = await construir(
      { ANTHROPIC_API_KEY: 'sk-falsa' },
      aiCore as never,
    );
    // Stub del camino local: este test es sobre el enrutamiento, no sobre la
    // llamada real a Claude — y no queremos red en una prueba unitaria.
    const local = jest
      .spyOn(triage as never, 'extraerConClaude')
      .mockResolvedValue({ ...CASO_DE_AI_CORE, confianza: 0.92 } as never);

    const r = await triage.procesar({ texto: DICTADO }, DICTADO);

    expect(r.via).toBe('core');
    expect(r.motor).toBe('claude');
    expect(local).toHaveBeenCalled();
  });

  it('si ai-core responde con su heurística y core NO tiene key, la acepta', async () => {
    // Aquí no hay nada mejor a lo que caer: pelearlo solo agregaría latencia.
    const aiCore = {
      configurado: () => true,
      triage: jest.fn().mockResolvedValue({
        caso: { ...CASO_DE_AI_CORE, confianza: 0.35 },
        latenciaMs: 3,
        motor: 'heuristica',
      }),
    };
    const { triage } = await construir({}, aiCore as never);

    const r = await triage.procesar({ texto: DICTADO }, DICTADO);

    expect(r.via).toBe('ai-core');
    expect(r.motor).toBe('heuristica');
  });

  // ── Reglas de dominio que no deben cambiar ─────────────────────

  it('requiere médico a bordo ⇒ móvil TAM', async () => {
    const { triage } = await construir({}, AI_CORE_APAGADO);
    const r = await triage.procesar({ texto: DICTADO }, DICTADO);
    expect(r.caso.requiereMedicoABordo).toBe(true);
    expect(r.caso.tipoMovil).toBe('TAM');
  });

  it('el móvil que manda el cliente manda', async () => {
    const { triage } = await construir({}, AI_CORE_APAGADO);
    const r = await triage.procesar(
      { texto: DICTADO, tipoMovil: 'TAB' },
      DICTADO,
    );
    expect(r.caso.tipoMovil).toBe('TAB');
  });

  it('conserva el texto crudo para auditoría', async () => {
    const { triage } = await construir({}, AI_CORE_APAGADO);
    const r = await triage.procesar({ texto: DICTADO }, DICTADO);
    expect(r.caso.textoCrudo).toBe(DICTADO);
  });
});
