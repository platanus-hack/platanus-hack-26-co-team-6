/**
 * ═══════════════════════════════════════════════════════════════════
 *  LA COSTURA CON LA TAREA 1.3 — quien es el actor de esta peticion
 * ═══════════════════════════════════════════════════════════════════
 *
 * Todo este modulo necesita responder una sola pregunta antes de decidir nada:
 * **¿quien pide esto, de que organizacion, y con que roles?** Hoy core no lo
 * sabe. `auth/sesion.service.ts` emite un token con `sub: 'operador'` y nada
 * mas: una contraseña compartida para todo el turno, sin actores ni roles. Es
 * la deuda que AGENTS.md lista como "una contraseña compartida abre las tres
 * consolas", y la cierra la tarea 1.3.
 *
 * Este archivo es el UNICO sitio del modulo donde se responde esa pregunta.
 * Ningun servicio ni controlador lee `req` por su cuenta: piden `ActorSesion`
 * y trabajan con eso.
 *
 * ── SIN CONFIGURAR NO HAY ROLES, Y ESO ES LO CORRECTO ──────────────
 *
 * La regla 2 del repo tiene una excepcion escrita: "Unica excepcion: la
 * autenticacion. Ahi un fallback abierto *es* la vulnerabilidad." Aqui se
 * decide quien reparte roles dentro de una organizacion — el permiso que el
 * invariante 3 de multitenancy §5.3 protege. Un `roles: ['admin_organizacion']`
 * de cortesia convertiria esta tarea en teatro: los dos 403 que tiene que
 * probar dejarian de poder fallar.
 *
 * Asi que sin configuracion explicita **no hay roles y no hay organizacion**, y
 * cada ruta responde 403 diciendo exactamente que variable falta.
 *
 *   PULSO_ROLES_TURNO=admin_organizacion
 *   PULSO_ORGANIZACION_TURNO=org-demo
 *
 * Son declaraciones DEL LADO DEL SERVIDOR: quien despliega decide, no quien
 * llama. Un encabezado HTTP con el rol seria falsificable desde el navegador;
 * una variable de entorno no.
 *
 * ── LAS MISMAS DOS VARIABLES QUE `eventos/actor.service.ts` ────────
 *
 * ⚠️ Ese archivo (tarea 3.1, otro carril) resuelve la MISMA pregunta para el
 * registro de eventos, y aterrizo en paralelo con este. Se usan a proposito
 * los dos mismos nombres de variable y la misma politica de denegar por
 * defecto: dos modelos provisionales de identidad incompatibles en el mismo
 * proceso serian peor que la duplicacion.
 *
 * No se importa de alla —y no por gusto: son dos PRs en vuelo y `ActorSesion`
 * no es `ActorSolicitante`— pero **convergen en 1.3**. Ver el reporte de la
 * tarea: sobra uno de los dos y el que se queda deberia ser el de core.
 *
 * ── QUE CAMBIA CUANDO 1.3 EXISTA ───────────────────────────────────
 *
 * `actorDe()` se queda en su primera rama: se borra todo lo que hay debajo de
 * `// ── PROVISIONAL` y con ello las dos variables de turno. Nada mas del
 * modulo se entera — los tests de autorizacion construyen su `ActorSesion` a
 * mano y siguen pasando igual.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { esRol, type Rol } from './equipo.tipos';

/**
 * Quien pide. Es la forma que 1.3 va a emitir; el modulo ya programa contra
 * ella para no tener que reescribirse cuando llegue.
 */
export interface ActorSesion {
  id: string;
  /**
   * `null` cuando no hay forma de saberlo. NO es "todas": es la ausencia de
   * alcance, y quien la reciba tiene que negar, no abrir.
   */
  organizacionId: string | null;
  roles: Rol[];
  correo?: string;
  nombre?: string;
  /** Alcance por sede. Vacio = toda la organizacion. */
  sedes?: string[];
  /** `turno` mientras 1.3 no exista. La UI lo pinta como degradacion. */
  modo: 'actor' | 'turno';
}

