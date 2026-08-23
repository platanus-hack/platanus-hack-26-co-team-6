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
  /**
   * Evidencia del ranking que llevo a este destino, si la hay.
   *
   * OPCIONAL desde la tarea 0.1, y la razon importa: el guard de aceptacion
   * unica tambien corre por el camino del handshake, donde la sede que acepta
   * NO siempre es la #1 del ranking (el fan-out toca varias) y donde el
   * estado de ruteo pudo perderse en un reinicio. Exigir evidencia ahi
   * dejaria la carrera abierta justo cuando hay que cerrarla.
   *
   * Sin evidencia se reserva el destino igual, pero **no se escribe fila de
   * auditoria**: un renglon de evidencia inventado es peor que un hueco, y el
   * hueco queda declarado en el log.
   */
  evidence?: RoutingDecisionEvidence;
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
