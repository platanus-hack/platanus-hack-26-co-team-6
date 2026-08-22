/**
 * ═══════════════════════════════════════════════════════════════════
 *  PULSO — CONTRATO COMPARTIDO
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Este archivo es LEY. Los cuatro carriles dependen de el.
 *
 *  REGLA: nadie cambia un tipo de aqui en silencio. Si necesitas cambiar
 *  algo, lo dices en voz alta / en el chat ANTES de guardar. Un cambio
 *  silencioso aqui rompe el trabajo de los otros tres sin que se enteren.
 *
 *  Duenos:
 *    Caso / ExtraccionClinica  → Neid  (los produce /api/triage)
 *    Sede / Candidato          → Zaid  (los produce /api/match)
 *    Handshake                 → Sebas (los produce /api/dispatch)
 *    Todos los consume         → Juan  (los pinta)
 * ═══════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────
// Primitivos
// ─────────────────────────────────────────────────────────────────

export interface Coordenada {
  lat: number;
  lng: number;
}

/** Codigo de servicio del CodeSystem REPS de MinSalud. Ver servicios-reps.ts */
export type CodServicio = number;

/** Res. 3100/2019 clasifica por complejidad, no por "nivel I/II/III". */
export type Complejidad = "baja" | "media" | "alta";

/**
 * Tipo de movil (Res. 3100/2019).
 *  TAB = Transporte Asistencial Basico (auxiliar / TAPH)
 *  TAM = Transporte Asistencial Medicalizado (medico a bordo)
 * Es un FILTRO DURO: un TAB no traslada un paciente que requiere ventilacion.
 */
export type TipoMovil = "TAB" | "TAM";

/**
 * Triage segun Res. 5596/2015 (Colombia).
 *  1 → atencion inmediata (riesgo vital)
 *  2 → <= 30 min
 *  3 → <= 120 min
 *  4 → <= 240 min
 *  5 → <= 360 min
 */
export type NivelTriage = 1 | 2 | 3 | 4 | 5;

export type Sexo = "M" | "F" | "desconocido";

// ─────────────────────────────────────────────────────────────────
// Sede — el universo de destinos posibles (Zaid)
// ─────────────────────────────────────────────────────────────────

export interface CamaSede {
  /** "CAMAS-Adultos", "CAMAS-UCI Adultos", "CAMAS-Pediatrica"... (nombres REPS) */
  tipo: string;
  total: number;
  /** Ocupacion del snapshot REPS 2022. Es un PRIOR, no la ocupacion de hoy. */
  ocupadasSnapshot: number;
}

export interface Sede {
  /** codigo_habilitacion_sede del REPS. Es la PK en todo el sistema. */
  codigo: string;
  nombre: string;
  direccion: string;
  localidad: string | null;
  coord: Coordenada;
  naturaleza: "Pública" | "Privada" | "Mixta";
  complejidad: Complejidad;
  telefono: string | null;
  /** Codigos REPS habilitados en esta sede. Ver SERVICIOS en servicios-reps.ts */
  servicios: CodServicio[];
  camas: CamaSede[];
}

// ─────────────────────────────────────────────────────────────────
// Caso — lo que sale del parser clinico (Neid)
// ─────────────────────────────────────────────────────────────────

/**
 * Lo que el LLM extrae del dictado. NO incluye id, origen ni timestamps:
 * eso lo agrega el servidor. Este es el esquema exacto que Neid le pide
 * a Claude via structured output.
 */
export interface ExtraccionClinica {
  /** Una linea, como la diria un medico en la radio. */
  resumen: string;
  triage: NivelTriage;
  /** CIE-10, ej "I21.1". null si el dictado no alcanza para inferirlo. */
  dxCie10: string | null;
  dxDescripcion: string;
  /** Codigos REPS que la sede receptora DEBE tener habilitados. */
  serviciosRequeridos: CodServicio[];
  complejidadRequerida: Complejidad;
  edad: number | null;
  sexo: Sexo;
  /** Hallazgos que justifican el triage. Se muestran en la tarjeta del receptor. */
  signosAlarma: string[];
  /** true si el paciente requiere medico a bordo → obliga TAM. */
  requiereMedicoABordo: boolean;
  /** 0..1 — que tan seguro esta el parser. Si < 0.5 la UI pide confirmacion. */
  confianza: number;
}

export interface Caso extends ExtraccionClinica {
  id: string;
  /** El dictado literal, sin tocar. Se conserva para auditoria. */
  textoCrudo: string;
  origen: Coordenada;
  tipoMovil: TipoMovil;
  creadoEn: string; // ISO 8601
}

