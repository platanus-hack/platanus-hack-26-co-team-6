/**
 * Como entra el segundo humano de una organizacion — tarea 2.5.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  EL INVARIANTE QUE ESTE ARCHIVO EXISTE PARA SOSTENER
 * ═══════════════════════════════════════════════════════════════════
 *  **Nadie otorga un rol que no tiene** (invariante 3 de multitenancy §5.3).
 *
 *  Sin esto, un `admin_organizacion` de una clinica cualquiera se invita a
 *  si mismo como `regulador_crue` y pasa a ver —y a regular— la red entera.
 *  Es escalada de privilegios de un formulario, y el formulario ya existe.
 *
 *  `admin_plataforma` es la excepcion declarada: es el rol que administra la
 *  plataforma y puede otorgar cualquiera, incluido el suyo.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  DESACTIVAR NO ES BORRAR
 * ═══════════════════════════════════════════════════════════════════
 *  `activo = false`, nunca un DELETE. Los eventos de auditoria guardan
 *  `actor_id` y tienen que seguir resolviendo a un nombre: se muestra
 *  «Nombre (inactivo)», no un uuid huerfano (caso limite 4 de §7).
 */

import { Injectable, Logger } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import type {
  AceptarInvitacionRequest,
  AceptarInvitacionResponse,
  Actor,
  CrearInvitacionRequest,
  CrearInvitacionResponse,
  EquipoResponse,
  Invitacion,
  Rol,
} from '../contracts/types';
import { PulsoError } from '../common/pulso-error.filter';
import { RepoActoresMemoria, type ActorRegistrado } from '../auth/actores';
import type { ActorSesion } from '../auth/carga';
import { ROLES_DE_RED, esRol } from '../auth/roles';
import { AfiliacionService } from '../afiliacion/afiliacion.service';
import {
  RepoInvitacionesMemoria,
  estaViva,
  type NuevaInvitacion,
} from './invitaciones';

@Injectable()
export class InvitacionesService {
  private readonly log = new Logger(InvitacionesService.name);

  constructor(
    private readonly invitaciones: RepoInvitacionesMemoria,
    private readonly actores: RepoActoresMemoria,
    private readonly afiliacion: AfiliacionService,
  ) {}

  // ── Crear ─────────────────────────────────────────────────────

