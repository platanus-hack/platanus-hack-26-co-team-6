/**
 * Quién está pidiendo, y qué le corresponde ver.
 *
 * ══════════════════════════════════════════════════════════════════
 *  ⚠️  LA IDENTIDAD REAL ES LA TAREA 1.3 (Sebas) Y TODAVÍA NO EXISTE.
 *      Toda la incertidumbre está encerrada en UNA función:
 *      `resolverActor()`. Nada más en el módulo `moviles` mira la
 *      petición HTTP para saber quién es quién.
 * ══════════════════════════════════════════════════════════════════
 *
 * Hoy core autentica con una contraseña compartida por turno
 * (`auth/sesion.service.ts`): el token no trae actor, ni organización, ni
 * roles. Eso deja dos caminos, y solo uno es aceptable:
 *
 *   ✗ Creerle al cliente. Una cabecera `X-Organizacion` la escribe cualquiera
 *     con la contraseña del turno, y el alcance por inquilino dejaría de ser
 *     una frontera para ser una sugerencia.
 *   ✓ Resolver la identidad SOLO con lo que el servidor sabe: el token de
 *     sesión y su propia configuración.
 *
 * Por eso el actor provisional se arma con el `sub` del token y con variables
 * de entorno del servidor. Es honesto (dice `modo: 'provisional'` en cada
 * respuesta) y **nunca es permisivo por defecto**: sin configurar nada, quien
 * entra es paramédico de una sola organización y NO ve la red completa.
 *
 * Cuando 1.3 aterrice, `req.actor` vendrá lleno y la rama provisional muere
 * sola: se borra el `else` y ya.
 */

/**
 * Roles de multitenancy §2.1 que le importan a este módulo. La lista completa
 * la define 1.3; aquí solo están los que deciden algo sobre móviles.
 */
export const ROLES_RED_COMPLETA = ['regulador_crue', 'admin_plataforma'] as const;

export type Alcance = 'organizacion' | 'red';
export type ModoIdentidad = 'actor' | 'provisional';

export interface ActorMovil {
  /** Identificador del actor. Con la sesión de turno es el `sub` del token. */
  id: string;
  /** null = no sabemos de qué organización es. Sin organización no se escribe. */
  organizacionId: string | null;
  roles: readonly string[];
  modo: ModoIdentidad;
}

/**
 * La forma que tendrá `req` cuando 1.3 exista. Se lee de forma defensiva: si
 * el guard de Sebas todavía no la llena, `resolverActor` no la encuentra y
 * cae al camino provisional.
 */
export interface SolicitudConActor {
  actor?: {
    id?: unknown;
    organizacionId?: unknown;
    roles?: unknown;
  };
  /** Lo pone `SesionGuard` hoy: el `sub` del token de turno. */
  operador?: unknown;
}

/** Lo que el servidor —no el cliente— dice sobre la sesión de turno. */
export interface ConfiguracionProvisional {
  /**
   * `MOVILES_ORG_PROVISIONAL`. Con una contraseña compartida por turno, todo
   * el que entra ES del mismo equipo: modelarlo como una organización única no
   * es una concesión, es la descripción exacta de lo que hay.
   */
  organizacion?: string | null;
  /**
   * `MOVILES_ROLES_PROVISIONAL`, separados por coma.
   *
   * Sin configurar: `paramedico`. Es la decisión importante de este archivo —
   * el default NO incluye `regulador_crue`, así que por omisión nadie ve la
   * red completa. Para el tablero de sala del CRUE se pone a propósito en el
   * servidor que lo sirve.
   */
  roles?: string | null;
}

const ORG_PROVISIONAL_POR_DEFECTO = 'org-demo';
const ROLES_PROVISIONALES_POR_DEFECTO: readonly string[] = ['paramedico'];

/**
 * ⭐ LA función. Único punto del módulo que decide quién es quien pregunta.
 *
 * No lanza: un actor sin organización es un actor válido que no puede
 * escribir. Quien decide el 403 es el llamador, con los predicados de abajo.
 */
export function resolverActor(
  req: SolicitudConActor,
  config: ConfiguracionProvisional = {},
): ActorMovil {
  // ── Camino definitivo (1.3) ──────────────────────────────────
  const a = req.actor;
  if (a && typeof a.id === 'string' && a.id.length > 0) {
    return {
      id: a.id,
      organizacionId:
        typeof a.organizacionId === 'string' && a.organizacionId.length > 0
          ? a.organizacionId
          : null,
      // Un `roles` que no es un arreglo de strings se descarta entero. Ante la
      // duda, menos privilegios: el efecto es "no puedo", nunca "puedo".
      roles: Array.isArray(a.roles)
        ? a.roles.filter((r): r is string => typeof r === 'string')
        : [],
      modo: 'actor',
    };
  }

  // ── Camino provisional (hoy) ─────────────────────────────────
  const sub = typeof req.operador === 'string' && req.operador ? req.operador : 'operador';
  const org = config.organizacion?.trim() || ORG_PROVISIONAL_POR_DEFECTO;
  const roles = config.roles
    ? config.roles
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
    : ROLES_PROVISIONALES_POR_DEFECTO;

  return { id: sub, organizacionId: org, roles, modo: 'provisional' };
}

// ─────────────────────────────────────────────────────────────────
// Decisiones de autorización — puras, y cerradas por defecto
// ─────────────────────────────────────────────────────────────────

/** ¿Este actor regula la ciudad, o solo opera su flota? */
export function veLaRedCompleta(actor: ActorMovil): boolean {
  return ROLES_RED_COMPLETA.some((r) => actor.roles.includes(r));
}

export function alcanceDe(actor: ActorMovil): Alcance {
  return veLaRedCompleta(actor) ? 'red' : 'organizacion';
}

/**
 * ¿Puede este actor reportar la posición de este móvil?
 *
 * Solo el paramédico dueño o su organización. Un actor sin organización no
 * escribe nada: ese `null` es el "no sé" del modo provisional, y un "no sé"
 * que dejara pasar sería exactamente el fallback abierto que la regla 2 del
 * repo prohíbe para la autenticación.
 *
 * El CRUE tampoco escribe posiciones aunque las vea todas: PULSO le muestra la
 * cobertura, no mueve móviles (Res. 1220/2010).
 */
export function puedeReportar(
  actor: ActorMovil,
  organizacionDelMovil: string | null,
): boolean {
  if (!actor.organizacionId) return false;
  if (organizacionDelMovil === null) return true; // móvil sin dueño: lo adopta quien reporta
  return organizacionDelMovil === actor.organizacionId;
}

/**
 * Qué móviles ve este actor. El CRUE, todos; un operador, los suyos.
 *
 * Se aplica EN EL SERVIDOR, sobre la lista completa, antes de serializar. Un
 * filtro en el cliente sería una decoración: la respuesta ya habría salido con
 * las posiciones de la flota ajena dentro.
 */
export function visiblesPara<T extends { movil: { organizacionId: string } }>(
  actor: ActorMovil,
  estados: readonly T[],
): T[] {
  if (veLaRedCompleta(actor)) return [...estados];
  if (!actor.organizacionId) return [];
  return estados.filter((e) => e.movil.organizacionId === actor.organizacionId);
}
