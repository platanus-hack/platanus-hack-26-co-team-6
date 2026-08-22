import type { Pool, PoolClient } from 'pg';
import type { RoutingDecisionEvidence } from '../contracts/types';
import {
  routingRejection,
  type RoutingResponse,
  type RoutingResponseCommand,
  type RoutingStore,
  type StoredRoutingDecision,
} from './routing-store';

export class PostgresRoutingStore implements RoutingStore {
  constructor(private readonly pool: Pool) {}

  async respond(command: RoutingResponseCommand): Promise<RoutingResponse> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        'select pg_advisory_xact_lock(hashtextextended($1, 0))',
        [command.requestKey],
      );
      const prior = await client.query<{
        fingerprint: string;
        result: RoutingResponse;
      }>(
        'select fingerprint, result from pulso_routing_idempotency where request_key = $1 for update',
        [command.requestKey],
      );
      if (prior.rowCount) {
        await client.query('commit');
        return prior.rows[0].fingerprint === command.fingerprint
          ? prior.rows[0].result
          : routingRejection('PULSO_IDEMPOTENCY_CONFLICT');
      }
      await client.query(
        'insert into pulso_routing_cases(case_id) values ($1) on conflict do nothing',
        [command.caseId],
      );
      const state = await client.query<{ accepted_destination: string | null }>(
        'select accepted_destination from pulso_routing_cases where case_id = $1 for update',
        [command.caseId],
      );
      const result =
        state.rows[0].accepted_destination &&
        state.rows[0].accepted_destination !== command.destinationCode
          ? routingRejection('PULSO_DESTINATION_ALREADY_ACCEPTED')
          : { accepted: true };
      if (result.accepted) {
        await client.query(
          'update pulso_routing_cases set accepted_destination = $2, accepted_at = now() where case_id = $1',
          [command.caseId, command.destinationCode],
        );
        await client.query(
          'insert into pulso_routing_decision_audit(case_id, destination_code, evidence) values ($1, $2, $3::jsonb)',
          [
            command.caseId,
            command.destinationCode,
            JSON.stringify(command.evidence),
          ],
        );
      }
      await client.query(
        'insert into pulso_routing_idempotency(request_key, fingerprint, result) values ($1, $2, $3::jsonb)',
        [command.requestKey, command.fingerprint, JSON.stringify(result)],
      );
      await client.query('commit');
      return result;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async saveDecision(decision: StoredRoutingDecision): Promise<void> {
    await this.pool.query('insert into pulso_routing_cases(case_id) values ($1) on conflict do nothing', [decision.caseId]);
    await this.pool.query('update pulso_routing_cases set routing_state = $2, decision_evidence = $3::jsonb where case_id = $1', [decision.caseId, decision.state, JSON.stringify(decision.evidence ?? null)]);
  }

  async decision(caseId: string): Promise<StoredRoutingDecision | undefined> {
    const result = await this.pool.query<{ case_id: string; routing_state: StoredRoutingDecision['state']; decision_evidence: RoutingDecisionEvidence | null }>('select case_id, routing_state, decision_evidence from pulso_routing_cases where case_id = $1', [caseId]);
    const row = result.rows[0];
    return row ? { caseId: row.case_id, state: row.routing_state, ...(row.decision_evidence ? { evidence: row.decision_evidence } : {}) } : undefined;
  }

  async audit(): Promise<readonly RoutingDecisionEvidence[]> {
    const result = await this.pool.query<{ evidence: RoutingDecisionEvidence }>(
      'select evidence from pulso_routing_decision_audit order by audit_id',
    );
    return result.rows.map((row) => structuredClone(row.evidence));
  }
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query('rollback');
  } catch {
    /* transaction was not started */
  }
}
