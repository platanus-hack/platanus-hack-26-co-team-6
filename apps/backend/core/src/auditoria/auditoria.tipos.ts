/**
 * La forma del expediente forense.
 *
 * Vive aquí y NO en `contracts/types.ts` porque ese archivo es ley compartida
 * entre los cuatro carriles y su espejo (`apps/frontend/lib/types.ts`) tiene
 * un test que se pone rojo si divergen. Esto es el contrato de un módulo, no
 * del sistema: su espejo del frontend es `lib/auditoria-modelo.ts`.
 */

import type { TipoActor, TipoEvento } from '../eventos/evento.tipos';
import type { PoliticaRedaccion } from './redaccion';

export interface ActorExpediente {
  id: string | null;
  nombre: string | null;
  tipo: TipoActor;
}

/** De dónde salió esta fila. Un expediente sin procedencia no es forense. */
export type FuenteFila = 'evento_caso' | 'pulso_routing_decision_audit';

export interface FilaExpediente {
  /** Estable dentro del expediente. Es la llave de React y del export. */
  clave: string;
  fuente: FuenteFila;
  /** `null` en las filas que no vienen de `evento_caso`. */
  eventoId: number | null;
  /**
   * `null` cuando la fuente no sella hora. Hoy pasa con la evidencia de
   * ruteo: `pulso_routing_decision_audit` la tiene en `created_at` pero el
   * store en memoria no la devuelve. Se declara nula en vez de inventarla.
   */
  ocurridoEn: string | null;
  tipo: TipoEvento;
  actor: ActorExpediente;
  organizacionId: string | null;
  codigoSede: string | null;
  movilId: string | null;
  detalle: Record<string, unknown>;
  /** Id del evento que esta fila corrige. El error se ve, no se esconde. */
  corrigeA: number | null;
  redactados: string[];
}

export interface EvidenciaExpediente {
  estado: 'matched' | 'escalated_to_crue';
  modelVersion: string | null;
  configVersion: string | null;
  selectedDestination: string | null;
  /** 'mapbox' o 'haversine_fallback'. La procedencia del ETA es parte del acta. */
  etaProvenance: string | null;
  minuteBreakdown: Record<string, number>;
  fingerprint: string | null;
  /** El caso que entró al motor, ya redactado. */
  inputs: unknown;
  /** Candidatos evaluados, con los descartados y su motivo. Redactados. */
  candidates: unknown[];
}

export interface ExpedienteCaso {
  casoId: string;
  generadoEn: string;
  solicitante: {
    id: string;
    tipo: TipoActor;
    roles: string[];
    organizacionId: string | null;
    /** Con qué rol se leyó, cuando tiene varios. */
    rolEfectivo: string;
    /** true mientras los roles vengan del turno y no de un actor real (1.3). */
    identidadProvisional: boolean;
  };
  politicaRedaccion: PoliticaRedaccion;
  filas: FilaExpediente[];
  evidencia: EvidenciaExpediente | null;
  /** Dónde vive el registro y qué se pierde si core reinicia. */
  registro: { modo: 'memoria' | 'postgres'; advertencia: string | null };
  /**
   * Qué parte de la historia el sistema sabe escribir hoy. Un expediente que
   * no declara sus huecos se lee como si no los tuviera.
   */
  cobertura: { tiposCableados: TipoEvento[]; nota: string };
}
