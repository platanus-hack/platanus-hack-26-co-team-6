/**
 * Quien puede invitar, y que roles puede repartir.
 *
 * ── EL INVARIANTE 3 ────────────────────────────────────────────────
 * multitenancy §5.3: **"Nadie se otorga un rol que no tiene.
 * `admin_organizacion` no puede crear un `regulador_crue`."**
 *
 * Es la regla que impide que administrar un hospital sea el camino corto a
 * regular la red entera. Se valida AQUI, en el servidor: la misma comprobacion
 * en la UI es cortesia (evita ofrecer un boton que va a dar 403), no seguridad.
 *
 * ── POR QUE SON DOS PREGUNTAS Y NO UNA ─────────────────────────────
 * `puedeInvitar()` responde "¿tiene el permiso `actor:invitar`?" (matriz §5.2).
 * `rolesOtorgables()` responde "¿y hasta donde llega?". Un `paramedico` falla
 * la primera; un `admin_organizacion` la pasa y falla la segunda cuando pide
 * un rol de red. Colapsarlas en una sola perderia esa diferencia justo donde
 * hay que explicarsela a quien recibe el 403.
 */

import { ROLES, type Rol } from './equipo.tipos';

/**
 * `actor:invitar` de la matriz §5.2: solo `admin_organizacion` (la suya) y
 * `admin_plataforma`. Nadie mas aparece con ✅ en esa fila.
 */
export function puedeInvitar(roles: readonly Rol[]): boolean {
  return roles.includes('admin_organizacion') || roles.includes('admin_plataforma');
}

/**
 * Roles que un actor puede otorgar. Union de tres reglas, en este orden:
 *
 *  1. **`admin_plataforma` reparte todo lo humano.** Es quien aprueba
 *     afiliaciones y administra catalogos; si no pudiera nombrar al primer
 *     regulador del CRUE, no habria forma de arrancar la red.
 *
 *  2. **`admin_organizacion` reparte los roles que viven DENTRO de un
 *     inquilino**: `paramedico`, `jefe_urgencias` y su propio rol. No
 *     `regulador_crue` ni `auditor`, que en la matriz §5.2 leen "✅ red" — su
 *     alcance cruza inquilinos y por definicion no es suyo para regalar.
 *
 *  3. **Lo que ya se tiene, se puede pasar.** Es la lectura literal del
 *     invariante, y es la que hace que el `admin_organizacion` del CRUE —que
 *     ademas es `regulador_crue`— pueda nombrar a otro regulador sin que haya
 *     que cablear una excepcion por tipo de organizacion.
 *
 * `servicio` no esta en ninguna de las tres: no es una persona. Sus
 * credenciales las emite `POST /auth/servicio` (tarea 1.8) y solo para
 * `admin_plataforma`. Una invitacion por correo que crea un token de servicio
 * seria la forma mas barata de conseguir uno.
 */
export function rolesOtorgables(roles: readonly Rol[]): Rol[] {
  if (roles.includes('admin_plataforma')) {
    return ROLES.filter((rol) => rol !== 'servicio');
  }

  const otorgables = new Set<Rol>();

  if (roles.includes('admin_organizacion')) {
    otorgables.add('paramedico');
    otorgables.add('jefe_urgencias');
    otorgables.add('admin_organizacion');
  }

  for (const rol of roles) {
    if (rol !== 'servicio') otorgables.add(rol);
  }

  // El orden de ROLES y no el de insercion: la UI lo pinta tal cual y una
  // lista que cambia de orden entre peticiones se lee como un bug.
  return ROLES.filter((rol) => otorgables.has(rol));
}
