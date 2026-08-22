import type { TriageResponse } from '../contracts/types';

/**
 * Lo que devuelve `POST /v1/triage` de ai-core.
 *
 * Es `TriageResponse` más un campo que ai-core sí reporta: qué motor produjo
 * la extracción. Sin él, la única pista de que estabas viendo la heurística
 * era `confianza == 0.35` exacto — y eso se pasa por alto justo cuando importa.
 */
export interface AiCoreTriageResponse extends TriageResponse {
  motor: 'claude' | 'heuristica';
}
