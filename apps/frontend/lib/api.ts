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
  constructor(
    message: string,
    readonly status: number,
    /** Presente solo cuando core devolvió un error de dominio. */
    readonly codigo?: CodigoError,
  ) {
    super(message);
    this.name = "ErrorApi";
  }
}

/** Se dispara en un 401. La monta <Sesion> para mandar al login sin recargar. */
export type AlExpirar = () => void;
let alExpirar: AlExpirar | null = null;
export function alPerderSesion(fn: AlExpirar | null): void {
  alExpirar = fn;
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${ruta}`, {
    ...init,
    // Sin esto el navegador no manda la cookie de sesión a otro puerto y core
    // responde 401 a todo. Es el único cambio que la autenticación exige aquí.
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  // La sesión dura 12h; un turno largo puede pasarse. Avisamos una vez en vez
  // de dejar la consola en un bucle de polling que falla en silencio.
  if (res.status === 401) {
    alExpirar?.();
    throw new ErrorApi("Sesión expirada", 401);
  }

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

export function triage(cuerpo: {
  texto: string;
  origen?: Coordenada;
  tipoMovil?: TipoMovil;
  unidad?: Unidad;
}): Promise<TriageResponse> {
  return pedir<TriageResponse>("/triage", {
    method: "POST",
    body: JSON.stringify(cuerpo),
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

export function dispatch(cuerpo: {
  casoId: string;
  sedeCodigo: string;
  canal?: CanalHandshake;
}): Promise<DispatchResponse> {
  return pedir<DispatchResponse>("/dispatch", {
    method: "POST",
    body: JSON.stringify(cuerpo),
  });
}

export function responder(cuerpo: {
  handshakeId: string;
  decision: "aceptado" | "rechazado";
  motivo?: string;
}): Promise<RespondResponse> {
  return pedir<RespondResponse>("/handshake/respond", {
    method: "POST",
    body: JSON.stringify(cuerpo),
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
export async function transcribir(audio: Blob): Promise<TranscribirResponse> {
  const res = await fetch(`${API}/voz/transcribir`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": audio.type || "audio/webm" },
    body: audio,
  });

  if (res.status === 401) {
    alExpirar?.();
    throw new ErrorApi("Sesión expirada", 401);
  }
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

// ── Sesión ───────────────────────────────────────────────────────

export function login(password: string): Promise<{ ok: true; expiraEn: number }> {
  return pedir("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function logout(): Promise<{ ok: true }> {
  return pedir("/auth/logout", { method: "POST" });
}

/** Público en core: solo devuelve el booleano, nunca el token. */
export function sesion(): Promise<{ autenticado: boolean }> {
  return pedir("/auth/sesion", { cache: "no-store" });
}
