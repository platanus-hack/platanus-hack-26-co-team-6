/**
 * Los roles del sistema — tarea 1.3.
 *
 * Salen de la matriz de permisos de
 * `docs/multitenancy-y-autenticacion.md` §5.2. No se inventan aqui: si hace
 * falta uno nuevo, se agrega alli primero y despues aqui.
 *
 * Identificadores en español SIN tildes (regla del repo).
 */

export const ROLES = [
  'paramedico',
  'jefe_urgencias',
  'admin_organizacion',
  'regulador_crue',
  'auditor',
  'admin_plataforma',
  /** No es una persona: `svc:voz`, `svc:etl`. Distingue bot de humano en la auditoria. */
  'servicio',
] as const;

export type Rol = (typeof ROLES)[number];

export const esRol = (valor: unknown): valor is Rol =>
  typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);

/**
 * Roles que ven la red entera y no una sola organizacion.
 *
 * `sed: []` en el token significa "todo su alcance"; para estos tres eso es
 * la red. Para el resto, un `sed` vacio es toda SU organizacion, nunca mas.
 */
export const ROLES_DE_RED: readonly Rol[] = [
  'regulador_crue',
  'auditor',
  'admin_plataforma',
];

/**
 * Segundo factor obligatorio (§3.5).
 *
 * ⚠️ Declarado pero TODAVIA NO EXIGIDO: el TOTP es lo opcional de esta tarea
 *    y va aparte. La lista vive aqui desde ya para que el dia que se conecte
 *    no haya que buscar quien la sabe.
 */
export const ROLES_CON_2FA: readonly Rol[] = [
  'regulador_crue',
  'admin_plataforma',
  'auditor',
];