/**
 * Lo que el guard cuelga de la peticion. `operador` lo pone `SesionGuard` hoy;
 * `actor` lo va a poner el guard de 1.3. Los dos opcionales a proposito: este
 * archivo tiene que compilar antes y despues de esa tarea.
 */
export interface PeticionConIdentidad {
  operador?: string;
  actor?: {
    id?: string;
    organizacionId?: string;
    roles?: unknown;
    correo?: string;
    nombre?: string;
    sedes?: string[];
  };
}

export const VAR_ROLES = 'PULSO_ROLES_TURNO';
export const VAR_ORGANIZACION = 'PULSO_ORGANIZACION_TURNO';

@Injectable()
export class IdentidadService implements OnModuleInit {
  private readonly log = new Logger(IdentidadService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    // Se avisa al arrancar y no en el primer 403: quien despliega tiene que
    // enterarse antes de que un administrador este intentando invitar a su
    // jefe de urgencias un domingo.
    if (this.rolesDelTurno().length === 0 || !this.organizacionDelTurno()) {
      this.log.warn(
        `Sin identidad real (tarea 1.3), /organizaciones/:id/equipo y las ` +
          `invitaciones responden 403. Para el turno declara ` +
          `${VAR_ROLES}=admin_organizacion y ${VAR_ORGANIZACION}=<id de la org>. ` +
          'Son roles POR TURNO, no por persona: toda accion queda atribuida a ' +
          'la sesion compartida hasta 1.3.',
      );
    }
  }

  /**
   * El actor de esta peticion, o `null` si no hay ninguno.
   *
   * `null` no es "invitado": es 401. Quien llama nunca debe interpretarlo como
   * un permiso menor, porque no lo es — es la ausencia de identidad.
   */
  actorDe(req: PeticionConIdentidad): ActorSesion | null {
    // Lo que 1.3 va a poner. En cuanto exista, esta rama gana siempre.
    const real = req?.actor;
    if (real?.id && real.organizacionId) {
      return {
        id: real.id,
        organizacionId: real.organizacionId,
        // Un rol que este build no conoce se descarta en vez de propagarse.
        // El efecto es "no puedo hacer esto", que es el lado correcto.
        roles: Array.isArray(real.roles) ? real.roles.filter(esRol) : [],
        correo: real.correo,
        nombre: real.nombre,
        sedes: real.sedes ?? [],
        modo: 'actor',
      };
    }

    // ── PROVISIONAL (se borra con 1.3) ──────────────────────────────
    // Sin sesion no hay identidad. El guard global ya deberia haber cortado;
    // esto es el cinturon sobre los tirantes.
    const sub = req?.operador?.trim();
    if (!sub) return null;

    // `svc:` marca los tokens de servicio (tarea 1.8). Un servicio NO hereda
    // los roles del turno humano: `svc:voz` reporta hechos, no reparte
    // puestos en un hospital. `servicio` nunca pasa `puedeInvitar()`.
    const servicio = sub.startsWith('svc:');

    return {
      // Mismo prefijo que `eventos/actor.service.ts` para que la auditoria de
      // los dos modulos nombre igual al mismo sujeto.
      id: servicio ? sub : `turno:${sub}`,
      organizacionId: servicio ? null : this.organizacionDelTurno(),
      roles: servicio ? ['servicio'] : this.rolesDelTurno(),
      nombre: servicio ? null : 'Sesion de turno',
      sedes: [],
      modo: 'turno',
    } as ActorSesion;
  }

  private rolesDelTurno(): Rol[] {
    return (this.config.get<string>(VAR_ROLES) ?? '')
      .split(',')
      .map((rol) => rol.trim())
      .filter(esRol);
  }

  private organizacionDelTurno(): string | null {
    return this.config.get<string>(VAR_ORGANIZACION)?.trim() || null;
  }
}
