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
export type Complejidad = 'baja' | 'media' | 'alta';

/**
 * Tipo de movil (Res. 3100/2019).
 *  TAB = Transporte Asistencial Basico (auxiliar / TAPH)
 *  TAM = Transporte Asistencial Medicalizado (medico a bordo)
 * Es un FILTRO DURO: un TAB no traslada un paciente que requiere ventilacion.
 */
export type TipoMovil = 'TAB' | 'TAM';

/**
 * Triage segun Res. 5596/2015 (Colombia).
 *  1 → atencion inmediata (riesgo vital)
 *  2 → <= 30 min
 *  3 → <= 120 min
 *  4 → <= 240 min
 *  5 → <= 360 min
 */
export type NivelTriage = 1 | 2 | 3 | 4 | 5;

export type Sexo = 'M' | 'F' | 'desconocido';

/**
 * La unidad que atiende el caso.
 *
 * La sesion de core es una contrasena compartida por turno (ver
 * sesion.service.ts): NO hay usuarios en el sistema. Esto no pretende
 * arreglarlo — es trazabilidad operativa, no autenticacion. El movil se
 * declara desde /campo y viaja pegado al caso para que el regulador del CRUE
 * sepa que ambulancia esta preguntando.
 *
 * No lo uses para autorizar nada: quien tiene la contrasena del turno puede
 * escribir el id que quiera.
 */
export interface Unidad {
  /** Identificador del movil, ej "AMB-014". Es lo que ve el regulador. */
  id: string;
  /** Quien opera. Opcional: la sesion es por turno, no por persona. */
  tripulante?: string;
}

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
  naturaleza: 'Pública' | 'Privada' | 'Mixta';
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
  /** Movil que atiende. null si /campo no la declaro. Viaja al CRUE. */
  unidad: Unidad | null;
  creadoEn: string; // ISO 8601
}

/**
 * Lo que sale por GET /estado.
 *
 * `textoCrudo` (el dictado literal del paramedico) y `origen` (las
 * coordenadas de recogida del paciente) NO viajan aqui: son los dos campos
 * mas sensibles del sistema y ninguna consola los pinta. El dictado se
 * conserva en el servidor para auditoria; el mapa de /campo usa el `origen`
 * que ya recibio en la respuesta de POST /triage, no el de /estado.
 *
 * Si alguna vista llega a necesitarlos, se expone un endpoint por caso con su
 * propia autorizacion — no se re-abren en el listado.
 *
 * Agregar un campo a Caso hace que este tipo lo exija, y eso ROMPE el build de
 * `despojar()` en estado.service.ts, que construye el objeto campo por campo.
 * Es a proposito: obliga a decidir si ese dato nuevo puede salir del servidor.
 */
export type CasoPublico = Omit<Caso, 'textoCrudo' | 'origen'>;

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

export type CanalHandshake = 'telegram' | 'whatsapp' | 'consola';
export type EstadoHandshake = 'enviado' | 'aceptado' | 'rechazado' | 'timeout';

export interface Handshake {
  id: string;
  casoId: string;
  sedeCodigo: string;
  canal: CanalHandshake;
  estado: EstadoHandshake;
  /** "Sin camas UCI", "Hemodinamia en procedimiento"... */
  motivoRechazo: string | null;
  enviadoEn: string;
  /**
   * Cuando esta solicitud deja de esperar y pasa a 'timeout'.
   *
   * Lo calcula el servidor al despachar (enviadoEn + HANDSHAKE_TIMEOUT_S) y
   * viaja al cliente para que /campo pinte el cronometro de expiracion contra
   * el MISMO instante que va a usar core. Si el front inventara su propio
   * plazo, la barra llegaria a cero mientras el servidor sigue esperando —o al
   * reves— y el paramedico veria una cuenta que miente.
   */
  expiraEn: string;
  respondidoEn: string | null;
  latenciaS: number | null;
}

// ─────────────────────────────────────────────────────────────────
// Escalamiento al CRUE — el "paseo de la muerte" resuelto
// ─────────────────────────────────────────────────────────────────

/**
 * Por que este caso dejo de resolverse solo.
 *  sin-candidatos        el match no devolvio ni una sede elegible
 *  candidatos-agotados   todas rechazaron o dejaron vencer la solicitud
 *  solicitud-paramedico  lo pidio la tripulacion (boton en /campo)
 */
export type MotivoEscalamiento =
  | 'sin-candidatos'
  | 'candidatos-agotados'
  | 'solicitud-paramedico';

/**
 * Un caso que el ruteo automatico no pudo cerrar y pasa a manos de un
 * regulador humano.
 *
 * Existe por una razon de producto, no tecnica: sin esto, cuando el ranking
 * sale vacio /campo muestra una lista en blanco y el paramedico queda solo
 * frente a la pantalla con un paciente en la camilla. Ese es exactamente el
 * escenario que PULSO dice eliminar, asi que el sistema tiene que nombrarlo,
 * registrarlo y ponerlo en la consola del CRUE.
 */
