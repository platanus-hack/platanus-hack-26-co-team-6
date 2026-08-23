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

  /**
   * ⭐ EL GUARD DE ACEPTACION UNICA — el que impide dos hospitales para un paciente.
   *
   * Reserva el destino de un caso. Es idempotente por `requestKey` y, bajo
   * Postgres, corre dentro de `pg_advisory_xact_lock` + `select … for update`:
   * dos aceptaciones simultaneas se serializan y la segunda vuelve con
   * `PULSO_DESTINATION_ALREADY_ACCEPTED`.
   *
   * POR QUE ESTE METODO EXISTE APARTE DE `respond`
   *
   *   `respond` exige primero evidencia de despacho para ESE destino, y esa
   *   precondicion es del camino `POST /dispatch`, no del handshake: la sede
   *   que acepta muchas veces NO es la #1 del ranking —el fan-out toca
   *   varias, y el vigilante re-rutea a la siguiente cuando una no contesta—
   *   y el estado de ruteo vive en RAM hasta la tarea 1.2. Encadenar la
   *   reserva a esa precondicion dejaria la carrera abierta exactamente
   *   cuando hay que cerrarla, que es cuando hay varias sedes tocadas.
   *
   *   Asi que la evidencia se ADJUNTA si existe (y entonces se audita) pero
   *   no se exige. El guard es uno solo: `store.respond`. Aqui no se duplica
   *   ni una linea de esa logica — dos mecanismos resolviendo la misma
   *   carrera es peor que cualquiera de los dos por separado.
   */
  async aceptarDestino(
    caseId: string,
    destinationCode: string,
    requestKey: string,
    fingerprint: string,
  ): Promise<RoutingResponse> {
    const evidence = (await this.store.decision(caseId))?.evidence;
    return this.store.respond({
      caseId,
      destinationCode,
      requestKey,
      fingerprint,
      ...(evidence ? { evidence } : {}),
    });
  }

  /** Aceptacion por el camino de despacho: ademas exige evidencia completa. */
  respond(
    caseId: string,
    destinationCode: string,
    requestKey: string,
    fingerprint: string,
  ): Promise<RoutingResponse> {
    return this.dispatch(caseId, destinationCode).then((decision) =>
      'evidence' in decision
        ? this.aceptarDestino(caseId, destinationCode, requestKey, fingerprint)
        : { accepted: false, error: decision.error },
    );
  }
}
