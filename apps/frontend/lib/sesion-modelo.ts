/**
 * El modelo de sesión, sin React.
 *
 * Vive separado de `sesion.ts` por una razón práctica: aquí está la lógica que
 * decide **qué puede hacer alguien y a dónde va**, y eso hay que poder probarlo.
 * El frontend no tiene runner de tests (ni lo vale por dos archivos), pero
 * `node --test` corre esto tal cual porque su única dependencia es zod.
 * Los tests están al lado, en `sesion-modelo.test.mts`.
 *
 * Regla que atraviesa todo el archivo: **ante la duda, menos privilegios.**
 * Un campo que no se entiende no se asume permisivo.
 */

import { z } from "zod";

// ── Roles ────────────────────────────────────────────────────────

/**
 * Los siete de multitenancy §2.1. `servicio` no es una persona: es `svc:voz`
 * y compañía (tarea 1.8). Nunca inicia sesión en una consola.
 */
export const ROLES = [
  "paramedico",
  "jefe_urgencias",
  "admin_organizacion",
  "regulador_crue",
  "auditor",
  "admin_plataforma",
  "servicio",
] as const;

export type Rol = (typeof ROLES)[number];

export function esRol(valor: string): valor is Rol {
  return (ROLES as readonly string[]).includes(valor);
}

// ── Forma de la respuesta de core ────────────────────────────────

/**
 * Todo opcional salvo `autenticado`. Es la regla 1 del repo aplicada al revés:
 * si core empieza a mandar campos nuevos, esto no revienta; si core todavía no
 * los manda (hoy no), esto tampoco.
 */
const esquemaActor = z.object({
  id: z.string(),
  nombre: z.string().optional(),
  correo: z.string().optional(),
});

const esquemaOrganizacion = z.object({
  id: z.string(),
  nombre: z.string().optional(),
  tipo: z.string().optional(),
});

export const esquemaRespuestaSesion = z.object({
  autenticado: z.boolean(),
  modo: z.enum(["legacy", "actor"]).optional(),
  actor: esquemaActor.optional(),
  organizacion: esquemaOrganizacion.optional(),
  /** Presente cuando el correo tiene actor en más de una. Caso límite 1. */
  organizaciones: z.array(esquemaOrganizacion).optional(),
  roles: z.array(z.string()).optional(),
  /** Alcance por sede. Vacío o ausente = toda la organización. */
  sedes: z.array(z.string()).optional(),
});

export type RespuestaSesion = z.infer<typeof esquemaRespuestaSesion>;
export type Actor = z.infer<typeof esquemaActor>;
export type Organizacion = z.infer<typeof esquemaOrganizacion>;

export type ModoAuth = "legacy" | "actor";

export interface DatosSesion {
  autenticado: boolean;
  modo: ModoAuth;
  actor: Actor | null;
  organizacion: Organizacion | null;
  organizaciones: Organizacion[];
  roles: Rol[];
  sedes: string[];
}

const NADIE: DatosSesion = {
  autenticado: false,
  modo: "legacy",
  actor: null,
  organizacion: null,
  organizaciones: [],
  roles: [],
  sedes: [],
};

/**
 * Normaliza lo que vino del servidor.
 *
 * Un cuerpo que no se entiende es "no hay sesión", no "hay sesión rara": el
 * degradado tiene que caer del lado de pedir credenciales, nunca del de dejar
 * pasar.
 *
 * Un rol desconocido (core más nuevo que este build) se descarta en vez de
 * tumbar la consola. El efecto es "no puedo hacer esto", que también es el
 * lado correcto.
 */
export function normalizarSesion(crudo: unknown): DatosSesion {
  const leido = esquemaRespuestaSesion.safeParse(crudo);
  if (!leido.success) return NADIE;

  const d = leido.data;

  return {
    autenticado: d.autenticado,
    // Sin `modo` explícito, el modo es el que core tiene hoy.
    modo: d.modo ?? (d.actor ? "actor" : "legacy"),
    actor: d.actor ?? null,
    organizacion: d.organizacion ?? null,
    organizaciones: d.organizaciones ?? (d.organizacion ? [d.organizacion] : []),
    roles: (d.roles ?? []).filter(esRol),
    sedes: d.sedes ?? [],
  };
}

// ── Permisos de cortesía ─────────────────────────────────────────
//
// "De cortesía" porque la autorización de verdad la hace core: responde 403
// aunque alguien borre estos archivos. Esto solo evita que una consola pinte
// media pantalla antes de llenarse de errores.

/**
 * En modo legacy devuelve true siempre. No es un descuido: la contraseña de
 * turno no trae roles, y fingir uno que el servidor no emitió sería peor que
 * no comprobar nada — la UI diría "puedes" donde core dice 403. Es exactamente
 * la deuda que cierra 1.3.
 */
export function tieneRol(
  sesion: Pick<DatosSesion, "modo" | "roles">,
  pedidos: Rol[],
): boolean {
  if (sesion.modo === "legacy") return true;
  return pedidos.some((rol) => sesion.roles.includes(rol));
}

