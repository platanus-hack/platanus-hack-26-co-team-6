import { classifyClinicalTriage } from './clinical-policy';
import { evaluateEligibility } from './eligibility-policy';

describe('routing policies', () => {
  const clinical = { resumen: 'Shock with hypotension', dxDescripcion: 'Shock', dxCie10: 'R57', serviciosRequeridos: [110], signosAlarma: ['hypotension'], confianza: 0.9, triage: 1 } as const;
  it('allows coherent, confident triage and holds low confidence or inconsistent triage', () => {
    expect(classifyClinicalTriage(clinical)).toEqual({ state: 'ready_for_matching', reasons: [] });
    expect(classifyClinicalTriage({ ...clinical, confianza: 0.2 })).toEqual({ state: 'requires_human_review', reasons: ['PULSO_LOW_CONFIDENCE'] });
    expect(classifyClinicalTriage({ ...clinical, dxCie10: null, signosAlarma: [] })).toEqual({ state: 'requires_human_review', reasons: ['PULSO_INCONSISTENT_TRIAGE'] });
  });
  it('keeps eligible destinations and escalates with all hard-rule reasons when none survive', () => {
    const caso = { serviciosRequeridos: [110], complejidadRequerida: 'media', tipoMovil: 'TAB', requiereMedicoABordo: false } as const;
    const eligible = { codigo: 'ok', servicios: [110], complejidad: 'alta', camas: [{ total: 2, ocupadasSnapshot: 1 }] } as const;
    expect(evaluateEligibility(caso, [eligible])).toMatchObject({ state: 'eligible', eligible: [eligible], failures: [] });
    expect(evaluateEligibility(caso, [{ ...eligible, codigo: 'bad', servicios: [], camas: [{ total: 1, ocupadasSnapshot: 1 }] }])).toEqual({ state: 'escalated_to_crue', eligible: [], failures: [{ codigo: 'bad', reasons: ['MISSING_REQUIRED_SERVICES', 'NO_AVAILABLE_BED'] }] });
  });
  const eligibilityCase = { serviciosRequeridos: [110], complejidadRequerida: 'media', tipoMovil: 'TAB', requiereMedicoABordo: false } as const;
  const destination = { codigo: 'restricted', servicios: [110], complejidad: 'alta', camas: [{ total: 1, ocupadasSnapshot: 0 }] } as const;
  it('returns INSUFFICIENT_COMPLEXITY from production policy', () => {
    expect(evaluateEligibility({ ...eligibilityCase, complejidadRequerida: 'alta' }, [{ ...destination, complejidad: 'baja' }])).toEqual({ state: 'escalated_to_crue', eligible: [], failures: [{ codigo: 'restricted', reasons: ['INSUFFICIENT_COMPLEXITY'] }] });
  });
  it('returns MOVIL_INCOMPATIBLE from production policy', () => {
    expect(evaluateEligibility({ ...eligibilityCase, requiereMedicoABordo: true }, [destination])).toEqual({ state: 'escalated_to_crue', eligible: [], failures: [{ codigo: 'restricted', reasons: ['MOVIL_INCOMPATIBLE'] }] });
  });
  it('checkBeds: false opts out of NO_AVAILABLE_BED without touching the default (tarea 2.1)', () => {
    const sinCamas = { ...destination, camas: [{ total: 1, ocupadasSnapshot: 1 }] };
    // Con el opt-out explícito, la sede sin camas queda elegible: el filtro
    // de camas quedó apagado para esta llamada.
    expect(evaluateEligibility(eligibilityCase, [sinCamas], { checkBeds: false })).toMatchObject({
      state: 'eligible',
      eligible: [sinCamas],
    });
    // Sin el opt-out (comportamiento por defecto, sin tercer argumento), la
    // MISMA sede sigue reportando NO_AVAILABLE_BED — el default no cambió.
    expect(evaluateEligibility(eligibilityCase, [sinCamas])).toEqual({
      state: 'escalated_to_crue',
      eligible: [],
      failures: [{ codigo: 'restricted', reasons: ['NO_AVAILABLE_BED'] }],
    });
  });
});