  async invitar(
    organizacionId: string,
    peticion: CrearInvitacionRequest,
    quienInvita: ActorSesion,
    baseUrl: string,
  ): Promise<CrearInvitacionResponse> {
    const organizacion =
      await this.afiliacion.exigirOrganizacion(organizacionId);

    this.exigirMismaOrganizacion(quienInvita, organizacionId);

    const correo = (peticion?.correo ?? '').trim().toLowerCase();
    if (!correo.includes('@')) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        'La invitacion necesita un correo valido.',
      );
    }
    if (!esRol(peticion?.rol)) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        `'${String(peticion?.rol)}' no es un rol del sistema.`,
      );
    }

    this.exigirPuedeOtorgar(quienInvita, peticion.rol);

    // Un correo con invitacion viva no se invita dos veces: el segundo
    // enlace invalidaria mentalmente al primero sin invalidarlo de verdad, y
    // quedan dos tokens buenos para la misma persona.
    const vivas = (await this.invitaciones.deOrganizacion(organizacionId))
      .filter((i) => estaViva(i))
      .filter((i) => i.correo === correo);
    if (vivas.length) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        'Ese correo ya tiene una invitacion pendiente. Revocala antes de ' +
          'mandar otra, o espera a que venza.',
        { invitacionId: vivas[0].id, expiraEn: vivas[0].expiraEn },
      );
    }

    const nueva: NuevaInvitacion = {
      organizacionId,
      correo,
      rol: peticion.rol,
      codigoSede: peticion.codigoSede ?? null,
      invitadaPor: quienInvita.id,
    };
    const { invitacion, token } = await this.invitaciones.crear(nueva);

    // ⚠️ Ni el token ni el correo van al log. El id de la invitacion si:
    // es lo que permite auditar sin exponer a nadie.
    this.log.log(
      `invitacion ${invitacion.id} creada en ${organizacion.id} ` +
        `(rol ${invitacion.rol}) por ${quienInvita.id}`,
    );

    return {
      invitacion,
      enlace: `${baseUrl.replace(/\/+$/, '')}/invitacion/${token}`,
      // Regla de degradacion del repo: sin proveedor de correo NO se
      // inventa el envio. Se devuelve el enlace y se dice que no se mando.
      enviadoPorCorreo: false,
    };
  }

  // ── Aceptar ───────────────────────────────────────────────────

  /**
   * Un solo uso.
   *
   * Los dos rechazos son 410 y no 404 a proposito: 404 dice «ese token no
   * existe» y manda a buscar un error de tipeo. 410 dice «existio y ya no
   * sirve», que es lo que de verdad paso y lleva a la accion correcta —
   * pedir otra invitacion.
   */
  async aceptar(
    token: string,
    peticion: AceptarInvitacionRequest,
  ): Promise<AceptarInvitacionResponse> {
    const invitacion = await this.invitaciones.porToken(token ?? '');
    if (!invitacion) {
      // Sin detalles y sin el token en el mensaje: un atacante que prueba
      // tokens no aprende nada de esta respuesta.
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        'Esa invitacion no existe.',
        undefined,
        false,
        HttpStatus.NOT_FOUND,
      );
    }

    if (invitacion.aceptadaEn) {
      throw new PulsoError(
        'PULSO_INVITACION_YA_USADA',
        `Esa invitacion ya se uso el ${fecha(invitacion.aceptadaEn)}. Si no ` +
          'fuiste tu, avisale al administrador de tu organizacion.',
        undefined,
        false,
        HttpStatus.GONE,
      );
    }
    if (invitacion.revocadaEn) {
      throw new PulsoError(
        'PULSO_INVITACION_YA_USADA',
        'Esa invitacion fue revocada. Pidele otra al administrador.',
        undefined,
        false,
        HttpStatus.GONE,
      );
    }
    if (!estaViva(invitacion)) {
      throw new PulsoError(
        'PULSO_INVITACION_EXPIRADA',
        `Esa invitacion vencio el ${fecha(invitacion.expiraEn)}. Las ` +
          'invitaciones duran 72 horas: pidele otra al administrador.',
        undefined,
        false,
        HttpStatus.GONE,
      );
    }

    const organizacion = await this.afiliacion.exigirOrganizacion(
      invitacion.organizacionId,
    );

    if (!peticion?.nombre?.trim() || !peticion?.clave) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        'Para entrar hacen falta tu nombre y una contraseña.',
      );
    }

    const yaExiste = await this.actores.porIdentificador(invitacion.correo);
    if (yaExiste) {
      // Caso limite 1 de §7: un medico en dos IPS son DOS actores con el
      // mismo correo. Ese caso necesita que `actor.identificador` deje de
      // ser unico, y eso es de la tarea 1.1. Se dice, no se adivina.
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        'Ya hay una cuenta con ese correo. Trabajar en dos organizaciones a ' +
          'la vez necesita la tabla de identidad (tarea 1.1) y todavia no ' +
          'esta: por ahora, usa otro correo.',
      );
    }

    const registrado = await this.actores.registrar({
      identificador: invitacion.correo,
      nombre: peticion.nombre.trim(),
      organizacionId: invitacion.organizacionId,
      roles: [invitacion.rol],
      sedes: invitacion.codigoSede ? [invitacion.codigoSede] : [],
      tipo: 'humano',
      clave: peticion.clave,
    });

    // Se marca DESPUES de crear el actor: si `registrar` revienta —una clave
    // de menos de 12 caracteres, por ejemplo— la invitacion tiene que seguir
    // sirviendo. Quemarla antes dejaria a la persona sin cuenta y sin token.
    await this.invitaciones.guardar({
      ...invitacion,
      aceptadaEn: new Date().toISOString(),
    });

    this.log.log(
      `invitacion ${invitacion.id} aceptada: actor ${registrado.id} ` +
        `(${invitacion.rol}) en ${organizacion.id}`,
    );

    return { actor: aPublico(registrado), organizacion };
  }

  // ── Revocar, listar, desactivar ───────────────────────────────

  async revocar(
    organizacionId: string,
    invitacionId: string,
    quienRevoca: ActorSesion,
  ): Promise<Invitacion> {
    this.exigirMismaOrganizacion(quienRevoca, organizacionId);

    const invitacion = await this.invitaciones.porId(invitacionId);
    if (!invitacion || invitacion.organizacionId !== organizacionId) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        'Esa invitacion no es de esta organizacion.',
      );
    }
    if (invitacion.aceptadaEn) {
      throw new PulsoError(
        'PULSO_ILLEGAL_TRANSITION',
        'Esa invitacion ya se uso: revocarla no le quita el acceso a nadie. ' +
          'Lo que quieres es desactivar al actor.',
        { invitacionId },
      );
    }

    // Idempotente: revocar dos veces no es un error, es la misma intencion.
    if (invitacion.revocadaEn) return invitacion;

    const revocada = await this.invitaciones.guardar({
      ...invitacion,
      revocadaEn: new Date().toISOString(),
    });
    this.log.log(`invitacion ${invitacionId} revocada por ${quienRevoca.id}`);
    return revocada;
  }

  /** Lo que pinta `/panel/equipo` (la vista es de la tarea 2.5 + 2.7). */
  async equipo(
    organizacionId: string,
    quienPregunta: ActorSesion,
  ): Promise<EquipoResponse> {
    this.exigirMismaOrganizacion(quienPregunta, organizacionId);
    await this.afiliacion.exigirOrganizacion(organizacionId);

    const todas = await this.invitaciones.deOrganizacion(organizacionId);
    return {
      // Los desactivados TAMBIEN salen: la tabla los muestra en gris, no los
      // esconde. Esconderlos es lo que rompe la lectura de la auditoria.
      actores: this.actores
        .deOrganizacion(organizacionId)
        .map(aPublico)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      invitacionesPendientes: todas.filter((i) => estaViva(i)),
    };
  }

  /**
   * Desactivar un actor. `activo = false`, NUNCA un DELETE.
   *
   * Tampoco se permite desactivarse a uno mismo: dejaria a una organizacion
   * sin ningun `admin_organizacion` y sin forma de volver a entrar.
   */
  async desactivar(
    organizacionId: string,
    actorId: string,
    quienDesactiva: ActorSesion,
  ): Promise<Actor> {
    this.exigirMismaOrganizacion(quienDesactiva, organizacionId);

    if (actorId === quienDesactiva.id) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        'No puedes desactivarte a ti mismo: la organizacion se quedaria sin ' +
          'administrador. Pidele a otro admin que lo haga.',
      );
    }

    const actor = await this.actores.porId(actorId);
    if (!actor || actor.organizacionId !== organizacionId) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        'Ese actor no es de esta organizacion.',
      );
    }

    const desactivado = await this.actores.activar(actorId, false);
    this.log.log(`actor ${actorId} desactivado por ${quienDesactiva.id}`);
    return aPublico(desactivado ?? actor);
  }

  // ── Los dos guardas ───────────────────────────────────────────

  /**
   * El inquilino sale del token firmado, nunca de la URL.
   *
   * Es el caso limite 13 de §7 llevado a su version mas comun: si esto
   * confiara en el `:id` de la ruta, cambiar un uuid en la barra de
   * direcciones invitaria gente a otra organizacion.
   */
  private exigirMismaOrganizacion(
    actor: ActorSesion,
    organizacionId: string,
  ): void {
    if (actor.roles.includes('admin_plataforma')) return;
    if (actor.organizacionId === organizacionId) return;

    this.log.warn(
      `intento cruzado: actor ${actor.id} (org ${actor.organizacionId}) ` +
        `sobre la organizacion ${organizacionId}`,
    );
    throw new PulsoError(
      'PULSO_INVALID_INPUT',
      'Esa organizacion no es la tuya.',
      undefined,
      false,
      HttpStatus.FORBIDDEN,
    );
  }

  /**
   * Invariante 3, leido con cuidado: **nadie otorga un rol que no tiene.**
   *
   * ═══════════════════════════════════════════════════════════════
   *  POR QUE NO ES `actor.roles.includes(rol)` A SECAS
   * ═══════════════════════════════════════════════════════════════
   *  Esa lectura literal es la primera que se escribe, y rompe el producto:
   *  un `admin_organizacion` no podria invitar al `jefe_urgencias` de su
   *  propia sede ni a sus paramedicos — que es LITERALMENTE para lo que
   *  existe `/panel/equipo` (§3.4). La organizacion no podria crecer.
   *
   *  El ejemplo que da §5.3 no es casual: dice «`admin_organizacion` no
   *  puede crear un `regulador_crue`». Y `regulador_crue` no es «un rol que
   *  no tiene» cualquiera — es un **rol de red**, uno de los tres que ven
   *  fuera de la organizacion. Lo que el invariante protege es el salto de
   *  alcance, no la simetria de roles.
   *
   *  Asi que la regla es:
   *
   *    · `admin_plataforma`  → puede otorgar cualquiera. Es la excepcion, y
   *                            esta declarada en la matriz §5.2.
   *    · los roles de RED    → NADIE mas los otorga. Ni teniendolos: un
   *                            `regulador_crue` que pudiera crear otro
   *                            `regulador_crue` haria crecer la red entera
   *                            sin pasar por la plataforma.
   *    · `servicio`          → tampoco. Un actor de servicio no se invita
   *                            por correo; lo emite `POST /auth/servicio`
   *                            (tarea 1.8) y queda auditado.
   *    · los de organizacion → los otorga `admin_organizacion` dentro de la
   *                            suya, y cualquiera que ya los tenga.
   */
  private exigirPuedeOtorgar(actor: ActorSesion, rol: Rol): void {
    if (actor.roles.includes('admin_plataforma')) return;

    const motivo = this.porQueNoPuedeOtorgar(actor, rol);
    if (!motivo) return;

    // El intento queda registrado. Un 403 mudo pierde la señal: alguien
    // tratando de fabricarse un regulador del CRUE es exactamente lo que hay
    // que poder contar despues (mismo criterio que `RolGuard`).
    this.log.warn(
      `actor ${actor.id} intento otorgar '${rol}' — ${motivo} ` +
        `(tiene: ${actor.roles.join(', ')})`,
    );
    throw new PulsoError(
      'PULSO_INVALID_INPUT',
      `No puedes otorgar el rol '${rol}': ${motivo}`,
      { rol },
      false,
      HttpStatus.FORBIDDEN,
    );
  }

  /** El motivo, o `undefined` si si puede. Separado para que se lea. */
  private porQueNoPuedeOtorgar(
    actor: ActorSesion,
    rol: Rol,
  ): string | undefined {
    if (ROLES_DE_RED.includes(rol)) {
      return (
        'es un rol de red y ve fuera de tu organizacion. Solo ' +
        '`admin_plataforma` lo otorga.'
      );
    }
    if (rol === 'servicio') {
      return (
        'los actores de servicio no se invitan por correo: se emiten con ' +
        'POST /auth/servicio y quedan auditados.'
      );
    }
    if (actor.roles.includes('admin_organizacion')) return undefined;
    if (actor.roles.includes(rol)) return undefined;

    return 'no lo tienes y no eres administrador de la organizacion.';
  }
}

/** Lo que sale por el cable. Sin hash, sin identificador de otra gente. */
const aPublico = (actor: ActorRegistrado): Actor => ({
  id: actor.id,
  organizacionId: actor.organizacionId,
  nombre: actor.nombre,
  roles: actor.roles,
  sedes: actor.sedes,
  tipo: actor.tipo,
  activo: actor.activo,
});

const fecha = (iso: string): string => iso.slice(0, 16).replace('T', ' ');
