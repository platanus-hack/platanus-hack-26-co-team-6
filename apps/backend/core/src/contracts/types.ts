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
  /**
   * Telefono desde el que se reporto, si entro por WhatsApp. Es lo que
   * permite avisarle al paramedico cuando el hospital responde: sin esto
   * la confirmacion se queda en el servidor y el bucle no se cierra.
   */
  telefonoReporta?: string | null;
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

/**
 * Categoria del motivo de rechazo — tarea 0.6.
 *
 * `administrativo` es la que sostiene la tesis: un rebote por falta de cama
 * y uno por falta de claridad del pagador son problemas distintos y hasta hoy
 * se contaban juntos.
 */
export type CategoriaMotivoRechazo =
  | 'capacidad'
  | 'recurso_humano'
  | 'tecnico'
  | 'administrativo';

/** Una entrada del catalogo `motivo_rechazo`. El `codigo` es inmutable. */
export interface MotivoRechazoCatalogo {
  codigo: string;
  /** Editable: cambiarla NO parte la serie historica. */
  etiqueta: string;
  categoria: CategoriaMotivoRechazo;
  version: number;
  /** false = ya no se ofrece, pero el historico lo sigue resolviendo. */
  vigente?: boolean;
}

/** GET /catalogo/motivos-rechazo */
export interface CatalogoMotivosResponse {
  version: number;
  motivos: MotivoRechazoCatalogo[];
}

