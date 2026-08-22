import { MemoryRoutingStore } from '../persistence/memory-routing.store';
import { RoutingService } from './routing.service';

const caso = (id = 'case-1', confianza = 0.9) => ({
  id,
  textoCrudo: 'patient report',
  resumen: 'acute cardiac symptoms',
  triage: 1 as const,
  dxCie10: 'I21.1',
  dxDescripcion: 'acute infarction',
  serviciosRequeridos: [743],
  complejidadRequerida: 'alta' as const,
  edad: 60,
  sexo: 'M' as const,
  signosAlarma: ['chest pain'],
  requiereMedicoABordo: true,
  confianza,
  origen: { lat: 4.6, lng: -74.1 },
  tipoMovil: 'TAM' as const,
  // null, no una unidad de mentira: el ruteo no debe depender de que /campo
  // haya declarado el móvil, y una fixture con valor lo escondería.
  unidad: null,
  creadoEn: '2026-01-01T00:00:00.000Z',
});
const candidate = (codigo = 'DEST-1') => ({
  sede: {
    codigo,
    nombre: codigo,
    direccion: 'street',
    localidad: null,
    coord: { lat: 4.6, lng: -74.1 },
    naturaleza: 'Pública' as const,
    complejidad: 'alta' as const,
    telefono: null,
    servicios: [743],
    camas: [{ tipo: 'ICU', total: 1, ocupadasSnapshot: 0 }],
  },
  rank: 1,
  etaMin: 12,
  distKm: 4,
  pAceptacion: 0.8,
  congestion: 0.1,
  score: 14,
  desglose: { ruta: 12, riesgoRechazo: 1, espera: 2, bono: -1 },
  serviciosFaltantes: [],
  motivoDescarte: null,
});

describe('RoutingService', () => {
  it('holds low-confidence triage for human review before matching', async () => {
    const service = new RoutingService(new MemoryRoutingStore());
    expect(service.assess(caso('review-case', 0.2))).toMatchObject({
      state: 'requires_human_review',
      reasons: ['PULSO_LOW_CONFIDENCE'],
    });
    await expect(
      service.match(caso('review-case', 0.2), [candidate()]),
    ).resolves.toMatchObject({
      error: { error: { code: 'PULSO_LOW_CONFIDENCE' } },
    });
  });

  it('escalates an empty viable ranking and blocks dispatch without complete evidence', async () => {
    const service = new RoutingService(new MemoryRoutingStore());
    await expect(
      service.match(caso(), [{ ...candidate(), motivoDescarte: 'No beds' }]),
    ).resolves.toMatchObject({
      error: { error: { code: 'PULSO_NO_ELIGIBLE_DESTINATION' } },
    });
    await expect(service.dispatch('case-1', 'DEST-1')).resolves.toMatchObject({
      error: { error: { code: 'PULSO_INCOMPLETE_EVIDENCE' } },
    });
  });

  it('permits complete evidence and replays an accepted handshake response', async () => {
    const service = new RoutingService(new MemoryRoutingStore());
    await expect(service.match(caso(), [candidate()])).resolves.toMatchObject({
      evidence: {
        selectedDestination: 'DEST-1',
        modelVersion: 'routing-v1',
        configVersion: 'routing-config-v1',
      },
    });
    await expect(service.dispatch('case-1', 'DEST-1')).resolves.toMatchObject({
      evidence: { selectedDestination: 'DEST-1' },
    });
    await expect(
      service.respond('case-1', 'DEST-1', 'response-1', 'fingerprint-1'),
    ).resolves.toEqual({ accepted: true });
    await expect(
      service.respond('case-1', 'DEST-1', 'response-1', 'fingerprint-1'),
    ).resolves.toEqual({ accepted: true });
  });

  it('uses the store as durable decision authority across a service restart', async () => {
    const store = new MemoryRoutingStore();
    const first = new RoutingService(store);
    await first.match(caso(), [candidate()]);
    expect(
      await new RoutingService(store).dispatch('case-1', 'DEST-1'),
    ).toMatchObject({
      evidence: { selectedDestination: 'DEST-1' },
    });
    await first.match(caso('crue-case'), [
      { ...candidate(), motivoDescarte: 'No beds' },
    ]);
    await expect(store.decision('crue-case')).resolves.toMatchObject({
      state: 'escalated_to_crue',
    });
  });
});
