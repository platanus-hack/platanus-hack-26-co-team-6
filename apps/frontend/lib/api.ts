/**
 * Cliente HTTP hacia core (NestJS).
 *
 * Esta es LA frontera. El front no calcula rutas, no puntúa sedes, no habla
 * con Supabase ni con Mapbox: le pide a core y pinta lo que vuelve.
 *
 * Todas las llamadas salen del navegador, así que la URL tiene que ser pública
 * → NEXT_PUBLIC_API_URL. Ninguna credencial de servidor pasa por aquí.
 *
 * SESIÓN: core exige sesión de operador en todo salvo /health y el webhook de
 * Telegram. La sesión es una cookie HttpOnly que este archivo NUNCA lee — solo
 * pide que el navegador la mande, con `credentials: "include"`. Por eso un XSS
 * en una consola no se puede llevar el token: no está en JS.
 */

import type {
  AtenderEscalamientoResponse,
  Capacidades,
  CatalogoMotivosResponse,
  CanalHandshake,
  Caso,
  Coordenada,
  DispatchResponse,
  EscalarResponse,
  EstadoResponse,
  MatchResponse,
  MotivoEscalamiento,
  RespondResponse,
  RutaResponse,
  TipoMovil,
  TranscribirResponse,
  TriageResponse,
  Unidad,
} from "./types";

const API =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001";

/** Error de core con el mensaje que devolvió, no un "Failed to fetch" pelado. */
/**
 * Códigos de dominio que core devuelve con un 4xx.
 *
 * No son fallos técnicos: son decisiones del motor de ruteo que la pantalla
 * tiene que saber contar. `PULSO_LOW_CONFIDENCE` no es "algo salió mal", es
 * "el sistema no entendió lo suficiente como para mandar una ambulancia".
 */
export type CodigoError =
  /** El parser no llegó a la confianza mínima. Lo arregla el dictado. */
  | "PULSO_LOW_CONFIDENCE"
  /** Triage y hallazgos no concuerdan. Lo arregla el dictado. */
  | "PULSO_INCONSISTENT_TRIAGE"
  /** Ninguna sede cumple el filtro duro. Esto sube al CRUE. */
  | "PULSO_NO_ELIGIBLE_DESTINATION"
  /** Se intentó despachar sin un ranking registrado antes. */
  | "PULSO_INCOMPLETE_EVIDENCE"
  /** Otra sede ya aceptó este caso. */
  | "PULSO_DESTINATION_ALREADY_ACCEPTED"
  /** La solicitud ya no está en un estado que admita esta acción. */
  | "PULSO_ILLEGAL_TRANSITION"
  /** El móvil despachado no puede trasladar lo que el caso requiere (TAM). */
  | "PULSO_MOVIL_INCOMPATIBLE";

export class ErrorApi extends Error {
  readonly status: number;
  /** Presente solo cuando core devolvió un error de dominio. */
  readonly codigo?: CodigoError;

  // Campos declarados y asignados a mano, sin `readonly` en los parámetros del
  // constructor: esa azúcar es TypeScript puro y Node no puede limitarse a
  // borrar los tipos para ejecutar el archivo. Este es el precio de que
  // `api.test.mts` pueda cargar esta frontera sin runner ni bundler.
  constructor(message: string, status: number, codigo?: CodigoError) {
    super(message);
    this.name = "ErrorApi";
    this.status = status;
    this.codigo = codigo;
  }
}

/** Se dispara en un 401. La monta <Sesion> para mandar al login sin recargar. */
export type AlExpirar = () => void;
let alExpirar: AlExpirar | null = null;

/**
 * Registra (o quita) el gancho de sesión perdida.
 *
 * Registrar uno nuevo rearma el aviso: a este oyente todavía no se le ha dicho
 * nada. Sin esto, un proveedor que remonta tras la caída se quedaría sordo para
 * siempre porque otro ya consumió el único aviso.
 */
export function alPerderSesion(fn: AlExpirar | null): void {
  alExpirar = fn;
  if (fn) perdidaAvisada = false;
}