// ─────────────────────────────────────────────────────────────────
// Candidato — el ranking (Zaid + Neid)
// ─────────────────────────────────────────────────────────────────

/**
 * Desglose del score. TODO ESTA EN MINUTOS — esa es la decision de diseno
 * que hace que el jurado entienda el ranking sin explicacion.
 */
export interface DesgloseScore {
  /** ETA real con trafico (Mapbox driving-traffic). */
  ruta: number;
  /** (1 - pAceptacion) * PENALIZACION_REBOTE */
  riesgoRechazo: number;
  /** congestion * ESPERA_PUERTA_MAX */
  espera: number;
  /** Bono negativo por camas libres declaradas. Resta al costo. */
  bono: number;
}

export interface Candidato {
  sede: Sede;
  /** 1 = mejor opcion. */
  rank: number;
  etaMin: number;
  distKm: number;
  /** 0..1 — posterior Beta-Bernoulli. Ver scoring.ts */
  pAceptacion: number;
  /** 0..1 — indice de congestion inferido. Ver congestion.ts */
  congestion: number;
  /** Costo total en minutos. MENOR ES MEJOR. */
  score: number;
  desglose: DesgloseScore;
  /**
   * Servicios exigidos por el caso que esta sede NO tiene.
   * Vacio = cumple ese criterio. Puede estar vacio y aun asi estar
   * descartada (por complejidad o por tipo de movil) — mirar motivoDescarte.
   */
  serviciosFaltantes: CodServicio[];
  /**
   * null = la sede es despachable.
   * Si trae texto, la UI la pinta en gris con este motivo y el boton
   * de despachar va deshabilitado.
   * Ej: "No tiene Hemodinamia e intervencionismo", "Requiere móvil TAM".
   */
  motivoDescarte: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Handshake — el apreton de manos de un toque (Sebas)
// ─────────────────────────────────────────────────────────────────

export type CanalHandshake = "telegram" | "whatsapp" | "consola";
export type EstadoHandshake = "enviado" | "aceptado" | "rechazado" | "timeout";

export interface Handshake {
  id: string;
  casoId: string;
  sedeCodigo: string;
  canal: CanalHandshake;
  estado: EstadoHandshake;
  /** "Sin camas UCI", "Hemodinamia en procedimiento"... */
  motivoRechazo: string | null;
  enviadoEn: string;
  respondidoEn: string | null;
  latenciaS: number | null;
}

// ─────────────────────────────────────────────────────────────────
// CONTRATOS DE API
// Estas son las firmas exactas. No improvisar.
// ─────────────────────────────────────────────────────────────────

/** POST /api/triage — Neid */
export interface TriageRequest {
  texto: string;
  origen?: Coordenada;
  tipoMovil?: TipoMovil;
}
export interface TriageResponse {
  caso: Caso;
  latenciaMs: number;
  /**
   * Qué produjo la extracción. Opcional para no romper a nadie.
   * Antes la única pista de que estabas viendo la heurística era
   * `confianza === 0.35` exacto, y eso se pasa por alto justo cuando importa.
   */
  motor?: "claude" | "heuristica";
  /** Dónde corrió. `ai-core` solo aparece si AI_CORE_BASE_URL está puesta. */
  via?: "core" | "ai-core";
}

/** POST /api/match — Zaid */
export interface MatchRequest {
  caso: Caso;
  /** Cuantos candidatos devolver. Default 5. */
  limite?: number;
  /** Radio de busqueda en km. Default 25. */
  radioKm?: number;
}
export interface MatchResponse {
  candidatos: Candidato[];
  /** Cuantas sedes se evaluaron antes de filtrar. Se muestra en el demo. */
  evaluadas: number;
  /** Cuantas pasaron el filtro duro de servicios. */
  compatibles: number;
  latenciaMs: number;
}

/** POST /api/dispatch — Sebas */
export interface DispatchRequest {
  casoId: string;
  sedeCodigo: string;
  canal?: CanalHandshake;
}
export interface DispatchResponse {
  handshake: Handshake;
}

/** POST /api/handshake/respond — Sebas (lo llaman la consola Y el webhook) */
export interface RespondRequest {
  handshakeId: string;
  decision: "aceptado" | "rechazado";
  motivo?: string;
}
export interface RespondResponse {
  handshake: Handshake;
  /** Congestion de la sede DESPUES de procesar la respuesta. */
  congestionActualizada: number;
}

/** Forma de error uniforme. Todas las rutas la devuelven igual. */
export interface ErrorApi {
  error: string;
  detalle?: string;
}
