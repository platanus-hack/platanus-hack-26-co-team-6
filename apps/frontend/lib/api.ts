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
  TipoMovil,
  TokenVozResponse,
  TranscribirResponse,
  TriageResponse,
  Unidad,
} from "./types";

const API =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001";

/** Error de core con el mensaje que devolvió, no un "Failed to fetch" pelado. */
export class ErrorApi extends Error {
  constructor(
    message: string,
    readonly status: number,
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
    // Nest devuelve { statusCode, message, error }. Si el body no es JSON
    // (core caído, proxy en el medio), no queremos un throw de parseo encima.
    const detalle = await res
      .json()
      .then((j) => (Array.isArray(j?.message) ? j.message.join(", ") : j?.message))
      .catch(() => null);
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
 * Credencial efímera para transcribir con Deepgram desde el navegador.
 *
 * Lanza ErrorApi con status 503 si core no tiene DEEPGRAM_API_KEY. Eso NO es
 * un error que mostrar: significa "no hay STT de servidor", y quien llame debe
 * caer a la Web Speech API sin decir nada.
 */
export function tokenVoz(): Promise<TokenVozResponse> {
  return pedir<TokenVozResponse>("/voz/token", { method: "POST" });
}

/**
 * Manda un audio grabado y devuelve lo que se entendió.
 *
 * Es el camino que funciona en Safari/iOS, donde la Web Speech API no existe,
 * y el único que sobrevive a una zona muerta: el `Blob` se puede guardar y
 * reintentar cuando vuelva la señal.
 *
 * No pasa por `pedir`: el cuerpo es binario, así que no lleva
 * `Content-Type: application/json` — el tipo real del audio ES el que le dice
 * a Deepgram cómo decodificarlo.
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
