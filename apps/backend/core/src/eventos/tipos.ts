/**
 * Los eventos del caso — tarea 3.1.
 *
 * ⚠️ ESTA TAREA ES DEL CARRIL DE NEID. La escribió el carril de Sebas porque
 *    bloqueaba cuatro tareas suyas (3.2, 3.10, 4.1 y 4.5) y la ola 3 no podía
 *    empezar sin ella. Neid: revísala como tuya, y si el diseño no te
 *    convence, cámbialo — lo que importaba era desbloquear, no fijar.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  DE 22 EVENTOS DEL SISTEMA, 3 SE GUARDABAN
 * ═══════════════════════════════════════════════════════════════════
 *  6 vivían en memoria y 13 no existían o se descartaban. Los dos momentos
 *  más vendibles del producto eran invisibles: el **re-ruteo automático**
 *  —"el hospital dijo que no y el sistema siguió solo"— no quedaba
 *  registrado en ninguna parte, y el **override del CRUE** —una decisión con
 *  potestad legal— vivía en `localStorage` del navegador.
 *
 *  Sin esto no hay reporte del paramédico, no hay métricas de negocio, y no
 *  hay forma de responder "¿qué pasó con este paciente?" tres meses después.
 */

/**
 * Los 22 eventos de [Parte II §11.2](../../../../../docs/pulso-plataforma-afiliacion-y-tramites.md#112-los-22-eventos-quién-los-emite-y-cuáles-se-pierden-hoy).
 *
 * ⚠️ El DDL del bloque D1 lista 21 y se le habían quedado fuera
 *    `demora_detectada`, `tramite_firmado` e `intento_cruzado`, que sí están
 *    en la tabla de §11.2. Aquí está la unión de las dos listas, y la
 *    migración `0006` usa exactamente esta.
 */
export const TIPOS_EVENTO = [
  // ── Ciclo de ruteo ───────────────────────────────────────────
  'caso_creado',
  /** La compuerta de baja confianza. Hoy no dejaba rastro de haberse ejercido. */
  'revision_humana',
  'match_calculado',
  'despachado',
  'aceptado',
  'rechazado',
  'timeout',
  /** ⭐ El re-ruteo automático. El mejor momento del producto. */
  'rerouteado',
  'escalado',
  /** ⭐ Decisión del regulador con potestad legal. Vivía en `localStorage`. */
  'override_crue',

  // ── Ciclo del traslado ───────────────────────────────────────
  'llegada_escena',
  'salida_escena',
  'llegada_puerta',
  'entrega',
  'cerrado',
  'demora_reportada',
  'demora_detectada',

  // ── Recepción (fase F5) ──────────────────────────────────────
  'prearribo_enviado',
  'preparacion_confirmada',

  // ── Trámites (fase F6) ───────────────────────────────────────
  'derechos_verificados',
  'tramite_generado',
  'tramite_firmado',
  'contrarreferencia',

  // ── Seguridad ────────────────────────────────────────────────
  /** Alguien intentó actuar sobre una sede fuera de su alcance (§5.3). */
  'intento_cruzado',
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const esTipoEvento = (valor: unknown): valor is TipoEvento =>
  typeof valor === 'string' &&
  (TIPOS_EVENTO as readonly string[]).includes(valor);

/**
 * Una fila de `evento_caso`. **Append-only**: nadie edita ni borra.
 *
 * Una corrección es una fila NUEVA con `corrigeA` apuntando a la vieja, y las
 * dos se leen juntas: *"a las 22:14 se registró llegada a puerta; a las 22:19
 * el mismo actor la corrigió a 22:11"*. Eso es forense. Un `UPDATE` habría
 * borrado el error, que es justo lo que un auditor necesita ver.
 */
export interface EventoCaso {
  id: number;
  casoId: string;
  tipo: TipoEvento;
  /** Quién. Nulo solo cuando lo emite el sistema sin humano detrás. */
  actorId: string | null;
  movilId: string | null;
  codigoSede: string | null;
  /**
   * Contexto del evento.
   *
   * ⚠️ **SIN PII.** Aquí no entran `textoCrudo`, `origen`, el teléfono ni el
   *    token de paciente. `RegistroService` no lo puede verificar por ti: es
   *    una decisión de quien escribe cada llamada.
   */
  detalle: Record<string, unknown>;
  ocurridoEn: string;
  /** Id del evento que esta fila corrige. Nunca se edita el original. */
  corrigeA: number | null;
}

/** Lo que se le pasa a `RegistroService.registrar()`. Una sola firma. */
export interface EntradaEvento {
  casoId: string;
  tipo: TipoEvento;
  actorId?: string | null;
  movilId?: string | null;
  codigoSede?: string | null;
  detalle?: Record<string, unknown>;
  /**
   * Idempotencia por evento: el paramédico toca "ya llegué" dos veces con
   * mala señal y eso es UNA llegada. Único por `(casoId, tipo, clave)`.
   */
  claveIdempotencia?: string | null;
  corrigeA?: number | null;
}