export interface Escalamiento {
  id: string;
  casoId: string;
  motivo: MotivoEscalamiento;
  /** Sedes que ya dijeron que no. Es lo primero que el regulador necesita. */
  sedesIntentadas: string[];
  detalle: string | null;
  creadoEn: string;
  /** null mientras nadie del CRUE lo haya tomado. */
  atendidoEn: string | null;
  atendidoPor: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Capacidades — que puede hacer el sistema AHORA MISMO
// ─────────────────────────────────────────────────────────────────

/**
 * Estado real de las integraciones, para la barra persistente de /campo.
 *
 * Cada campo de core degrada a un modo mock sin credenciales (esa es la regla
 * del proyecto), y hasta ahora esa degradacion era INVISIBLE: la consola
 * mostraba un ETA calculado por regla de tres exactamente igual que uno de
 * Mapbox con trafico. Esto lo hace decible.
 *
 * No lleva secretos ni URLs: solo dice en que modo esta cada pieza.
 */
export interface Capacidades {
  /** llm = Claude extrae. heuristico = palabras clave (confianza 0.35). */
  ia: 'llm' | 'heuristico';
  /** trafico = Mapbox Matrix. estimado = distancia / velocidad media. */
  ruteo: 'trafico' | 'estimado';
  /**
   * De donde sale la transcripcion.
   *  deepgram-streaming  el navegador transcribe en vivo con un token efimero
   *  deepgram-servidor   el navegador graba y core transcribe (proxy)
   *  navegador           Web Speech API — no existe en Safari/iOS
   */
  voz: 'deepgram-streaming' | 'deepgram-servidor' | 'navegador';
  /** Canal por el que sale el handshake si no se pide otro. */
  canal: CanalHandshake;
  /** supabase = catalogo REPS en DB. semillas = catalogo compilado. */
  datos: 'supabase' | 'semillas';
  /** Segundos que espera una solicitud antes de vencer. Lo pinta /campo. */
  handshakeTimeoutS: number;
  ts: string;
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
  /** Movil que atiende. Se guarda en el caso y viaja al CRUE. */
  unidad?: Unidad;
}
export interface TriageResponse {
  caso: Caso;
  latenciaMs: number;
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
  decision: 'aceptado' | 'rechazado';
  motivo?: string;
}
export interface RespondResponse {
  handshake: Handshake;
  /** Congestion de la sede DESPUES de procesar la respuesta. */
  congestionActualizada: number;
  /**
   * false = la respuesta NO cambio nada, porque la solicitud ya estaba
   * resuelta (doble toque) o ya habia vencido.
   *
   * Quien llama TIENE que mirar esto antes de decirle a alguien que el
   * traslado quedo aceptado: sin este campo, un "Aceptar" tocado 20 segundos
   * tarde devolvia el handshake en 'timeout' y el webhook de Telegram
   * respondia igualmente "traslado ACEPTADO". Dos hospitales creyendo que
   * reciben al mismo paciente es peor que un rechazo.
   */
  aplicada: boolean;
}

/** POST /api/escalamiento — el caso pasa a un regulador humano */
export interface EscalarRequest {
  casoId: string;
  motivo: MotivoEscalamiento;
  detalle?: string;
}
export interface EscalarResponse {
  escalamiento: Escalamiento;
}

/** POST /api/escalamiento/atender — lo toma el CRUE */
export interface AtenderEscalamientoRequest {
  escalamientoId: string;
  atendidoPor?: string;
}
export interface AtenderEscalamientoResponse {
  escalamiento: Escalamiento;
}

/**
 * POST /api/voz/token — credencial efimera de Deepgram para el navegador.
 *
 * La API key maestra NUNCA sale de core. El navegador recibe un token que
 * vence en minutos, y si se filtra caduca solo. Ver VozService.
 */
export interface TokenVozResponse {
  token: string;
  /** ISO 8601. Cuando el token deja de servir. */
  expiraEn: string;
  /** Modelo de STT que el cliente debe pedir. */
  modelo: string;
  /** Idioma que el cliente debe pedir. */
  idioma: string;
}

/**
 * POST /api/voz/transcribir — audio grabado → texto.
 *
 * El cuerpo de la peticion es el audio BINARIO (no JSON, no base64) con su
 * Content-Type real. Ver voz.controller.ts.
 */
export interface TranscribirResponse {
  texto: string;
  /**
   * 0..1 — que tan seguro esta el reconocedor de haber OIDO bien.
   *
   * No confundir con `Caso.confianza`, que mide que tan seguro esta el parser
   * clinico del DIAGNOSTICO. Se puede oir perfecto un dictado ambiguo.
   */
  confianza: number;
  /** Cuanto tardo la transcripcion. Para medir si el flujo aguanta el pitch. */
  duracionS: number;
}

/** Forma de error uniforme. Todas las rutas la devuelven igual. */
export interface ErrorApi {
  error: string;
  detalle?: string;
}
