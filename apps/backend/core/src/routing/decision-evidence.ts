import { createHash } from 'node:crypto';
import type { PulsoErrorEnvelope, RoutingDecisionEvidence } from '../contracts/types';

type DecisionEvidenceInput = Omit<RoutingDecisionEvidence, 'fingerprint'>;
type DecisionEvidenceResult = { ok: true; evidence: RoutingDecisionEvidence } | { ok: false; error: PulsoErrorEnvelope };
export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
};
export const createDecisionEvidence = (input: DecisionEvidenceInput): DecisionEvidenceResult => {
  if (!input.caseId || !input.modelVersion || !input.configVersion || !input.selectedDestination || input.inputs === undefined || !Array.isArray(input.candidates) || input.candidates.length === 0 || !input.etaProvenance || !input.minuteBreakdown) return { ok: false, error: { error: { code: 'PULSO_INCOMPLETE_EVIDENCE', message: 'Incomplete decision evidence', retryable: false } } };
  return { ok: true, evidence: { ...input, fingerprint: createHash('sha256').update(canonicalJson(input)).digest('hex') } };
};
export const canDispatch = (result: DecisionEvidenceResult): result is { ok: true; evidence: RoutingDecisionEvidence } => result.ok;