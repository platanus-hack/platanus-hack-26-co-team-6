/**
 * `evento_caso` — el vocabulario de la línea de tiempo del caso.
 *
 * ── DÓNDE ESTÁ LA FRONTERA CON 3.1 / 3.2 ──────────────────────────
 * La tarea 3.1 (Neid) es la dueña de `evento_caso` + `RegistroService`, y la
 * 3.2 (Sebas) cablea los 22 eventos desde los doce servicios que hoy no
 * escriben nada. Ninguna de las dos está hecha, y las tareas 3.11 y 4.12
 * (override persistido y vista forense) no pueden existir sin la tabla.
 *
 * Así que aquí vive el REGISTRO MÍNIMO: el esquema completo del vocabulario,
 * el punto único de escritura y el almacén detrás de una interfaz. Lo que
 * NO hace, a propósito:
 *
 *   · No cablea los 22 eventos. Solo se escriben los dos que 3.11 y 4.12
 *     necesitan: `override_crue` y `lectura_auditoria`.
 *   · No toca `handshake.service.ts`, `dispatch.service.ts`, `vigilante` ni
 *     `triage`. Eso es 3.2 y son archivos de otro carril.
 *   · No implementa el adaptador de Postgres. La migración está escrita
 *     (`supabase/migrations/0007_evento_caso.sql`) y el almacén es una
 *     interfaz con un token de inyección: 3.1 agrega el adaptador y una rama
 *     en la fábrica de `eventos.module.ts`, sin tocar nada más.
 *
 * ── LA REGLA QUE MANDA ────────────────────────────────────────────
 * Append-only. No hay `actualizar` ni `borrar` en ninguna capa — ni en la
 * interfaz, ni en el servicio, ni en la tabla (trigger). Una corrección es un
 * evento NUEVO que apunta al viejo con `corrigeA`. El error se ve, no se
 * esconde: es lo que un auditor necesita mirar.
 */

/**
 * Los tipos de la DDL de `docs/pulso-plataforma-afiliacion-y-tramites.md` §D1,
 * literales y en el mismo orden, más uno.
 *
 * `lectura_auditoria` es el añadido de la tarea 4.12: *"cada lectura queda
 * registrada"*. Consultar el expediente forense de un caso es un acceso a
 * datos clínicos y tiene que dejar rastro — si no, la vista que hace
 * defendible al sistema es justo la que no se puede defender. Va en la misma
 * tabla porque es un evento del caso como cualquier otro, y porque una
 * segunda tabla de accesos sería una segunda cosa que se olvida de escribir.
 */
export const TIPOS_EVENTO = [
  'caso_creado',
  'revision_humana',
  'match_calculado',
  'despachado',
  'aceptado',
  'rechazado',
  'timeout',
  'rerouteado',
  'escalado',
  'override_crue',
  'llegada_escena',
  'salida_escena',
  'llegada_puerta',
  'entrega',
  'cerrado',
  'demora_reportada',
  /** El vigilante detectó la demora solo; distinto de que alguien la reporte. */
  'demora_detectada',
  'prearribo_enviado',
  'preparacion_confirmada',
  'derechos_verificados',
  'tramite_generado',
  'tramite_firmado',
  'contrarreferencia',
  'lectura_auditoria',
  /** Alguien intentó actuar sobre una sede fuera de su alcance. */
  'intento_cruzado',
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export function esTipoEvento(valor: unknown): valor is TipoEvento {
  return (
    typeof valor === 'string' &&
    (TIPOS_EVENTO as readonly string[]).includes(valor)
  );
}

/**
 * Quién lo hizo. La tarea 4.12 pide distinguir humano de servicio, y no es
 * cosmético: "AMB-014 confirmó la llegada" y "`svc:voz` interpretó un audio
 * como confirmación de llegada" son dos hechos distintos ante un juez.
 *
 * `sistema` es lo que decide core solo (el vigilante venciendo un handshake):
 * no hay persona ni token detrás, y fingir una sería peor que declararlo.
 */
export type TipoActor = 'humano' | 'servicio' | 'sistema';

export interface ActorEvento {
  /** `act_…` con 1.3; hoy `turno:<sub>` o `svc:<nombre>`. Nunca un correo. */
  id: string | null;
  /** Nombre para mostrar. Puede venir declarado por el humano, no verificado. */
  nombre: string | null;
  tipo: TipoActor;
}

export interface EventoCaso {
  /** Monótono y creciente. Es lo que `corrigeA` referencia. */
  id: number;
  casoId: string;
  tipo: TipoEvento;
  actor: ActorEvento;
  /**
   * Organización del actor al momento del evento.
   *
   * No está en la DDL de §D1 porque allí el alcance se deriva de
   * `caso.organizacion_id`, que todavía no existe (llega con 1.x/2.x). Aquí
   * se guarda el de quien actuó porque la vista forense lo pide campo por
   * campo ("hora, tipo, actor, organización, detalle") y porque es lo único
   * con lo que hoy se puede negar un caso ajeno a un `admin_organizacion`.
   */
  organizacionId: string | null;
  movilId: string | null;
  codigoSede: string | null;
  detalle: Record<string, unknown>;
  /** Evento que este corrige. La corrección no borra: apunta. */
  corrigeA: number | null;
  /** Único por (casoId, tipo, clave). Un doble toque no duplica el evento. */
  claveIdempotencia: string | null;
  ocurridoEn: string;
}

export interface EntradaEvento {
  casoId: string;
  tipo: TipoEvento;
  actor: ActorEvento;
  organizacionId?: string | null;
  movilId?: string | null;
  codigoSede?: string | null;
  detalle?: Record<string, unknown>;
  corrigeA?: number | null;
  claveIdempotencia?: string | null;
  /** Solo para importar historia. Sin esto, el reloj lo pone el servidor. */
  ocurridoEn?: string;
}
