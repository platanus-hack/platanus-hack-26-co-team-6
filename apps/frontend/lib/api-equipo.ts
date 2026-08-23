/**
 * Cliente de equipo e invitaciones (tarea 2.5).
 *
 * Vive fuera de `lib/api.ts` porque ese archivo lo dice él mismo: es el más
 * compartido del frontend y crecer por acumulación lo convirtió en un cuello
 * de botella de merges. Los clientes por dominio viven aparte y le piden a él
 * lo único que no se puede duplicar — `credentials: "include"`, la renovación
 * silenciosa de sesión y la lectura de los dos formatos de error de core. Un
 * `fetch` suelto aquí se saltaría las tres.
 *
 * El tipo `Rol` se importa de `sesion-modelo.ts` en vez de redeclararse: dos
 * listas de roles que se desincronizan es la misma clase de bug que el espejo
 * de `types.ts`, y no rompe el build, rompe el runtime.
 *
 * ── EL TOKEN ───────────────────────────────────────────────────────
 * `describir()` y `aceptar()` reciben el token de invitación por parámetro y
 * lo ponen en la ruta. Es la única credencial que este archivo toca, y no se
 * guarda en ningún sitio: ni `localStorage`, ni estado global, ni un log. Sale
 * de la URL de la pestaña, se manda a core y se olvida.
 */

import { ErrorApi, pedir } from "./api";
import type { Rol } from "./sesion-modelo";

/** `mi` = "la organización de quien pregunta". La resuelve el servidor. */
export const ORGANIZACION_PROPIA = "mi";

export type EstadoInvitacion =
  | "pendiente"
  | "aceptada"
  | "revocada"
  | "vencida";

export interface ActorEquipo {
  id: string;
  correo: string;
  nombre: string | null;
  roles: Rol[];
  codigoSede: string | null;
  activo: boolean;
  creadoEn: string;
  /** Hoy siempre `null`: nadie lo escribe hasta la tarea 1.3. */
  ultimoAccesoEn: string | null;
  desactivadoEn: string | null;
}

export interface InvitacionEquipo {
  id: string;
  organizacionId: string;
  correo: string;
  rol: Rol;
  codigoSede: string | null;
  estado: EstadoInvitacion;
  creadaEn: string;
  expiraEn: string;
  aceptadaEn: string | null;
  revocadaEn: string | null;
  invitadaPor: string;
}

export type TipoEventoEquipo =
  | "invitacion_creada"
  | "invitacion_reemplazada"
  | "invitacion_revocada"
  | "invitacion_aceptada"
  | "actor_desactivado"
  | "actor_reactivado"
  | "intento_cruzado"
  | "rol_no_otorgable";

export interface EventoEquipo {
  id: string;
  organizacionId: string;
  tipo: TipoEventoEquipo;
  en: string;
  autorId: string | null;
  actorId: string | null;
  invitacionId: string | null;
  detalle: Record<string, string | null>;
}

export interface Equipo {
  organizacionId: string;
  actores: ActorEquipo[];
  invitaciones: InvitacionEquipo[];
  eventos: EventoEquipo[];
  /** Lo que ESTE actor puede repartir. El selector se pinta con esto y nada más. */
  rolesOtorgables: Rol[];
  puedeInvitar: boolean;
  degradaciones: {
    /** `turno` = sin modelo de identidad todavía (tarea 1.3). */
    identidad: "actor" | "turno";
    correo: "resend" | "ninguno";
    /** `false` mientras nadie escriba `ultimoAccesoEn`. */
    ultimoAcceso: boolean;
  };
}

/**
 * Lo que core responde al crear una invitación.
 *
 * `enlace` llega **solo cuando el correo no salió**. No es un descuido de la
 * API: si el correo salió, la credencial ya viajó por su canal y repetirla en
 * pantalla es una copia más que alguien puede dejar abierta. Si no salió, es
 * lo único que impide que la invitación se pierda en silencio.
 */
export interface ResultadoInvitacion {
  invitacion: InvitacionEquipo;
  correo:
    | { enviado: true; proveedor: string }
    | { enviado: false; motivo: "sin-proveedor" | "fallo-envio" };
  enlace?: string;
}

export interface DescripcionInvitacion {
  correo: string;
  rol: Rol;
  codigoSede: string | null;
  organizacionId: string;
  expiraEn: string;
}

