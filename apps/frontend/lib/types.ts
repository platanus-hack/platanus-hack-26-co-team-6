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
 *  Y ya no depende de la memoria de nadie: `node scripts/verificar-tipos.mts`
 *  compara la estructura de los dos archivos y falla nombrando el tipo que
 *  divergió. Corre en CI y antes de `task build`.
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

/**
 * La unidad que atiende el caso.
 *
 * La sesión de core es una contraseña compartida por turno: NO hay usuarios.
 * Esto es trazabilidad operativa, no autenticación — el móvil se declara desde
 * /campo y viaja pegado al caso para que el regulador del CRUE sepa qué
 * ambulancia está preguntando.
 *
 * No lo uses para autorizar nada: quien tiene la contraseña del turno puede
 * escribir el id que quiera.
 */
export interface Unidad {
  /** Identificador del móvil, ej "AMB-014". Es lo que ve el regulador. */
  id: string;
  /** Quién opera. Opcional: la sesión es por turno, no por persona. */
  tripulante?: string;
}

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
  /**
   * Telefono desde el que se reporto, si entro por WhatsApp. Es lo que
   * permite avisarle al paramedico cuando el hospital responde.
   */
  telefonoReporta?: string | null;
  /** El dictado literal, sin tocar. Se conserva para auditoría. */
  textoCrudo: string;
  origen: Coordenada;
  tipoMovil: TipoMovil;
  /** Móvil que atiende. null si /campo no la declaró. Viaja al CRUE. */
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
export type CasoPublico = Omit<Caso, "textoCrudo" | "origen">;

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

/**
 * Categoría del motivo de rechazo — tarea 0.6.
 *
 * `administrativo` es la que sostiene la tesis: un rebote por falta de cama y
 * uno por falta de claridad del pagador son problemas distintos, y hasta hoy
 * se contaban juntos.
 */
export type CategoriaMotivoRechazo =
  | "capacidad"
  | "recurso_humano"
  | "tecnico"
  | "administrativo";