/** Alcance por sede. Vacío = toda la organización, que es el caso normal. */
export function alcanzaSede(
  sesion: Pick<DatosSesion, "modo" | "sedes">,
  codigoSede: string,
): boolean {
  if (sesion.modo === "legacy") return true;
  return sesion.sedes.length === 0 || sesion.sedes.includes(codigoSede);
}

// ── A dónde va cada rol ──────────────────────────────────────────

/**
 * Consolas que existen hoy. Existir es tener ruta: si un rol apunta a una que
 * no está en este Set, `rutaPorRol` lo desvía y quien llame **tiene que
 * decirlo** — un login correcto que aterriza en un 404 es la peor pantalla
 * posible, y uno que desvía en silencio, la segunda peor.
 *
 * Estar aquí no es tener permiso: la autorización la hace core, que responde
 * 403 igual. Esto solo evita mandar a alguien a una ruta que no existe.
 */
export const CONSOLAS_CONSTRUIDAS = new Set([
  "/campo",
  "/hospital",
  "/crue",
  "/admin",
  "/equipo",
]);

// `/auditoria` NO está: la única ruta que existe es `/auditoria/casos/:id`, y
// no hay índice porque core no expone listado (solo `GET /auditoria/casos/:id`).
// Al auditor se le dice que su consola no está y se le deja entrar por el
// enlace del caso, desde el panel del CRUE. Cuando haya listado, va aquí.

export const DESTINO: Record<Rol, string> = {
  paramedico: "/campo",
  jefe_urgencias: "/hospital",
  regulador_crue: "/crue",
  // El route group es `(panel)`, pero el paréntesis no sale en la URL: la
  // ruta real es `/equipo`. Apuntar a `/panel` era un 404.
  admin_organizacion: "/equipo",
  admin_plataforma: "/admin",
  auditor: "/auditoria",
  // No debería llegar aquí nunca: un token de servicio no abre una consola.
  servicio: "/campo",
};

/** Con varios roles gana el más operativo: es quien está en la calle. */
const PRIORIDAD: Rol[] = [
  "paramedico",
  "jefe_urgencias",
  "regulador_crue",
  "admin_organizacion",
  "auditor",
  "admin_plataforma",
];

export const DESTINO_POR_DEFECTO = "/campo";

/**
 * A dónde mandar tras entrar.
 *
 * `pendiente` viene con la ruta que le tocaba cuando esa consola todavía no
 * existe. Quien llame **debe decirlo en pantalla** — callarlo convierte "tu
 * consola no está construida" en "el login me mandó a otro lado".
 */
export function rutaPorRol(roles: Rol[]): {
  destino: string;
  pendiente?: string;
} {
  const rol = PRIORIDAD.find((r) => roles.includes(r));
  if (!rol) return { destino: DESTINO_POR_DEFECTO };

  const destino = DESTINO[rol];
  if (CONSOLAS_CONSTRUIDAS.has(destino)) return { destino };

  // Su consola no existe: buscamos otra suya que sí, y si no, el default.
  const alterna = PRIORIDAD.filter((r) => roles.includes(r))
    .map((r) => DESTINO[r])
    .find((ruta) => CONSOLAS_CONSTRUIDAS.has(ruta));

  return { destino: alterna ?? DESTINO_POR_DEFECTO, pendiente: destino };
}

/**
 * Filtra el `?destino=` con el que `<Sesion>` manda a alguien al login.
 *
 * Un login que redirige a donde le digan es un regalo para phishing: se sale
 * de PULSO con la sesión recién abierta y se aterriza en una copia de la
 * pantalla que se acaba de dejar. Solo pasan rutas internas.
 *
 * Las dos que engañan:
 *   `//evil.com`  el navegador la lee como URL protocolo-relativa, no como ruta
 *   `/\evil.com`  Chrome y Firefox normalizan la barra invertida a `/`, y queda
 *                 la anterior por otro camino
 *
 * Vive aquí y no en la página para poder probarlo sin montar React.
 */
export function destinoInterno(crudo: string | null | undefined): string | null {
  if (!crudo) return null;
  return crudo.startsWith("/") && !/^\/[/\\]/.test(crudo) ? crudo : null;
}

/** Qué rol pide cada consola. Cortesía de UI; el 403 lo da core. */
export const ROL_DE_CONSOLA: Record<string, Rol[]> = {
  "/campo": ["paramedico"],
  "/hospital": ["jefe_urgencias"],
  "/crue": ["regulador_crue"],
  "/equipo": ["admin_organizacion"],
  "/admin": ["admin_plataforma"],
  // La vista forense la leen tres roles, cada uno con su alcance. QUE caso
  // puede ver cada uno lo decide core; esto solo evita pintar media pantalla
  // antes del 403.
  "/auditoria": ["auditor", "regulador_crue", "admin_organizacion"],
};

/** `/campo/ruta/abc` → `/campo`. Lo usa la guarda de las consolas. */
export function consolaDeRuta(ruta: string): string {
  return `/${ruta.split("/")[1] ?? ""}`;
}