export interface AceptacionInvitacion {
  actor: ActorEquipo;
  organizacionId: string;
  /** Qué falta para poder entrar. Core lo dice en vez de fingir que ya está. */
  siguiente: string;
}

// ── Lo que ve el administrador ───────────────────────────────────

export function equipo(organizacionId = ORGANIZACION_PROPIA): Promise<Equipo> {
  return pedir(`/organizaciones/${encodeURIComponent(organizacionId)}/equipo`, {
    cache: "no-store",
  });
}

export function invitar(
  organizacionId: string,
  cuerpo: { correo: string; rol: Rol; codigoSede?: string },
): Promise<ResultadoInvitacion> {
  return pedir(
    `/organizaciones/${encodeURIComponent(organizacionId)}/invitaciones`,
    { method: "POST", body: JSON.stringify(cuerpo) },
  );
}

export function revocarInvitacion(
  organizacionId: string,
  invitacionId: string,
): Promise<{ invitacion: InvitacionEquipo }> {
  return pedir(
    `/organizaciones/${encodeURIComponent(organizacionId)}/invitaciones/${encodeURIComponent(invitacionId)}/revocar`,
    { method: "POST" },
  );
}

/**
 * Sacar a alguien del equipo.
 *
 * No hay `DELETE` en este archivo y no es un olvido: desactivar es
 * `activo = false`. Un borrado dejaría la auditoría histórica apuntando a un
 * id que ya no resuelve a nadie — regla 4 del repo, caso límite 4 de
 * multitenancy §7.
 */
export function desactivarActor(
  organizacionId: string,
  actorId: string,
  motivo?: string,
): Promise<{ actor: ActorEquipo }> {
  return pedir(
    `/organizaciones/${encodeURIComponent(organizacionId)}/actores/${encodeURIComponent(actorId)}/desactivar`,
    { method: "POST", body: JSON.stringify({ motivo }) },
  );
}

export function reactivarActor(
  organizacionId: string,
  actorId: string,
): Promise<{ actor: ActorEquipo }> {
  return pedir(
    `/organizaciones/${encodeURIComponent(organizacionId)}/actores/${encodeURIComponent(actorId)}/reactivar`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

// ── Lo que ve el invitado ────────────────────────────────────────

/**
 * Por qué un token muerto no es un error técnico.
 *
 * Un enlace ya usado, revocado o vencido son tres cosas distintas que mandan a
 * hacer cosas distintas, y ninguna de las tres es "algo salió mal": son
 * estados normales de una invitación. Por eso `leerInvitacion()` no lanza —
 * devuelve un resultado que la pantalla puede pintar entero.
 *
 * `410` es el único código que distingue "existió y ya no sirve" de "nunca
 * existió" (404). Sin él habría que adivinar por el texto del mensaje.
 */
export type ResultadoLectura =
  | { estado: "valida"; invitacion: DescripcionInvitacion }
  /** 410: usada, revocada o vencida. `mensaje` lo dice, y viene del servidor. */
  | { estado: "muerta"; mensaje: string }
  /** 404: el token no corresponde a ninguna invitación. */
  | { estado: "desconocida" }
  | { estado: "sin-core" };

export async function leerInvitacion(
  token: string,
): Promise<ResultadoLectura> {
  try {
    return { estado: "valida", invitacion: await describir(token) };
  } catch (err) {
    return interpretar(err);
  }
}

export function describir(token: string): Promise<DescripcionInvitacion> {
  return pedir(`/invitacion/${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
}

export function aceptar(
  token: string,
  cuerpo: { nombre?: string } = {},
): Promise<AceptacionInvitacion> {
  return pedir(`/invitacion/${encodeURIComponent(token)}`, {
    method: "POST",
    body: JSON.stringify(cuerpo),
  });
}

function interpretar(err: unknown): ResultadoLectura {
  if (!(err instanceof ErrorApi)) return { estado: "sin-core" };
  if (err.status === 410) return { estado: "muerta", mensaje: err.message };
  if (err.status === 404) return { estado: "desconocida" };
  return { estado: "sin-core" };
}

/** El mensaje de core, o uno propio si lo que falló fue la red. */
export function mensajeDeError(err: unknown, siNoHayCore: string): string {
  return err instanceof ErrorApi ? err.message : siNoHayCore;
}
