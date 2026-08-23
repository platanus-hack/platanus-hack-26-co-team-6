/**
 * Los tipos del equipo de una organizacion: actores, invitaciones y su bitacora.
 *
 * ⚠️ NO van en `contracts/types.ts`. Ese archivo es el protocolo del ruteo y
 * tiene un espejo manual en el frontend (`lib/types.ts`) que un verificador
 * compara en CI: meterle tipos de administracion pondria rojo el check de la
 * tarea 0.7 sin que nadie del ruteo haya tocado nada. El espejo de estos tipos
 * es `apps/frontend/lib/api-equipo.ts`, que es de la misma tarea y del mismo
 * dueño — cuando cambie uno, cambia el otro en el mismo PR.
 */

// ── Roles ──────────────────────────────────────────────────────────

/**
 * Los siete de multitenancy §2.1, en el mismo orden que el espejo del front
 * (`lib/sesion-modelo.ts`). `servicio` NO es una persona: es `svc:voz` y
 * compañia, y sus credenciales las emite `POST /auth/servicio` (tarea 1.8).
 * Por eso nunca es un rol invitable — ver `rolesOtorgables()`.
 */
export const ROLES = [
  'paramedico',
  'jefe_urgencias',
  'admin_organizacion',
  'regulador_crue',
  'auditor',
  'admin_plataforma',
  'servicio',
] as const;

export type Rol = (typeof ROLES)[number];

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

// ── Actor ──────────────────────────────────────────────────────────

/**
 * Una persona dentro de una organizacion.
 *
 * `activo` y no un borrado: el caso limite 4 de multitenancy §7 lo dice
 * explicito — "los eventos guardan `actor_id`, y el actor NUNCA se borra. Se
 * muestra 'Nombre (inactivo)'". Un `DELETE` aqui deja la auditoria historica
 * apuntando a un id que ya no resuelve a nadie.
 */
export interface Actor {
  id: string;
  organizacionId: string;
  correo: string;
  nombre: string | null;
  roles: Rol[];
  /** Alcance por sede. `null` = toda la organizacion, que es el caso normal. */
  codigoSede: string | null;
  activo: boolean;
  creadoEn: string;
  /**
   * Lo escribe quien emite la sesion, es decir la tarea 1.3. Hoy siempre
   * `null`, y la tabla de `/equipo` lo dice en vez de pintar un guion mudo.
   */
  ultimoAccesoEn: string | null;
  desactivadoEn: string | null;
  /** De que invitacion nacio. `null` para el primer actor, que lo crea 2.1. */
  invitacionId: string | null;
}

// ── Invitacion ─────────────────────────────────────────────────────

/**
 * Una invitacion pendiente.
 *
 * ⚠️ `tokenHash` y no `token`. El token de 32 bytes existe UNA vez, en la
 * respuesta que crea la invitacion; de ahi en adelante solo vive en el enlace
 * que tiene el invitado. Guardar el token seria guardar una credencial en
 * claro: quien lea la tabla entra como cualquiera de los invitados pendientes.
 */
export interface Invitacion {
  id: string;
  organizacionId: string;
  correo: string;
  rol: Rol;
  codigoSede: string | null;
  /** sha256 del token, en hex. Nunca sale de core. */
  tokenHash: string;
  creadaEn: string;
  expiraEn: string;
  aceptadaEn: string | null;
  revocadaEn: string | null;
  /** Id del actor que invito. Es lo que hace atribuible el otorgamiento. */
  invitadaPor: string;
  /** Id del actor que nacio al aceptarla. */
  actorCreadoId: string | null;
}

export type EstadoInvitacion = 'pendiente' | 'aceptada' | 'revocada' | 'vencida';

/**
 * Lo que SI puede salir de core. Es la lista blanca de `despojar()` aplicada a
 * este modulo: escrita campo por campo a proposito, para que agregar un campo
 * obligue a decidir si puede salir. `tokenHash` no esta, y esa ausencia es la
 * unica linea de defensa contra filtrarlo por una respuesta JSON.
 */
export interface InvitacionPublica {
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

// ── Bitacora ───────────────────────────────────────────────────────

/**
 * Los tipos de evento de este modulo.
 *
 * `intento_cruzado` y `rol_no_otorgable` son los dos 403 que se registran a
 * proposito: el invariante 1 de multitenancy §5.3 dice que "un 403 mudo pierde
 * la señal mas interesante del sistema", y eso vale igual para el que intenta
 * invitar a una organizacion ajena que para el que intenta repartir un rol que
 * no tiene.
 */
export type TipoEventoEquipo =
  | 'invitacion_creada'
  | 'invitacion_reemplazada'
  | 'invitacion_revocada'
  | 'invitacion_aceptada'
  | 'actor_desactivado'
  | 'actor_reactivado'
  | 'intento_cruzado'
  | 'rol_no_otorgable';

/**
 * Append-only. Nadie edita ni borra una fila de aqui: una correccion es un
 * evento nuevo (regla 4 del repo).
 */
export interface EventoEquipo {
  id: string;
  organizacionId: string;
  tipo: TipoEventoEquipo;
  en: string;
  /** Quien lo provoco. `null` cuando lo provoca el invitado, que aun no es actor. */
  autorId: string | null;
  actorId: string | null;
  invitacionId: string | null;
  /** Contexto minimo. Nunca el token ni su hash. */
  detalle: Record<string, string | null>;
}