/**
 * Renovación silenciosa (tarea 1.4).
 *
 * El access dura 15 minutos; el refresh, 30 días. Un turno de 12 h cruza
 * 48 fronteras de access: si cada una sacara al paramédico al login, el
 * modelo de tokens cortos sería inusable. Ante un 401 pedimos un access
 * nuevo UNA vez y reintentamos la petición original UNA vez.
 *
 * Las dos reglas que hacen que esto no sea una bomba:
 *
 *   1. UNA sola renovación en vuelo. Cinco peticiones que fallan a la vez
 *      comparten la misma promesa: un refresh, no cinco.
 *   2. Si el refresh falla, `agotado` corta en seco. Un bucle de refresh
 *      fallido es una tormenta de peticiones JUSTO cuando el servidor
 *      está mal — el escenario donde menos ayuda.
 *
 *   3. El aviso al login se da UNA vez. La consola tiene varias peticiones en
 *      vuelo a la vez (estado, capacidades, posición): si cada 401 llamara al
 *      gancho, `<Sesion>` haría cinco `router.replace` seguidos.
 *
 * Core sin /auth/refresh (hoy) devuelve 404: `ok` es false, `agotado` se
 * enciende y el comportamiento es idéntico al de antes de esta tarea.
 */
let renovacionEnCurso: Promise<boolean> | null = null;
let renovacionAgotada = false;
let perdidaAvisada = false;