export interface Handshake {
  id: string;
  casoId: string;
  sedeCodigo: string;
  canal: CanalHandshake;
  estado: EstadoHandshake;
  /** "Sin camas UCI", "Hemodinamia en procedimiento"... */
  motivoRechazo: string | null;
  /**
   * Codigo del catalogo `motivo_rechazo` — tarea 0.6. ESTE es el campo que
   * se agrega y se reporta; `motivoRechazo` es la etiqueta congelada al
   * momento del rechazo y solo se conserva para no romper lo que ya lo pinta.
   */
  motivoCodigo?: string | null;
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
  /**
   * ETA en minutos al momento de despachar. Es la LINEA BASE contra la que
   * se mide si el traslado se esta demorando. Sin esto no hay con que
   * comparar y la deteccion de demoras no puede existir.
   */
  etaMinAlDespachar?: number | null;
  /** Ya se disparo la llamada de seguimiento por demora. Evita repetirla. */
  demoraAvisada?: boolean;
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
   * De donde sale la transcripcion del dictado.
   *  ai-core     el audio se manda a POST /v1/transcribir del servicio de IA
   *  navegador   Web Speech API — NO existe en Safari/iOS, ahi no hay dictado
   */
  voz: 'ai-core' | 'navegador';
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
  /** Quien reporta, si entro por WhatsApp. Viaja hasta el Caso. */
  telefonoReporta?: string | null;
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
  decision: 'aceptado' | 'rechazado';
  /** Etiqueta libre. Se conserva por compatibilidad; prefiera `motivoCodigo`. */
  motivo?: string;
  /** Codigo del catalogo `motivo_rechazo` (GET /catalogo/motivos-rechazo). */
  motivoCodigo?: string;
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
  /**
   * Por que NO se aplico. Solo viaja con `aplicada: false` — tarea 0.1.
   *
   * Sin esto, quien llama solo sabia mirar `handshake.estado`, y el caso que
   * importa no se ve ahi: el handshake sigue en 'enviado' y lo que cambio es
   * que OTRA sede ya acepto el caso (`PULSO_DESTINATION_ALREADY_ACCEPTED`).
   * El webhook de Telegram respondia "esta solicitud ya estaba enviado", que
   * no le dice nada al jefe de urgencias que acaba de tocar el boton.
   */
  codigo?: PulsoCode;
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

/** Forma de error uniforme. Todas las rutas la devuelven igual. */
export interface ErrorApi {
  error: string;
  detalle?: string;
}


// ─────────────────────────────────────────────────────────────────
// Afiliacion, organizaciones e identidad — OLA 2 (Juan: 2.1, 2.5, 2.9)
//
// Salen del Anexo B de `docs/pulso-plataforma-afiliacion-y-tramites.md`.
// Todo lo que se agrega a un tipo que ya existia va OPCIONAL, que es la
// regla del contrato.
// ─────────────────────────────────────────────────────────────────

/**
 * Que clase de entidad se afilia. Determina contra QUE se autoverifica:
 * `ips` cruza contra la tabla `sede` (REPS), `operador_ambulancia` contra el
 * catalogo de transporte asistencial (tarea 2.9).
 */
export type TipoOrganizacion =
  | 'ips'
  | 'operador_ambulancia'
  | 'crue'
  | 'entidad_pagadora';

/**
 * Maquina de estados de la afiliacion (§3.2). Las transiciones legales
 * viven en `afiliacion/estados.ts` y no se deducen de este union: un enum
 * no dice que `retirada` no vuelve.
 *
 * ⚠️ `activa` es el UNICO estado despachable. El ranking filtra por eso.
 */
export type EstadoAfiliacion =
  | 'borrador'
  | 'enviada'
  | 'en_verificacion'
  | 'observada'
  | 'aprobada'
  | 'activa'
  | 'suspendida'
  | 'retirada';

/** Como se verifico. `reps_automatico` es el camino sin tramite (§3.3). */
export type VerificacionAfiliacion = 'reps_automatico' | 'manual' | 'pendiente';

/**
 * Los roles del sistema (§5.2 de multitenancy).
 *
 * ⚠️ ESPEJO de `auth/roles.ts::ROLES`, que es el que usa el guard. Los dos
 *    tienen que decir exactamente lo mismo y hay un test que lo verifica
 *    (`afiliacion/roles-espejo.spec.ts`). Vive aqui ademas de alli porque el
 *    front lo necesita —la redireccion por rol tras el login es de 1.4— y
 *    `auth/` no cruza el cable.
 */
export type Rol =
  | 'paramedico'
  | 'jefe_urgencias'
  | 'admin_organizacion'
  | 'regulador_crue'
  | 'auditor'
  | 'admin_plataforma'
  | 'servicio';

/** La entidad juridica afiliada. El inquilino, en terminos de multitenancy. */
export interface Organizacion {
  id: string;
  tipo: TipoOrganizacion;
  razonSocial: string;
  nombreCorto?: string | null;
  nit: string;
  estado: EstadoAfiliacion;
  verificacion: VerificacionAfiliacion;
  /** Codigos REPS de 12 digitos. Para un operador de ambulancias, vacio. */
  sedes: string[];
  /** Por que quedo `observada`. Vacio en cualquier otro estado. */
  observaciones?: string[];
  creadaEn: string;
  actualizadaEn?: string;
}

/** Una persona o un servicio dentro de una organizacion. Nunca se borra. */
export interface Actor {
  id: string;
  organizacionId: string;
  nombre: string;
  roles: Rol[];
  /** Codigos de sede. Vacio = toda la organizacion. */
  sedes: string[];
  tipo: 'humano' | 'servicio';
  /** false = desactivado. Sigue apareciendo en la auditoria (caso limite 4). */
  activo?: boolean;
  ultimoAcceso?: string | null;
}

/**
 * Lo que el REPS ya sabe y el afiliado NO tiene que tipear (§3.3).
 *
 * No incluye `nombre`: ese se muestra aparte para que el afiliado confirme
 * que PULSO encontro SU sede y no la de al lado. Ese momento es el producto.
 */
export interface PrecargaSede {
  direccion: string;
  coord: Coordenada;
  localidad: string | null;
  naturaleza: Sede['naturaleza'];
  complejidad: Complejidad;
  telefono: string | null;
  servicios: CodServicio[];
  camas: CamaSede[];
}

/** Lo que el catalogo de transporte asistencial sabe de un operador (2.9). */
export interface PrecargaOperador {
  prestador: string;
  direccion: string;
  telefono: string | null;
  correo: string | null;
  /** La marca que despues alimenta `movil.tipo` en 3.6. Nunca se infiere. */
  tiposMovil: TipoMovil[];
  /** El prestador tambien declara servicio de urgencias en el mismo corte. */
  urgencias: boolean;
}

/** POST /afiliacion/verificar */
export interface VerificarAfiliacionRequest {
  tipo: TipoOrganizacion;
  /** 12 digitos. Obligatorio para `ips`; los operadores no lo tienen. */
  codigoHabilitacion?: string;
  nit: string;
  /** Razon social declarada. Se compara contra la del REPS por similitud. */
  razonSocial?: string;
}

/**
 * La respuesta de la autoverificacion.
 *
 * `encontrada: false` NO es un error HTTP: es una respuesta 200 con el
 * motivo especifico. Un 404 mudo obliga al afiliado a adivinar si escribio
 * mal el codigo o si su sede no esta en el REPS, y son dos arreglos
 * distintos.
 */
export interface VerificarAfiliacionResponse {
  encontrada: boolean;
  /** true = existe pero el nombre no cuadra. Va a revision humana. */
  requiereRevision?: boolean;
  /** Que estado le corresponderia si se afiliara ahora mismo. */
  estadoSugerido: EstadoAfiliacion;
  verificacion: VerificacionAfiliacion;
  sede?: Sede;
  precarga?: PrecargaSede;
  operador?: PrecargaOperador;
  /** Similitud 0..1 entre la razon social declarada y la del registro. */
  similitud?: number;
  /** Especifico, nunca "no encontrado". Lo lee un humano y actua. */
  motivo?: string;
}

/** POST /afiliacion — crea la organizacion y su primer admin. */
export interface CrearAfiliacionRequest {
  tipo: TipoOrganizacion;
  nit: string;
  razonSocial: string;
  nombreCorto?: string;
  /** Codigos REPS de 12 digitos. Vacio para un operador de ambulancias. */
  sedes?: string[];
  admin: {
    nombre: string;
    correo: string;
    /** Minimo 12 caracteres (§3.6). Nunca viaja de vuelta ni al log. */
    clave: string;
  };
}

export interface CrearAfiliacionResponse {
  organizacion: Organizacion;
  /** El primer `admin_organizacion`. Sin el, nadie puede entrar despues. */
  admin: Actor;
}

/** GET /afiliacion/:id/estado */
export interface EstadoAfiliacionResponse {
  id: string;
  estado: EstadoAfiliacion;
  verificacion: VerificacionAfiliacion;
  observaciones: string[];
  actualizadaEn?: string;
}

/** POST /afiliacion/:id/transicion — solo `admin_plataforma`. */
export interface TransicionAfiliacionRequest {
  estado: EstadoAfiliacion;
  /** Obligatorio al observar o suspender: se le dice QUE falta. */
  motivo?: string;
}

/**
 * Una invitacion — como entra el segundo humano de una organizacion (2.5).
 *
 * ⚠️ El token NO esta aqui y nunca lo estara: en base solo vive su hash y en
 *    la respuesta de creacion viaja una sola vez, dentro de `enlace`.
 */
export interface Invitacion {
  id: string;
  organizacionId: string;
  correo: string;
  rol: Rol;
  codigoSede?: string | null;
  expiraEn: string;
  aceptadaEn: string | null;
  revocadaEn?: string | null;
  invitadaPor?: string | null;
  creadaEn: string;
}

/** POST /organizaciones/:id/invitaciones */
export interface CrearInvitacionRequest {
  correo: string;
  rol: Rol;
  codigoSede?: string;
}

export interface CrearInvitacionResponse {
  invitacion: Invitacion;
  /**
   * El enlace con el token en claro. Se devuelve UNA vez y no se repite:
   * en base solo queda el hash.
   *
   * ⚠️ Sin proveedor de correo configurado, esta es la unica forma de que
   *    llegue — es la regla de degradacion del repo, y `enviadoPorCorreo`
   *    dice cual de los dos caminos ocurrio.
   */
  enlace: string;
  enviadoPorCorreo: boolean;
}

/** POST /invitaciones/:token/aceptar — publico, un solo uso. */
export interface AceptarInvitacionRequest {
  nombre: string;
  /** Minimo 12 caracteres. */
  clave: string;
}

export interface AceptarInvitacionResponse {
  actor: Actor;
  organizacion: Organizacion;
}

/** GET /organizaciones/:id/equipo — lo que pinta /panel/equipo. */
export interface EquipoResponse {
  actores: Actor[];
  /** Solo las que siguen vivas: ni aceptadas, ni revocadas, ni vencidas. */
  invitacionesPendientes: Invitacion[];
}

export type PulsoCode =
  | 'PULSO_INVALID_INPUT'
  | 'PULSO_LOW_CONFIDENCE'
  | 'PULSO_INCONSISTENT_TRIAGE'
  | 'PULSO_NO_ELIGIBLE_DESTINATION'
  | 'PULSO_ILLEGAL_TRANSITION'
  /** El token de invitacion vencio (>72 h). Se responde 410 — tarea 2.5. */
  | 'PULSO_INVITACION_EXPIRADA'
  /** El token de invitacion ya se uso. Un solo uso, y 410 — tarea 2.5. */
  | 'PULSO_INVITACION_YA_USADA'
  /** Demasiadas peticiones desde la misma IP a un endpoint publico. 429. */
  | 'PULSO_RATE_LIMITED'
  | 'PULSO_INCOMPLETE_EVIDENCE'
  | 'PULSO_IDEMPOTENCY_CONFLICT'
  | 'PULSO_DESTINATION_ALREADY_ACCEPTED'
  | 'PULSO_INTERNAL';
export type CaseRoutingState = 'validated' | 'requires_human_review' | 'ready_for_matching' | 'matching' | 'escalated_to_crue' | 'dispatched' | 'closed';
export type HandshakeRoutingState = 'pending' | 'accepted' | 'rejected' | 'timed_out';
export interface PulsoErrorEnvelope { error: { code: PulsoCode; message: string; details?: unknown; retryable: boolean } }
export interface IdempotencyInput { idempotencyKey: string }
export interface RoutingDecisionEvidence { caseId: string; modelVersion: string; configVersion: string; inputs: unknown; candidates: unknown[]; selectedDestination: string; etaProvenance: 'mapbox' | 'haversine_fallback'; minuteBreakdown: Record<string, number>; fingerprint: string }