/** Una entrada del catálogo `motivo_rechazo`. El `codigo` es inmutable. */
export interface MotivoRechazoCatalogo {
  codigo: string;
  /** Editable: cambiarla NO parte la serie histórica. */
  etiqueta: string;
  categoria: CategoriaMotivoRechazo;
  version: number;
  /** false = ya no se ofrece, pero el histórico lo sigue resolviendo. */
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
   * Código del catálogo `motivo_rechazo` — tarea 0.6. ESTE es el campo que se
   * agrega y se reporta; `motivoRechazo` es la etiqueta congelada al momento
   * del rechazo y solo se conserva para no romper lo que ya la pinta.
   */
  motivoCodigo?: string | null;
  enviadoEn: string;
  /**
   * Cuándo esta solicitud deja de esperar y pasa a 'timeout'.
   *
   * Lo sella el servidor al despachar y viaja hasta aquí para que la pantalla
   * de solicitud en curso cuente contra el MISMO instante que va a usar core.
   * No inventes el plazo en el cliente: la barra llegaría a cero mientras el
   * servidor sigue esperando, y el paramédico vería una cuenta que miente.
   */
  expiraEn: string;
  respondidoEn: string | null;
  latenciaS: number | null;
  /**
   * ETA en minutos al momento de despachar. Es la LINEA BASE contra la que
   * se mide si el traslado se esta demorando.
   */
  etaMinAlDespachar?: number | null;
  /** Ya se disparo la llamada de seguimiento por demora. */
  demoraAvisada?: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Escalamiento al CRUE
// ─────────────────────────────────────────────────────────────────

/**
 * Por qué este caso dejó de resolverse solo.
 *  sin-candidatos        el match no devolvió ni una sede elegible
 *  candidatos-agotados   todas rechazaron o dejaron vencer la solicitud
 *  solicitud-paramedico  lo pidió la tripulación (botón en /campo)
 */
export type MotivoEscalamiento =
  | "sin-candidatos"
  | "candidatos-agotados"
  | "solicitud-paramedico";

/**
 * Un caso que el ruteo automático no pudo cerrar y pasa a un regulador humano.
 *
 * Es lo que /campo pinta en vez de una lista vacía. Sin esto, cuando el
 * ranking sale sin candidatos el paramédico queda solo frente a la pantalla
 * con un paciente en la camilla — el escenario que PULSO dice eliminar,
 * reproducido en una interfaz nueva.
 */
export interface Escalamiento {
  id: string;
  casoId: string;
  motivo: MotivoEscalamiento;
  /** Sedes que ya dijeron que no. Lo primero que el regulador necesita. */
  sedesIntentadas: string[];
  detalle: string | null;
  creadoEn: string;
  /** null mientras nadie del CRUE lo haya tomado. */
  atendidoEn: string | null;
  atendidoPor: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Capacidades — qué puede hacer el sistema AHORA MISMO
// ─────────────────────────────────────────────────────────────────

/**
 * Estado real de las integraciones. Lo pinta la barra persistente de /campo.
 *
 * Core degrada solo cuando falta una credencial (sin Mapbox el ETA se estima
 * por distancia, sin Claude el triage cae a palabras clave), y hasta ahora esa
 * degradación era invisible: un ETA estimado se veía idéntico a uno con
 * tráfico real. Esto es lo que permite decirlo.
 */
export interface Capacidades {
  /** llm = Claude extrae. heuristico = palabras clave (confianza 0.35). */
  ia: "llm" | "heuristico";
  /** trafico = Mapbox Matrix. estimado = distancia / velocidad media. */
  ruteo: "trafico" | "estimado";
  /**
   * De dónde sale la transcripción del dictado.
   *  ai-core     el audio se manda al servicio de IA (POST /v1/transcribir)
   *  navegador   Web Speech API — NO existe en Safari/iOS, ahí no hay dictado
   */
  voz: "ai-core" | "navegador";
  /** Canal por el que sale el handshake si no se pide otro. */
  canal: CanalHandshake;
  /** supabase = catálogo REPS en DB. semillas = catálogo compilado. */
  datos: "supabase" | "semillas";
  /** Segundos que espera una solicitud antes de vencer. */
  handshakeTimeoutS: number;
  ts: string;
}

// ─────────────────────────────────────────────────────────────────
// RESPUESTAS DE CORE
// Las firmas exactas de apps/backend/core. No improvisar.
// ─────────────────────────────────────────────────────────────────

/** POST {API}/triage */
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
/**
 * Códigos de dominio de core. Espejo de `PulsoCode` — tarea 0.1.
 *
 * No son fallos técnicos: son decisiones del motor de ruteo que la pantalla
 * tiene que saber contar. `lib/api.ts` declara `CodigoError` con el
 * subconjunto que hoy llega por un 4xx; este es el conjunto completo, porque
 * `RespondResponse.codigo` viaja dentro de un 200.
 */

// ─────────────────────────────────────────────────────────────────
// Afiliación, organizaciones e identidad — OLA 2 (Juan: 2.1, 2.5, 2.9)
//
// Espejo de `core/src/contracts/types.ts`. El razonamiento largo de cada
// campo vive allá; aquí queda lo que la pantalla necesita saber.
// `node scripts/verificar-tipos.mts` compara los dos.
// ─────────────────────────────────────────────────────────────────

/** Contra qué se autoverifica: `ips` cruza el REPS, `operador_ambulancia` el catálogo TAB/TAM. */
export type TipoOrganizacion =
  | "ips"
  | "operador_ambulancia"
  | "crue"
  | "entidad_pagadora";

/** Máquina de estados de la afiliación. **Solo `activa` es despachable.** */
export type EstadoAfiliacion =
  | "borrador"
  | "enviada"
  | "en_verificacion"
  | "observada"
  | "aprobada"
  | "activa"
  | "suspendida"
  | "retirada";

export type VerificacionAfiliacion = "reps_automatico" | "manual" | "pendiente";

/**
 * Los roles del sistema. Es lo que decide a dónde redirige `/entrar` tras
 * el login (tarea 1.4) y qué pinta `/panel`.
 */
export type Rol =
  | "paramedico"
  | "jefe_urgencias"
  | "admin_organizacion"
  | "regulador_crue"
  | "auditor"
  | "admin_plataforma"
  | "servicio";

/** La entidad jurídica afiliada. El inquilino. */
export interface Organizacion {
  id: string;
  tipo: TipoOrganizacion;
  razonSocial: string;
  nombreCorto?: string | null;
  nit: string;
  estado: EstadoAfiliacion;
  verificacion: VerificacionAfiliacion;
  /** Códigos REPS de 12 dígitos. Vacío para un operador de ambulancias. */
  sedes: string[];
  /** Por qué quedó `observada`. Es lo que se le muestra al afiliado. */
  observaciones?: string[];
  creadaEn: string;
  actualizadaEn?: string;
}

/** Una persona o un servicio. Nunca se borra: se desactiva. */
export interface Actor {
  id: string;
  organizacionId: string;
  nombre: string;
  roles: Rol[];
  /** Códigos de sede. Vacío = toda la organización. */
  sedes: string[];
  tipo: "humano" | "servicio";
  /** false = desactivado. Se pinta "Nombre (inactivo)", no se esconde. */
  activo?: boolean;
  ultimoAcceso?: string | null;
}

/**
 * Lo que el REPS ya sabe y el afiliado NO tipea: lo confirma o lo corrige.
 *
 * No trae `nombre` a propósito — ese se muestra aparte, en grande. Ver que
 * PULSO encontró SU sede es el momento que vende el producto.
 */
export interface PrecargaSede {
  direccion: string;
  coord: Coordenada;
  localidad: string | null;
  naturaleza: Sede["naturaleza"];
  complejidad: Complejidad;
  telefono: string | null;
  servicios: CodServicio[];
  camas: CamaSede[];
}

/** Lo mismo para un operador de transporte asistencial (tarea 2.9). */
export interface PrecargaOperador {
  prestador: string;
  direccion: string;
  telefono: string | null;
  correo: string | null;
  /** La marca TAB/TAM del corte oficial. Después alimenta `movil.tipo`. */
  tiposMovil: TipoMovil[];
  urgencias: boolean;
}

/** POST {API}/afiliacion/verificar */
export interface VerificarAfiliacionRequest {
  tipo: TipoOrganizacion;
  /** 12 dígitos. Obligatorio para `ips`. */
  codigoHabilitacion?: string;
  nit: string;
  razonSocial?: string;
}

/**
 * `encontrada: false` llega en un **200**, no en un 404: trae el motivo
 * específico y la pantalla lo muestra tal cual.
 */
export interface VerificarAfiliacionResponse {
  encontrada: boolean;
  /** Existe pero el nombre no cuadra: va a revisión humana. */
  requiereRevision?: boolean;
  estadoSugerido: EstadoAfiliacion;
  verificacion: VerificacionAfiliacion;
  sede?: Sede;
  precarga?: PrecargaSede;
  operador?: PrecargaOperador;
  /** 0..1. Útil para explicarle al afiliado por qué pide revisión. */
  similitud?: number;
  motivo?: string;
}

/** POST {API}/afiliacion */
export interface CrearAfiliacionRequest {
  tipo: TipoOrganizacion;
  nit: string;
  razonSocial: string;
  nombreCorto?: string;
  sedes?: string[];
  admin: {
    nombre: string;
    correo: string;
    /** Mínimo 12 caracteres. Nunca se guarda en el cliente. */
    clave: string;
  };
}

export interface CrearAfiliacionResponse {
  organizacion: Organizacion;
  admin: Actor;
}

/** GET {API}/afiliacion/:id/estado */
export interface EstadoAfiliacionResponse {
  id: string;
  estado: EstadoAfiliacion;
  verificacion: VerificacionAfiliacion;
  observaciones: string[];
  actualizadaEn?: string;
}

/** POST {API}/afiliacion/:id/transicion — solo `admin_plataforma`. */
export interface TransicionAfiliacionRequest {
  estado: EstadoAfiliacion;
  /** Obligatorio al observar o suspender. */
  motivo?: string;
}

/** Una invitación. **El token no está aquí**: en base solo vive su hash. */
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

/** POST {API}/organizaciones/:id/invitaciones */
export interface CrearInvitacionRequest {
  correo: string;
  rol: Rol;
  codigoSede?: string;
}

export interface CrearInvitacionResponse {
  invitacion: Invitacion;
  /**
   * El enlace con el token en claro. Llega **una** vez.
   *
   * Sin proveedor de correo, esta es la única forma de que llegue: la
   * pantalla lo muestra para copiar. `enviadoPorCorreo` dice cuál pasó.
   */
  enlace: string;
  enviadoPorCorreo: boolean;
}

/** POST {API}/invitaciones/:token/aceptar — público, un solo uso. */
export interface AceptarInvitacionRequest {
  nombre: string;
  /** Mínimo 12 caracteres. */
  clave: string;
}

export interface AceptarInvitacionResponse {
  actor: Actor;
  organizacion: Organizacion;
}

/** GET {API}/organizaciones/:id/equipo — lo que pinta `/panel/equipo`. */
export interface EquipoResponse {
  actores: Actor[];
  /** Ni aceptadas, ni revocadas, ni vencidas. */
  invitacionesPendientes: Invitacion[];
}

export type PulsoCode =
  | "PULSO_INVALID_INPUT"
  | "PULSO_LOW_CONFIDENCE"
  | "PULSO_INCONSISTENT_TRIAGE"
  | "PULSO_NO_ELIGIBLE_DESTINATION"
  | "PULSO_ILLEGAL_TRANSITION"
  /** Token de invitación vencido (>72 h). Llega en un 410 — tarea 2.5. */
  | "PULSO_INVITACION_EXPIRADA"
  /** Token de invitación ya usado. Un solo uso, y 410 — tarea 2.5. */
  | "PULSO_INVITACION_YA_USADA"
  /** Demasiadas peticiones desde la misma IP. Llega en un 429. */
  | "PULSO_RATE_LIMITED"
  | "PULSO_INCOMPLETE_EVIDENCE"
  | "PULSO_IDEMPOTENCY_CONFLICT"
  | "PULSO_DESTINATION_ALREADY_ACCEPTED"
  | "PULSO_INTERNAL";

export interface RespondResponse {
  handshake: Handshake;
  /** Congestión de la sede DESPUÉS de procesar la respuesta. */
  congestionActualizada: number;
  /**
   * false = la respuesta NO cambió nada porque la solicitud ya estaba resuelta
   * (doble toque) o ya había vencido.
   *
   * MÍRALO antes de decirle a alguien que el traslado quedó aceptado.
   */
  aplicada: boolean;
  /**
   * Por qué NO se aplicó. Solo viaja con `aplicada: false` — tarea 0.1.
   *
   * El caso que importa no se ve en `handshake.estado`: el handshake sigue
   * en 'enviado' y lo que cambió es que OTRA sede ya aceptó este caso
   * (`PULSO_DESTINATION_ALREADY_ACCEPTED`). Sin este campo la pantalla decía
   * "esta solicitud ya estaba enviado", que no le dice nada a quien acaba de
   * tocar el botón.
   */
  codigo?: PulsoCode;
}

/** POST {API}/escalamiento */
export interface EscalarResponse {
  escalamiento: Escalamiento;
}

/** POST {API}/escalamiento/atender */
export interface AtenderEscalamientoResponse {
  escalamiento: Escalamiento;
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

/**
 * POST {API}/voz/transcribir — audio grabado → texto.
 *
 * El cuerpo de la petición es el audio BINARIO con su Content-Type real.
 */
export interface TranscribirResponse {
  texto: string;
  /** Quién transcribió: "deepgram", "elevenlabs"… */
  proveedor: string;
  latenciaMs: number;
}

/** Una maniobra del trayecto, ya en español. */
export interface PasoNavegacion {
  /** "Gire a la derecha hacia la Avenida Caracas" */
  instruccion: string;
  distanciaM: number;
  duracionS: number;
  /** 'turn', 'merge', 'arrive'… La UI elige el icono con esto. */
  maniobra: string | null;
  /** 'left', 'right', 'straight'… Complementa a `maniobra`. */
  direccion: string | null;
  /** Nombre de la vía, si Mapbox lo conoce. */
  via: string | null;
}

/** POST {API}/ruta — cómo llegar a la sede aceptada. */
export interface RutaResponse {
  /** GeoJSON LineString para pintar el trazado. */
  geometria: {
    type: "LineString";
    coordinates: [number, number][];
  };
  distanciaM: number;
  duracionS: number;
  pasos: PasoNavegacion[];
  destino: {
    codigo: string;
    nombre: string;
    direccion: string;
    telefono: string | null;
    coord: Coordenada;
  };
}

/** GET {API}/estado */
export interface EstadoResponse {
  casos: CasoPublico[];
  handshakes: Handshake[];
  congestion: CongestionSede[];
  /** Casos que el ruteo automático no cerró y esperan a un regulador. */
  escalamientos: Escalamiento[];
  ts: string;
}
