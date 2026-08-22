import { MemoryRoutingStore } from './memory-routing.store';

describe('routing store concurrency contract', () => {
  const evidence = { caseId: 'case-1', modelVersion: 'v1', configVersion: 'c1', inputs: {}, candidates: [], selectedDestination: 'A', etaProvenance: 'mapbox' as const, minuteBreakdown: { route: 1 }, fingerprint: 'evidence-1' };
  const command = (requestKey: string, destinationCode = 'A', fingerprint = 'request-1') => ({ caseId: 'case-1', destinationCode, requestKey, fingerprint, evidence: { ...evidence, selectedDestination: destinationCode } });
  it('replays an identical request without duplicate audit effects and rejects key conflicts', async () => {
    const store = new MemoryRoutingStore();
    expect(await store.respond(command('key-1'))).toEqual({ accepted: true });
    expect(await store.respond(command('key-1'))).toEqual({ accepted: true });
    expect(store.audit()).toHaveLength(1);
    expect(await store.respond(command('key-1', 'A', 'different'))).toMatchObject({ accepted: false, error: { error: { code: 'PULSO_IDEMPOTENCY_CONFLICT' } } });
  });
  it('rejects a competing destination after one acceptance', async () => {
    const store = new MemoryRoutingStore();
    await store.respond(command('key-1', 'A'));
    expect(await store.respond(command('key-2', 'B'))).toMatchObject({ accepted: false, error: { error: { code: 'PULSO_DESTINATION_ALREADY_ACCEPTED' } } });
  });
  it('keeps audit evidence append-only after caller mutation', async () => {
    const store = new MemoryRoutingStore();
    const payload = command('key-1');
    await store.respond(payload);
    payload.evidence.modelVersion = 'mutated';
    expect(store.audit()[0].modelVersion).toBe('v1');
  });
});