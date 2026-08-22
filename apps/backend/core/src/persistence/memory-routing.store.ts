import { Injectable } from '@nestjs/common';
import type { RoutingDecisionEvidence } from '../contracts/types';
import { routingRejection, type RoutingResponse, type RoutingResponseCommand, type RoutingStore, type StoredRoutingDecision } from './routing-store';

@Injectable()
export class MemoryRoutingStore implements RoutingStore {
  private readonly requests = new Map<string, { fingerprint: string; result: RoutingResponse }>();
  private readonly accepted = new Map<string, string>();
  private readonly audits: RoutingDecisionEvidence[] = [];
  private readonly decisions = new Map<string, StoredRoutingDecision>();
  async saveDecision(decision: StoredRoutingDecision): Promise<void> { this.decisions.set(decision.caseId, structuredClone(decision)); }
  async decision(caseId: string): Promise<StoredRoutingDecision | undefined> { const decision = this.decisions.get(caseId); return decision && structuredClone(decision); }
  async respond(command: RoutingResponseCommand): Promise<RoutingResponse> {
    const prior = this.requests.get(command.requestKey);
    if (prior) return prior.fingerprint === command.fingerprint ? prior.result : routingRejection('PULSO_IDEMPOTENCY_CONFLICT');
    const winner = this.accepted.get(command.caseId);
    const result = winner && winner !== command.destinationCode ? routingRejection('PULSO_DESTINATION_ALREADY_ACCEPTED') : { accepted: true };
    this.requests.set(command.requestKey, { fingerprint: command.fingerprint, result });
    if (result.accepted) { this.accepted.set(command.caseId, command.destinationCode); this.audits.push(structuredClone(command.evidence)); }
    return result;
  }
  audit(): readonly RoutingDecisionEvidence[] { return this.audits; }
}
