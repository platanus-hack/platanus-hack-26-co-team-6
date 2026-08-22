import { canDispatch, createDecisionEvidence } from '../routing/decision-evidence';

describe('scoring decision evidence', () => {
  const input = { caseId: 'case-1', modelVersion: 'model-v1', configVersion: 'config-v1', inputs: { z: 1, a: { second: 2, first: 1 } }, candidates: [{ codigo: 'A', reasons: [] }], selectedDestination: 'A', etaProvenance: 'haversine_fallback' as const, minuteBreakdown: { route: 12 } };
  it('creates canonical versioned evidence with fallback provenance', () => {
    const result = createDecisionEvidence(input);
    if (!result.ok) throw new Error('Expected complete evidence');
    expect(result.evidence).toMatchObject({ ...input, fingerprint: expect.any(String) });
    expect(createDecisionEvidence({ ...input, inputs: { a: { first: 1, second: 2 }, z: 1 } })).toMatchObject({ evidence: { fingerprint: result.evidence.fingerprint } });
  });
  it('fails closed when decision evidence lacks version metadata', () => {
    const result = createDecisionEvidence({ ...input, modelVersion: '' });
    expect(result).toEqual({ ok: false, error: { error: { code: 'PULSO_INCOMPLETE_EVIDENCE', message: 'Incomplete decision evidence', retryable: false } } });
    expect(canDispatch(result)).toBe(false);
    expect(canDispatch(createDecisionEvidence({ ...input, etaProvenance: undefined as never }))).toBe(false);
  });
});