/**
 * Lo que lleva un token — tarea 1.3.
 *
 * Estructura completa en `docs/multitenancy-y-autenticacion.md` §3.2. Es LO
 * QUE NO PUEDE FALTAR de esta tarea: 12 tareas dependen de que el token
 * cargue actor, organizacion, roles y alcance.
 *
 * Antes esto era `{ sub: 'operador', exp }` — una contraseña compartida que
 * abria las tres consolas. La pregunta "¿quien acepto a este paciente?" no
 * tenia respuesta posible.
 *
 * ⚠️ Estos tipos NO van a `contracts/types.ts` a proposito: no cruzan el
 *    cable. El front nunca lee el token (la cookie es HttpOnly) y lo que si
 *    necesita —quien soy, que puedo ver— se lo dice `GET /auth/yo`.
 */

import type { Rol } from './roles';

/** Claves cortas a proposito: el token viaja en cada request. */
export interface CargaAcceso {
  /** actorId. */
  sub: string;
  /** organizacionId — EL INQUILINO. */
  org: string;
  rol: Rol[];
  /** Alcance por sede. Vacio = toda la organizacion (o la red, si el rol es de red). */
  sed: string[];
  tip: 'humano' | 'servicio';
  /** sessionId — es lo que permite revocar sin esperar a que expire. */
  sid: string;
  /** Marca el tipo de token. Sin esto, un access sirve de refresh. */
  typ: 'a';
  exp: number;
}

export interface CargaRefresh {
  sub: string;
  sid: string;
  /** Id de ESTE refresh. Rota en cada uso; si reaparece uno usado, hay copia. */
  jti: string;
  typ: 'r';
  exp: number;
}

/**
 * El actor tal como lo ve el resto de core: lo que el guard cuelga del
 * request y lo que reciben las rutas con `@Actor()`.
 */
export interface ActorSesion {
  id: string;
  organizacionId: string;
  roles: Rol[];
  /** Codigos de sede. Vacio = sin restriccion dentro de su alcance. */
  sedes: string[];
  tipo: 'humano' | 'servicio';
  sesionId: string;
  /**
   * true = entro con la contraseña de turno (PULSO_AUTH_LEGACY).
   *
   * Quien audite algo firmado por un actor legado tiene que saber que detras
   * hay un turno compartido y no una persona. Se propaga a proposito.
   */
  legado: boolean;
}