async function renovar(): Promise<boolean> {
  if (renovacionAgotada) return false;

  renovacionEnCurso ??= fetch(`${API}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      renovacionEnCurso = null;
    });

  const ok = await renovacionEnCurso;
  if (!ok) renovacionAgotada = true;
  return ok;
}

/**
 * Una respuesta buena significa que la sesión volvió a estar viva: el próximo
 * corte merece su propio intento de renovación y su propio aviso, no el
 * silencio del corte anterior.
 *
 * Es también el único reinicio que necesita `api.test.mts`: una petición que
 * sale bien deja el módulo como recién cargado, sin exponer las banderas ni
 * obligar a recargar el módulo entre test y test.
 */
function rearmar(): void {
  renovacionAgotada = false;
  perdidaAvisada = false;
}

/**
 * El 401 sobrevivió a la renovación. Se avisa una vez y se lanza siempre:
 * quien llamó tiene que enterarse de que su petición no trajo datos, aunque el
 * aviso al login ya lo hubiera dado otra petición de la misma tanda.
 */
function sesionPerdida(): never {
  if (!perdidaAvisada) {
    perdidaAvisada = true;
    alExpirar?.();
  }
  throw new ErrorApi("Sesión expirada", 401);
}

/**
 * Rutas donde un 401 es LA RESPUESTA, no una sesión vencida.
 *
 * En `/auth/login` un 401 significa "esa contraseña no es". Tratarlo como
 * expiración hace tres cosas mal a la vez: gasta un `POST /auth/refresh` por
 * cada contraseña mal tecleada, **quema la renovación para el resto de la
 * consola** (queda agotada hasta la siguiente respuesta buena), y llama al
 * gancho que manda al login estando ya en el login.
 *
 * `/auth/refresh` no está en la lista porque no pasa por `pedir`; se deja
 * escrito igual para que quien lo mueva aquí no reinvente el bucle.
 */
const AUTH_SIN_RENOVACION = new Set([
  "/auth/login",
  "/auth/refresh",
  "/auth/organizacion",
  "/auth/recuperar",
]);

/**
 * Clave de idempotencia — tarea 2.11.
 *
 * La clave identifica la acción, no la petición: el mismo despacho
 * reintentado tres veces lleva la misma clave las tres, y core ejecuta
 * **una**. Por eso se construye a partir de lo que hace única a la acción
 * (el caso, la sede) y NO con un aleatorio por intento: un `randomUUID()`
 * en cada reintento es exactamente el bug que esto viene a cerrar.
 */
export function claveIdempotencia(...partes: string[]): string {
  return partes.join(":");
}

/**
 * La única puerta de salida hacia core.
 *
 * Se exporta —además de usarse aquí abajo— porque este archivo ya es el más
 * compartido del frontend y crecer por acumulación lo vuelve un cuello de
 * botella: cada consola nueva lo tocaba y cada merge chocaba aquí. Los
 * clientes por dominio (`lib/api-capacidad.ts`, `lib/api-equipo.ts`, …) viven
 * en su propio archivo e importan esto.
 *
 * Lo que NO se duplica en esos archivos, y por eso pasan por aquí:
 * `credentials: "include"`, la renovación silenciosa de un solo intento, y la
 * lectura de los dos formatos de error de core. Un `fetch` suelto en otro
 * módulo se salta las tres.
 */
export async function pedir<T>(
  ruta: string,
  init?: RequestInit & { clave?: string },
  /** Interno: marca que esta llamada YA es el reintento tras renovar. */
  reintento = false,
): Promise<T> {
  const res = await fetch(`${API}${ruta}`, {
    ...init,
    // Sin esto el navegador no manda la cookie de sesión a otro puerto y core
    // responde 401 a todo. Es el único cambio que la autenticación exige aquí.
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      // Tarea 2.11: la clave identifica la ACCIÓN. Reintentar con la misma
      // clave ejecuta una sola vez en core.
      ...(init?.clave ? { "Idempotency-Key": init.clave } : {}),
      ...init?.headers,
    },
  });

  // Un 401 en las rutas de credenciales no se renueva ni saca a nadie: cae al
  // manejo de errores de abajo y llega a la pantalla con su mensaje.
  if (res.status === 401 && !AUTH_SIN_RENOVACION.has(ruta.split("?")[0])) {
    // Reintentar es seguro incluso en un POST: el 401 lo puso el guard, la
    // petición nunca llegó al handler. No hay nada que se pueda duplicar.
    if (!reintento && (await renovar())) return pedir<T>(ruta, init, true);

    // Se agotó la renovación (o no había). Avisamos una vez en vez de dejar la
    // consola en un bucle de polling que falla en silencio.
    sesionPerdida();
  }

  if (res.ok) rearmar();

  if (!res.ok) {
    // Core habla en DOS formatos de error y hay que entender los dos:
    //
    //   Nest        { statusCode, message, error }   validación, 404, 401
    //   dominio     { error: { code, message } }     decisiones del ruteo
    //
    // Leer solo el primero era el motivo de que un caso bloqueado por baja
    // confianza llegara a la pantalla como "core respondió 400": el mensaje
    // venía anidado y nadie lo miraba.
    const cuerpo = await res.json().catch(() => null);

    const dominio = cuerpo?.error;
    if (dominio?.code) {
      throw new ErrorApi(
        dominio.message ?? `core respondió ${res.status}`,
        res.status,
        dominio.code as CodigoError,
      );
    }

    const detalle = Array.isArray(cuerpo?.message)
      ? cuerpo.message.join(", ")
      : cuerpo?.message;
    throw new ErrorApi(detalle ?? `core respondió ${res.status}`, res.status);
  }

  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────

/**
 * Dictado → caso.
 *
 * La clave la pone QUIEN LLAMA y no se deriva del texto: dos pacientes con el
 * mismo cuadro en la misma esquina son dos emergencias, y colisionarlas haría
 * desaparecer la segunda en silencio. `/campo` usa una clave por intento de
 * dictado, que es la unidad real de "acción" aquí.
 */
export function triage(
  cuerpo: {
    texto: string;
    origen?: Coordenada;
    tipoMovil?: TipoMovil;
    unidad?: Unidad;
    /**
     * Con esto, una extracción floja vuelve como caso + `revision.requerida`
     * en vez de 4xx: la consola tiene a un humano delante que puede corregir
     * y confirmar. Sin la bandera, el error de siempre.
     */
    permitirRevision?: boolean;
  },
  clave?: string,
): Promise<TriageResponse> {
  return pedir<TriageResponse>("/triage", {
    method: "POST",
    body: JSON.stringify(cuerpo),
    clave,
  });
}

export function match(cuerpo: {
  caso: Caso;
  limite?: number;
  radioKm?: number;
}): Promise<MatchResponse> {
  return pedir<MatchResponse>("/match", {
    method: "POST",
    body: JSON.stringify(cuerpo),
  });
}

/**
 * Dispara el handshake.
 *
 * Lleva clave de idempotencia derivada de caso + sede: es la mutación donde
 * un duplicado se nota más — dos handshakes al mismo hospital por el mismo
 * paciente, y un jefe de urgencias viendo dos tarjetas idénticas.
 */
export function dispatch(cuerpo: {
  casoId: string;
  sedeCodigo: string;
  canal?: CanalHandshake;
}): Promise<DispatchResponse> {
  return pedir<DispatchResponse>("/dispatch", {
    method: "POST",
    body: JSON.stringify(cuerpo),
    clave: claveIdempotencia("dispatch", cuerpo.casoId, cuerpo.sedeCodigo),
  });
}

export function responder(cuerpo: {
  handshakeId: string;
  decision: "aceptado" | "rechazado";
  /** Etiqueta que vio quien respondió. Se guarda congelada. */
  motivo?: string;
  /** Código del catálogo — tarea 0.6. Es LO QUE SE AGREGA después. */
  motivoCodigo?: string;
}): Promise<RespondResponse> {
  return pedir<RespondResponse>("/handshake/respond", {
    method: "POST",
    body: JSON.stringify(cuerpo),
    // handshake + decisión: el doble toque del jefe de urgencias es un solo
    // efecto, igual que en el guard de aceptación única (0.1).
    clave: claveIdempotencia(
      "respond",
      cuerpo.handshakeId,
      cuerpo.decision,
    ),
  });
}

/**
 * Catálogo versionado de motivos de rechazo — tarea 0.6.
 *
 * La consola NO lleva los motivos escritos adentro. Los pide, guarda el
 * `codigo` y pinta la `etiqueta`: así, corregir una palabra es un deploy de
 * core y no parte la serie histórica de aceptación, que es el activo.
 */
export function catalogoMotivosRechazo(): Promise<CatalogoMotivosResponse> {
  return pedir<CatalogoMotivosResponse>("/catalogo/motivos-rechazo");
}

/**
 * Línea de tiempo de un caso — tarea 3.1.
 *
 * `evento_caso` es append-only: nada de lo que sale de aquí se puede editar.
 * Una corrección es un evento nuevo que apunta al anterior.
 */
export function eventosCaso(casoId: string): Promise<{ eventos: EventoCaso[] }> {
  return pedir(`/casos/${encodeURIComponent(casoId)}/eventos`, {
    cache: "no-store",
  });
}

/**
 * Registra un evento que solo un humano sabe — tarea 3.2.
 *
 * Core acepta una lista corta de tipos por esta puerta (`override_crue`,
 * llegadas, entrega, demora reportada, cierre). Todo lo demás lo escribe el
 * servidor desde su transición real: un `POST` abierto a los 22 tipos dejaría
 * que una consola escribiera "aceptado" sin que nadie haya aceptado nada.
 *
 * **La firma es el actor de la sesión**, no lo que diga el cuerpo.
 */
export function registrarEventoCaso(
  casoId: string,
  cuerpo: {
    tipo: string;
    detalle?: Record<string, unknown>;
    codigoSede?: string;
    movilId?: string;
    claveIdempotencia?: string;
    corrigeA?: number;
  },
): Promise<{ evento: EventoCaso | null }> {
  return pedir(`/casos/${encodeURIComponent(casoId)}/eventos`, {
    method: "POST",
    body: JSON.stringify(cuerpo),
    clave: cuerpo.claveIdempotencia,
  });
}

/**
 * Dónde se recoge al paciente de UN caso.
 *
 * `origen` no viaja en `/estado` (lista blanca de `despojar()`); este es el
 * endpoint por caso con su propia autorización que el contrato dejó previsto.
 * Quien lo llama nombra un caso concreto y pasa por el guard — no es re-abrir
 * el listado.
 */
export function origenCaso(
  casoId: string,
): Promise<{ casoId: string; origen: Coordenada }> {
  return pedir(`/casos/${encodeURIComponent(casoId)}/origen`, {
    cache: "no-store",
  });
}

export function estado(casoId?: string): Promise<EstadoResponse> {
  const query = casoId ? `?casoId=${encodeURIComponent(casoId)}` : "";
  return pedir<EstadoResponse>(`/estado${query}`, { cache: "no-store" });
}

// ── Escalamiento al CRUE ─────────────────────────────────────────

/**
 * Pasa el caso a un regulador humano.
 *
 * Se llama cuando el ranking vuelve vacío, cuando se agotan los candidatos, o
 * cuando la tripulación lo pide. Es idempotente por caso en el servidor: si ya
 * hay un escalamiento abierto devuelve ese mismo, así que llamarlo dos veces
 * desde dos caminos distintos no duplica nada en el tablero del CRUE.
 */
export function escalar(cuerpo: {
  casoId: string;
  motivo: MotivoEscalamiento;
  detalle?: string;
}): Promise<EscalarResponse> {
  return pedir<EscalarResponse>("/escalamiento", {
    method: "POST",
    body: JSON.stringify(cuerpo),
    clave: claveIdempotencia("escalar", cuerpo.casoId, cuerpo.motivo),
  });
}

/** Lo llama /crue cuando un regulador toma el caso. */
export function atenderEscalamiento(cuerpo: {
  escalamientoId: string;
  atendidoPor?: string;
}): Promise<AtenderEscalamientoResponse> {
  return pedir<AtenderEscalamientoResponse>("/escalamiento/atender", {
    method: "POST",
    body: JSON.stringify(cuerpo),
  });
}

// ── Capacidades y voz ────────────────────────────────────────────

/** En qué modo corre cada integración. Lo lee la barra persistente. */
export function capacidades(): Promise<Capacidades> {
  return pedir<Capacidades>("/capacidades", { cache: "no-store" });
}

/**
 * Manda un audio grabado y devuelve lo que se entendió.
 *
 * Es el camino del dictado para los navegadores SIN Web Speech API — Firefox
 * y Safari/iOS, que no son casos raros. También es el único que sobrevive a
 * una zona muerta: el Blob se puede guardar y reintentar.
 *
 * No pasa por `pedir`: el cuerpo es binario, así que no lleva
 * `Content-Type: application/json` — el tipo real del audio ES lo que le dice
 * al proveedor cómo decodificarlo.
 */
export async function transcribir(
  audio: Blob,
  reintento = false,
): Promise<TranscribirResponse> {
  const res = await fetch(`${API}/voz/transcribir`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": audio.type || "audio/webm" },
    body: audio,
  });

  // Un dictado perdido por un access vencido es un dictado que hay que repetir
  // en la escena. Renovamos y reintentamos igual que en `pedir`, y con las
  // MISMAS tres reglas: `reintento` corta el bucle aunque el segundo intento
  // también dé 401, `renovar()` devuelve false en seco si ya se agotó, y el
  // aviso al login lo da `sesionPerdida()` una sola vez.
  if (res.status === 401 && !reintento && (await renovar())) {
    return transcribir(audio, true);
  }

  if (res.status === 401) sesionPerdida();
  if (res.ok) rearmar();

  if (!res.ok) {
    const detalle = await res
      .json()
      .then((j) => (Array.isArray(j?.message) ? j.message.join(", ") : j?.message))
      .catch(() => null);
    throw new ErrorApi(detalle ?? `core respondió ${res.status}`, res.status);
  }

  return res.json() as Promise<TranscribirResponse>;
}

/**
 * Cómo llegar a la sede aceptada: geometría para el mapa y maniobras en
 * español para quien conduce.
 *
 * Lanza ErrorApi 503 si core no tiene MAPBOX_TOKEN. Eso no es un error que
 * mostrar en rojo: significa "no puedo trazar la ruta", y quien llame debe
 * ofrecer abrir la navegación del teléfono.
 */
export function ruta(cuerpo: {
  origen: Coordenada;
  sedeCodigo: string;
}): Promise<RutaResponse> {
  return pedir<RutaResponse>("/ruta", {
    method: "POST",
    body: JSON.stringify(cuerpo),
  });
}

/**
 * ¿Está core vivo?
 *
 * No usa `pedir` a propósito: /health es la única ruta pública, no necesita
 * cookie, y sobre todo NO debe disparar el callback de sesión expirada — este
 * ping corre cada pocos segundos en la barra y un 401 aquí mandaría al
 * paramédico al login en mitad de un caso.
 */
export async function vivo(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Una fila de `evento_caso`. Espejo de `core/src/eventos/tipos.ts` — tarea 3.1.
 *
 * No vive en `lib/types.ts` por lo mismo que `ActorSesion`: `contracts/types.ts`
 * recibe los tipos de evento en el PR de tipos de la ola 3, y ese es el sitio
 * correcto. Aquí está lo mínimo que la UI necesita para pintar una línea de
 * tiempo.
 */
export interface EventoCaso {
  id: number;
  casoId: string;
  tipo: string;
  actorId: string | null;
  movilId: string | null;
  codigoSede: string | null;
  detalle: Record<string, unknown>;
  ocurridoEn: string;
  /** Id del evento que este corrige. El original NO se borra. */
  corrigeA: number | null;
}

// ── Sesión ───────────────────────────────────────────────────────

/**
 * Lo que devuelve un login.
 *
 * `requiereOrganizacion` es el caso límite 1 de multitenancy §7: un correo con
 * actor en dos organizaciones (un médico que trabaja en dos IPS). No se elige
 * por él ni se toma la primera: se pregunta.
 */
export interface LoginResponse {
  ok: true;
  expiraEn?: number;
  requiereOrganizacion?: boolean;
  organizaciones?: { id: string; nombre?: string }[];
}

/**
 * Login con identidad real (tarea 1.3).
 *
 * Core sin el modelo de actores todavía ignora `correo` y valida solo
 * `password`; por eso mandamos los dos campos y no dos endpoints distintos.
 */
export function login(credenciales: {
  correo: string;
  password: string;
}): Promise<LoginResponse> {
  return pedir("/auth/login", {
    method: "POST",
    body: JSON.stringify(credenciales),
  });
}

/**
 * Login con la contraseña de turno (`PULSO_AUTH_LEGACY=true`).
 *
 * Sigue existiendo a propósito: es lo que permite que el demo entre mientras
 * el modelo de identidad aterriza. Cuando 1.3 esté en todos los entornos, esto
 * se borra junto con la variable.
 */
export function loginTurno(password: string): Promise<LoginResponse> {
  return pedir("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

/** Elige organización cuando el correo tiene actor en varias. */
export function elegirOrganizacion(
  organizacionId: string,
): Promise<LoginResponse> {
  return pedir("/auth/organizacion", {
    method: "POST",
    body: JSON.stringify({ organizacionId }),
  });
}

/**
 * Pide el correo de recuperación.
 *
 * DOS REGLAS QUE SE CRUZAN, Y NINGUNA CEDE:
 *
 * 1. **No decir si la cuenta existe.** El servidor responde 200 exista o no, y
 *    esta función nunca mira el cuerpo. Un endpoint que distingue es un buscador
 *    de correos válidos, y el directorio de un hospital está en su web.
 *
 * 2. **No decir que se envió un correo que no se envió.** Hoy core no tiene
 *    `/auth/recuperar` (llega con 1.3): responde 404. Tragarse ese 404 y pintar
 *    "revisa tu bandeja" sería mentirle a alguien que se quedó fuera del
 *    sistema a las 3 a.m. La regla 2 del repo dice que todo degrada **y lo
 *    dice**; esto es exactamente eso.
 *
 * Ninguno de los motivos filtra nada: 404 y "core no responde" son idénticos
 * para todos los correos del mundo.
 */
export type ResultadoRecuperar =
  | { enviado: true }
  | { enviado: false; motivo: "no-construido" | "sin-core" };

export async function recuperar(correo: string): Promise<ResultadoRecuperar> {
  try {
    await pedir("/auth/recuperar", {
      method: "POST",
      body: JSON.stringify({ correo }),
    });
    return { enviado: true };
  } catch (err) {
    const noExiste = err instanceof ErrorApi && (err.status === 404 || err.status === 501);
    return { enviado: false, motivo: noExiste ? "no-construido" : "sin-core" };
  }
}

export function logout(): Promise<{ ok: true }> {
  return pedir("/auth/logout", { method: "POST" });
}

/**
 * ¿Quién soy?
 *
 * Público en core: nunca devuelve el token, y el front lo necesita ANTES de
 * tener sesión para decidir si pinta la consola o el login.
 *
 * Devuelve `unknown` a propósito: quien normaliza es `lib/sesion.ts`, que sabe
 * leer las dos formas (la de la contraseña de turno y la del actor real) sin
 * que un campo nuevo de core rompa el runtime de las consolas.
 */
export function sesion(): Promise<unknown> {
  return pedir("/auth/sesion", { cache: "no-store" });
}
