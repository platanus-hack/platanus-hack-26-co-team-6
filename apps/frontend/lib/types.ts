/**
 * ═══════════════════════════════════════════════════════════════════
 *  PULSO — CONTRATO DE CLIENTE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  ESPEJO de apps/backend/core/src/contracts/types.ts.
 *
 *  El dueño del contrato es CORE. Este archivo existe porque el front y el
 *  backend son dos proyectos pnpm separados y no comparten un paquete todavía.
 *
 *  REGLA: nadie cambia un tipo aquí sin cambiarlo en core, y al revés. Un
 *  cambio en un solo lado no rompe el build — rompe el runtime, que es peor.
 *  Si esto empieza a doler, la salida es un paquete compartido en el
 *  workspace, no seguir copiando a mano.
 *
 *  Dueños:
 *    Caso / ExtraccionClinica  → Neid  (los produce POST /triage)
 *    Sede / Candidato          → Zaid  (los produce POST /match)
 *    Handshake                 → Sebas (los produce POST /dispatch)
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

/** Código de servicio del CodeSystem REPS de MinSalud. Ver presentacion.ts */
export type CodServicio = number;

/** Res. 3100/2019 clasifica por complejidad, no por "nivel I/II/III". */
export type Complejidad = "baja" | "media" | "alta";

/**
 * Tipo de móvil (Res. 3100/2019).
 *  TAB = Transporte Asistencial Básico (auxiliar / TAPH)
 *  TAM = Transporte Asistencial Medicalizado (médico a bordo)
 * Es un FILTRO DURO: un TAB no traslada un paciente que requiere ventilación.
 */
export type TipoMovil = "TAB" | "TAM";

/**
 * Triage según Res. 5596/2015 (Colombia).
 *  1 → atención inmediata (riesgo vital)
 *  2 → <= 30 min
 *  3 → <= 120 min
 *  4 → <= 240 min
 *  5 → <= 360 min
 */
export type NivelTriage = 1 | 2 | 3 | 4 | 5;

export type Sexo = "M" | "F" | "desconocido";

// ─────────────────────────────────────────────────────────────────
// Sede — el universo de destinos posibles
// ─────────────────────────────────────────────────────────────────

export interface CamaSede {
  /** "CAMAS-Adultos", "CAMAS-UCI Adultos", "CAMAS-Pediatrica"... (nombres REPS) */
  tipo: string;
  total: number;
  /** Ocupación del snapshot REPS 2022. Es un PRIOR, no la ocupación de hoy. */
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
  /** Códigos REPS habilitados en esta sede. */
  servicios: CodServicio[];
  camas: CamaSede[];
}

// ─────────────────────────────────────────────────────────────────
// Caso — lo que sale del parser clínico
// ─────────────────────────────────────────────────────────────────

export interface ExtraccionClinica {
  /** Una línea, como la diría un médico en la radio. */
  resumen: string;
  triage: NivelTriage;
  /** CIE-10, ej "I21.1". null si el dictado no alcanza para inferirlo. */
  dxCie10: string | null;
  dxDescripcion: string;
  /** Códigos REPS que la sede receptora DEBE tener habilitados. */
  serviciosRequeridos: CodServicio[];
  complejidadRequerida: Complejidad;
  edad: number | null;
  sexo: Sexo;
  /** Hallazgos que justifican el triage. Se muestran en la tarjeta del receptor. */
  signosAlarma: string[];
  /** true si el paciente requiere médico a bordo → obliga TAM. */
  requiereMedicoABordo: boolean;
  /** 0..1 — qué tan seguro está el parser. Si < 0.5 la UI pide confirmación. */
  confianza: number;
}

export interface Caso extends ExtraccionClinica {
  id: string;
  /** El dictado literal, sin tocar. Se conserva para auditoría. */
  textoCrudo: string;
  origen: Coordenada;
  tipoMovil: TipoMovil;
  creadoEn: string; // ISO 8601
}

// ─────────────────────────────────────────────────────────────────
// Candidato — el ranking
// ─────────────────────────────────────────────────────────────────

/**
 * Desglose del score. TODO ESTÁ EN MINUTOS — esa es la decisión de diseño que
 * hace que el jurado entienda el ranking sin explicación.
 */
export interface DesgloseScore {
  /** ETA real con tráfico (Mapbox driving-traffic). */
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
  /** 1 = mejor opción. 0 = descartada. */
  rank: number;
  etaMin: number;
  distKm: number;
  /** 0..1 — posterior Beta-Bernoulli. */
  pAceptacion: number;
  /** 0..1 — índice de congestión inferido. */
  congestion: number;
  /** Costo total en minutos. MENOR ES MEJOR. */
  score: number;
  desglose: DesgloseScore;
  /**
   * Servicios exigidos por el caso que esta sede NO tiene.
   * Vacío = cumple ese criterio. Puede estar vacío y aun así estar descartada
   * (por complejidad o por tipo de móvil) — mirar motivoDescarte.
   */
  serviciosFaltantes: CodServicio[];
  /**
   * null = la sede es despachable.
   * Si trae texto, la UI la pinta en gris con este motivo y el botón de
   * despachar va deshabilitado.
   */
  motivoDescarte: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Handshake — el apretón de manos de un toque
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
// RESPUESTAS DE CORE
// Las firmas exactas de apps/backend/core. No improvisar.
// ─────────────────────────────────────────────────────────────────

/** POST {API}/triage */
export interface TriageResponse {
  caso: Caso;
  latenciaMs: number;
}

/** POST {API}/match */
export interface MatchResponse {
  candidatos: Candidato[];
  /** Cuántas sedes se evaluaron antes de filtrar. Se muestra en el demo. */
  evaluadas: number;
  /** Cuántas pasaron el filtro duro de servicios. */
  compatibles: number;
  latenciaMs: number;
}

/** POST {API}/dispatch */
export interface DispatchResponse {
  handshake: Handshake;
}

/** POST {API}/handshake/respond */
export interface RespondResponse {
  handshake: Handshake;
  /** Congestión de la sede DESPUÉS de procesar la respuesta. */
  congestionActualizada: number;
}

export interface CongestionSede {
  codigo: string;
  nombre: string;
  indice: number;
  etiqueta: "baja" | "media" | "alta" | "crítica";
  aceptados: number;
  rechazados: number;
  /** Opcional (campos nuevos siempre opcionales). La consume el mapa de /crue. */
  coord?: Coordenada;
}

/** GET {API}/estado */
export interface EstadoResponse {
  casos: Caso[];
  handshakes: Handshake[];
  congestion: CongestionSede[];
  ts: string;
}
