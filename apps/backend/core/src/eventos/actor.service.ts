/**
 * ═══════════════════════════════════════════════════════════════════
 *  QUIÉN ES EL ACTOR Y QUÉ ROLES TIENE — LA FRONTERA CON LA TAREA 1.3
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Este es el ÚNICO lugar de core donde se responde esa pregunta. Está
 *  aislado a propósito: cuando 1.3 (Sebas) aterrice el modelo de actores,
 *  se reescribe `deSolicitud()` y no se toca nada más.
 *
 *  ── QUÉ HAY HOY ──────────────────────────────────────────────────
 *  Una contraseña compartida por turno (`sesion.service.ts`). El token trae
 *  un `sub` y nada más: no hay persona, no hay organización, no hay roles.
 *  Con eso NO se puede saber si quien llama es el regulador del CRUE.
 *
 *  ── POR QUÉ NO SE ASUME QUE SÍ ───────────────────────────────────
 *  La regla 2 del repo dice que todo degrada sin credenciales, **con una
 *  única excepción: la autenticación, donde un fallback abierto ES la
 *  vulnerabilidad**. Aquí se decide quién puede firmar un override —una
 *  potestad que la ley le atribuye al regulador (Res. 1220/2010)— y quién
 *  puede abrir el expediente clínico de un caso. Un `return true` de
 *  cortesía convertiría las dos tareas en teatro.
 *
 *  Así que sin configuración explícita **no hay roles**, y las dos rutas
 *  responden 403 diciendo exactamente qué falta. El frontend lo pinta.
 *
 *  ── EL PUENTE HASTA 1.3 ──────────────────────────────────────────
 *  `PULSO_ROLES_TURNO=regulador_crue,auditor` declara, DEL LADO DEL
 *  SERVIDOR, qué roles tiene el turno que conoce la contraseña. No es
 *  identidad —sigue sin haber personas— pero sí es una decisión de quien
 *  despliega, no de quien llama. Un encabezado HTTP con el rol sería
 *  falsificable desde el navegador; una variable de entorno no.
 *
 *  `PULSO_ORGANIZACION_TURNO` hace lo mismo con el alcance de inquilino,
 *  para poder probar de verdad que un `admin_organizacion` no ve casos
 *  ajenos.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TipoActor } from './evento.tipos';

/** Los siete de multitenancy §2.1. Espejo de `lib/sesion-modelo.ts`. */
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

export function esRol(valor: string): valor is Rol {
  return (ROLES as readonly string[]).includes(valor);
}

export interface ActorSolicitante {
  id: string;
  nombre: string | null;
  tipo: TipoActor;
  organizacionId: string | null;
  roles: Rol[];
  /** true mientras los roles vengan de la variable de turno y no de 1.3. */
  provisional: boolean;
}

/** Lo mínimo que el guard deja en la petición. Evita depender de express aquí. */
export interface SolicitudConSesion {
  operador?: string;
}

export const VAR_ROLES = 'PULSO_ROLES_TURNO';
export const VAR_ORGANIZACION = 'PULSO_ORGANIZACION_TURNO';

@Injectable()
export class ActorService implements OnModuleInit {
  private readonly log = new Logger(ActorService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const roles = this.rolesDelTurno();
    if (roles.length === 0) {
      // Se avisa al arrancar y no en el primer 403: quien despliega tiene que
      // enterarse antes de que el regulador esté con un caso abierto.
      this.log.warn(
        `${VAR_ROLES} no configurado — la sesión de turno no acredita ningún ` +
          'rol, así que POST /casos/:id/override y GET /auditoria/casos/:id ' +
          'responden 403. Es deliberado: la identidad real llega con la tarea ' +
          `1.3. Para el turno, declara p. ej. ${VAR_ROLES}=regulador_crue,auditor`,
      );
    } else {
      this.log.warn(
        `${VAR_ROLES}=${roles.join(',')} — roles declarados POR TURNO, no por ` +
          'persona. Toda acción queda atribuida a la sesión compartida hasta 1.3.',
      );
    }
  }

  /**
   * El actor de esta petición.
   *
   * `svc:` marca los tokens de servicio (tarea 1.8): `svc:voz` no es una
   * persona y la vista forense tiene que poder decirlo.
   */
  deSolicitud(req: SolicitudConSesion): ActorSolicitante {
    const sub = req?.operador?.trim() || 'desconocido';
    const servicio = sub.startsWith('svc:');

    return {
      id: servicio ? sub : `turno:${sub}`,
      nombre: null,
      tipo: servicio ? 'servicio' : 'humano',
      organizacionId: this.config.get<string>(VAR_ORGANIZACION)?.trim() || null,
      // Un servicio no hereda los roles del turno humano: `svc:voz` reporta
      // hechos, no firma decisiones.
      roles: servicio ? ['servicio'] : this.rolesDelTurno(),
      provisional: true,
    };
  }

  /** El actor que usa core cuando actúa solo (el vigilante, un worker). */
  sistema(nombre: string): ActorSolicitante {
    return {
      id: `sys:${nombre}`,
      nombre: null,
      tipo: 'sistema',
      organizacionId: null,
      roles: [],
      provisional: true,
    };
  }

  private rolesDelTurno(): Rol[] {
    const crudo = this.config.get<string>(VAR_ROLES) ?? '';
    return crudo
      .split(',')
      .map((r) => r.trim())
      .filter(esRol);
  }
}

/**
 * ¿Tiene alguno de estos roles?
 *
 * Sin roles no pasa: la ausencia de información no es permiso. El mensaje
 * dice qué falta porque un 403 mudo aquí manda a alguien a leer código.
 */
export function tieneAlgunRol(
  actor: Pick<ActorSolicitante, 'roles'>,
  pedidos: readonly Rol[],
): boolean {
  return pedidos.some((rol) => actor.roles.includes(rol));
}

export function motivoDeNegacion(
  actor: ActorSolicitante,
  pedidos: readonly Rol[],
): string {
  const exigidos = pedidos.join(' o ');
  return actor.roles.length === 0
    ? `Tu sesión no acredita ningún rol y esto exige ${exigidos}. Core todavía ` +
        `no tiene identidad real (tarea 1.3): declara ${VAR_ROLES} en el ` +
        'servidor para el turno.'
    : `Tu sesión acredita ${actor.roles.join(', ')} y esto exige ${exigidos}.`;
}
