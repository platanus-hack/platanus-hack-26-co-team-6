import type {
  PulsoErrorEnvelope,
  RoutingDecisionEvidence,
} from '../contracts/types';

export const ROUTING_STORE = Symbol('ROUTING_STORE');
export type RoutingResponseCommand = {
  caseId: string;
  destinationCode: string;
  requestKey: string;
  fingerprint: string;
  evidence: RoutingDecisionEvidence;
};
export type RoutingResponse = { accepted: boolean; error?: PulsoErrorEnvelope };
export type StoredRoutingDecision = { caseId: string; state: 'matched' | 'escalated_to_crue'; evidence?: RoutingDecisionEvidence };
export interface RoutingStore {
  respond(command: RoutingResponseCommand): Promise<RoutingResponse>;
  saveDecision(decision: StoredRoutingDecision): Promise<void>;
  decision(caseId: string): Promise<StoredRoutingDecision | undefined>;
  audit():
    | readonly RoutingDecisionEvidence[]
    | Promise<readonly RoutingDecisionEvidence[]>;
}
export const routingRejection = (
  code: 'PULSO_IDEMPOTENCY_CONFLICT' | 'PULSO_DESTINATION_ALREADY_ACCEPTED',
): RoutingResponse => ({
  accepted: false,
  error: {
    error: {
      code,
      message:
        code === 'PULSO_IDEMPOTENCY_CONFLICT'
          ? 'Idempotency key conflicts with prior request'
          : 'A destination is already accepted for this case',
      retryable: false,
    },
  },
});
