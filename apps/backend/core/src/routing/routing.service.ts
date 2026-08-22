import { Inject, Injectable } from '@nestjs/common';
import type {
  Caso,
  Candidato,
  PulsoErrorEnvelope,
  RoutingDecisionEvidence,
} from '../contracts/types';
import { createDecisionEvidence } from './decision-evidence';
import { classifyClinicalTriage } from './clinical-policy';
import {
  ROUTING_STORE,
  type RoutingResponse,
  type RoutingStore,
} from '../persistence/routing-store';

type DecisionResult =
  { evidence: RoutingDecisionEvidence } | { error: PulsoErrorEnvelope };
const rejection = (
  code: PulsoErrorEnvelope['error']['code'],
  message: string,
): DecisionResult => ({
  error: { error: { code, message, retryable: false } },
});

@Injectable()
export class RoutingService {
  constructor(@Inject(ROUTING_STORE) private readonly store: RoutingStore) {}

  assess(caso: Caso) {
    return classifyClinicalTriage(caso);
  }

  async match(caso: Caso, candidates: readonly Candidato[]): Promise<DecisionResult> {
    const clinical = this.assess(caso);
    if (clinical.state !== 'ready_for_matching')
      return rejection(
        clinical.reasons[0] as
          'PULSO_LOW_CONFIDENCE' | 'PULSO_INCONSISTENT_TRIAGE',
        'Clinical review is required before matching',
      );
    const selected = candidates.find(
      (candidate) => candidate.motivoDescarte === null,
    );
    if (!selected) {
      await this.store.saveDecision({ caseId: caso.id, state: 'escalated_to_crue' });
      return rejection(
        'PULSO_NO_ELIGIBLE_DESTINATION',
        'No eligible destination; escalate to CRUE',
      );
    }
    const evidence = createDecisionEvidence({
      caseId: caso.id,
      modelVersion: 'routing-v1',
      configVersion: 'routing-config-v1',
      inputs: caso,
      candidates: [...candidates],
      selectedDestination: selected.sede.codigo,
      etaProvenance: 'haversine_fallback',
      minuteBreakdown: { ...selected.desglose },
    });
    if (!evidence.ok) return evidence;
    await this.store.saveDecision({ caseId: caso.id, state: 'matched', evidence: evidence.evidence });
    return { evidence: evidence.evidence };
  }

  async dispatch(caseId: string, destinationCode: string): Promise<DecisionResult> {
    const evidence = (await this.store.decision(caseId))?.evidence;
    return evidence && evidence.selectedDestination === destinationCode
      ? { evidence }
      : rejection(
          'PULSO_INCOMPLETE_EVIDENCE',
          'Complete matching evidence is required before dispatch',
        );
  }

  respond(
    caseId: string,
    destinationCode: string,
    requestKey: string,
    fingerprint: string,
  ): Promise<RoutingResponse> {
    return this.dispatch(caseId, destinationCode).then((decision) =>
      'evidence' in decision
      ? this.store.respond({
          caseId,
          destinationCode,
          requestKey,
          fingerprint,
          evidence: decision.evidence,
        })
      : { accepted: false, error: decision.error },
    );
  }
}
