/**
 * Como entra el segundo humano de una organizacion (tarea 2.5).
 *
 * ── LAS CUATRO REGLAS QUE ESTE ARCHIVO EXISTE PARA SOSTENER ────────
 *
 * 1. **El token viaja en el enlace; en base solo esta el hash.** Se genera con
 *    32 bytes de `randomBytes`, se devuelve UNA vez y no se vuelve a poder
 *    leer. Quien se lleve la tabla se lleva hashes, no accesos.
 *
 * 2. **Un solo uso, y 410 cuando ya no sirve.** Aceptada, revocada o vencida
 *    son tres motivos distintos y la respuesta los distingue: "ya usaste este
 *    enlace" y "el enlace vencio" mandan a hacer cosas distintas.
 *
 * 3. **Nadie otorga un rol que no tiene** (invariante 3, multitenancy §5.3) y
 *    **nadie invita a una organizacion que no es la suya** (nivel 3 de
 *    aislamiento, §6). Las dos se validan aqui, en el servidor. Los dos 403
 *    dejan evento: un 403 mudo pierde la señal mas interesante del sistema.
 *
 * 4. **Desactivar es `activo = false`, nunca un `DELETE`.** Caso limite 4 de
 *    §7: los eventos guardan `actor_id` y el actor nunca se borra, para que la
 *    auditoria vieja siga resolviendo a un nombre.
 *
 * ── LO QUE NO HACE, Y POR QUE ──────────────────────────────────────
 *
 * · **No fija contraseñas.** Aceptar una invitacion crea el actor y su rol;
 *   la credencial es de la tarea 1.3, que decide Argon2id, minimos y bloqueo
 *   progresivo (§3.6). Aceptar aqui un campo `password` y guardarlo con lo que
 *   hoy existe —`sha256` sin sal— seria peor que no tenerlo: parece hecho.
 *
 * · **No comprueba que `codigoSede` exista en el REPS.** Ese cruce es de 2.1 y
 *   necesita la tabla `organizacion_sede`, que todavia no esta.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ALMACEN_EQUIPO, type AlmacenEquipo } from './almacen-equipo';
import { CorreoService, type ResultadoCorreo } from './correo.service';
import {
  esRol,
  type Actor,
  type EstadoInvitacion,
  type EventoEquipo,
  type Invitacion,
  type InvitacionPublica,
  type Rol,
  type TipoEventoEquipo,
} from './equipo.tipos';
import {
  VAR_ORGANIZACION,
  VAR_ROLES,
  type ActorSesion,
} from './identidad.service';
import { puedeInvitar, rolesOtorgables } from './permisos';

/**
 * 72 horas. Lo fija la tarea: bastante para que alguien de turno de noche lo
 * vea al dia siguiente, poco para que un enlace olvidado en una bandeja siga
 * abriendo una organizacion un mes despues.
 */
const VIGENCIA_MS = 72 * 60 * 60 * 1000;

/** Cuantos eventos devuelve `/equipo`. La bitacora completa es de la 4.12. */
const EVENTOS_EN_PANTALLA = 50;

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `mi` = "la organizacion de quien pregunta". La resuelve el servidor. */
export const ORGANIZACION_PROPIA = 'mi';

export interface ActorPublico {
  id: string;
  correo: string;
  nombre: string | null;
  roles: Rol[];
  codigoSede: string | null;
  activo: boolean;
  creadoEn: string;
  ultimoAccesoEn: string | null;
  desactivadoEn: string | null;
}

export interface RespuestaEquipo {
  organizacionId: string;
  actores: ActorPublico[];
  invitaciones: InvitacionPublica[];
  eventos: EventoEquipo[];
  /** Lo que ESTE actor puede repartir. La UI pinta el selector con esto. */
  rolesOtorgables: Rol[];
  puedeInvitar: boolean;
  /** Las degradaciones, visibles. Regla 2 del repo. */
  degradaciones: {
    identidad: 'actor' | 'turno';
    correo: 'resend' | 'ninguno';
    /** `false` mientras 1.3 no escriba `ultimoAccesoEn`. */
    ultimoAcceso: boolean;
  };
}

export interface RespuestaInvitacion {
  invitacion: InvitacionPublica;
  correo: ResultadoCorreo;
  /**
   * El enlace con el token dentro. Presente SOLO cuando el correo no salio:
   * si salio, la credencial ya viajo por su canal y repetirla en una respuesta
   * JSON es una copia mas de la que nadie se acuerda.
   */
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
  actor: ActorPublico;
  organizacionId: string;
  /** Lo que falta para poder entrar. Hoy siempre hay algo: ver el comentario. */
  siguiente: string;
}

@Injectable()
export class InvitacionesService {
  constructor(
    @Inject(ALMACEN_EQUIPO) private readonly almacen: AlmacenEquipo,
    private readonly correo: CorreoService,
    private readonly config: ConfigService,
  ) {}

  // ── Lectura ──────────────────────────────────────────────────────

  async equipo(
    actor: ActorSesion,
    organizacionId: string,
  ): Promise<RespuestaEquipo> {
    const org = await this.alcance(actor, organizacionId);

    const [actores, invitaciones, eventos] = await Promise.all([
      this.almacen.listarActores(org),
      this.almacen.listarInvitaciones(org),
      this.almacen.listarEventos(org, EVENTOS_EN_PANTALLA),
    ]);

    return {
      organizacionId: org,
      actores: actores.map((a) => despojarActor(a)),
      // Arrow y no `map(despojarInvitacion)`: `map` pasa el indice como segundo
      // argumento y ahi caeria el `ahora` de la firma. El estado de cada
      // invitacion pasaria a depender de su posicion en la lista.
      invitaciones: invitaciones.map((i) => despojarInvitacion(i)),
      eventos,
      rolesOtorgables: rolesOtorgables(actor.roles),
      puedeInvitar: puedeInvitar(actor.roles),
      degradaciones: {
        identidad: actor.modo,
        correo: this.correo.proveedor(),
        // Nadie lo escribe todavia: lo hara quien emita la sesion en 1.3.
        ultimoAcceso: false,
      },
    };
  }

  // ── Invitar ──────────────────────────────────────────────────────

  async invitar(
    actor: ActorSesion,
    organizacionId: string,
    cuerpo: { correo?: unknown; rol?: unknown; codigoSede?: unknown },
  ): Promise<RespuestaInvitacion> {
    const org = await this.alcance(actor, organizacionId);

    if (!puedeInvitar(actor.roles)) {
      throw new ForbiddenException(
        'Invitar a alguien es un permiso de administrador de la organizacion' +
          (actor.modo === 'turno'
            ? `. Esta sesion no acredita roles: declara ${VAR_ROLES} en el servidor (tarea 1.3).`
            : ''),
      );
    }

    const correo = normalizarCorreo(cuerpo?.correo);
    if (!correo) {
      throw new BadRequestException('Escribe un correo valido');
    }

    const rol = cuerpo?.rol;
    if (!esRol(rol)) {
      throw new BadRequestException('Ese rol no existe');
    }

    // ── INVARIANTE 3 ──────────────────────────────────────────────
    if (!rolesOtorgables(actor.roles).includes(rol)) {
      await this.registrar(org, 'rol_no_otorgable', {
        autorId: actor.id,
        detalle: { rolPedido: rol, correo },
      });
      throw new ForbiddenException(
        `No puedes otorgar el rol "${rol}": tu no lo tienes. ` +
          'Nadie reparte un permiso que no posee.',
      );
    }

    const codigoSede = normalizarSede(cuerpo?.codigoSede);

    // Un correo que ya es actor de la organizacion no se invita otra vez: si
    // esta inactivo se reactiva (queda su historia), y si esta activo ya entro.
    const existente = await this.almacen.actorPorCorreo(org, correo);
    if (existente) {
      throw new ConflictException(
        existente.activo
          ? 'Ese correo ya es parte del equipo'
          : 'Ese correo tuvo cuenta aqui y esta desactivada. Reactivala en vez ' +
            'de invitarlo otra vez: asi su auditoria sigue siendo la misma persona.',
      );
    }

    const ahora = new Date();

    // Reinvitar es lo normal —el correo se perdio, el enlace vencio— y tiene
    // que dar un token nuevo, no repetir el viejo, que no se puede leer. La
    // anterior se revoca para que no queden dos enlaces vivos del mismo puesto.
    const pendiente = (await this.almacen.listarInvitaciones(org)).find(
      (i) => i.correo === correo && estadoDe(i, ahora) === 'pendiente',
    );
    if (pendiente) {
      await this.almacen.guardarInvitacion({
        ...pendiente,
        revocadaEn: ahora.toISOString(),
      });
      await this.registrar(org, 'invitacion_reemplazada', {
        autorId: actor.id,
        invitacionId: pendiente.id,
        detalle: { correo },
      });
    }

    // 32 bytes de entropia. `base64url` para que sobreviva a una URL sin
    // escaparse — un `+` o un `/` en un token es el clasico "a veces falla".
    const token = randomBytes(32).toString('base64url');

    const invitacion: Invitacion = {
      id: randomUUID(),
      organizacionId: org,
      correo,
      rol,
      codigoSede,
      tokenHash: hashDe(token),
      creadaEn: ahora.toISOString(),
      expiraEn: new Date(ahora.getTime() + VIGENCIA_MS).toISOString(),
      aceptadaEn: null,
      revocadaEn: null,
      invitadaPor: actor.id,
      actorCreadoId: null,
    };

    const guardada = await this.almacen.guardarInvitacion(invitacion);
    await this.registrar(org, 'invitacion_creada', {
      autorId: actor.id,
      invitacionId: guardada.id,
      detalle: { correo, rol, codigoSede },
    });

    const enlace = `${this.baseApp()}/invitacion/${token}`;

    const resultado = await this.correo.enviarInvitacion({
      invitacionId: guardada.id,
      destino: correo,
      enlace,
      organizacion: org,
      rol,
      expiraEn: guardada.expiraEn,
    });

    return {
      invitacion: despojarInvitacion(guardada),
      correo: resultado,
      // La degradacion: si no salio correo, el enlace se enseña en pantalla.
      ...(resultado.enviado ? {} : { enlace }),
    };
  }

  async revocar(
    actor: ActorSesion,
    organizacionId: string,
    invitacionId: string,
  ): Promise<{ invitacion: InvitacionPublica }> {
    const org = await this.alcance(actor, organizacionId);

    if (!puedeInvitar(actor.roles)) {
      throw new ForbiddenException(
        'Revocar una invitacion es un permiso de administrador de la organizacion',
      );
    }

    const invitacion = await this.almacen.invitacionPorId(org, invitacionId);
    if (!invitacion) throw new NotFoundException('Esa invitacion no existe');

    if (invitacion.aceptadaEn) {
      throw new ConflictException(
        'Esa invitacion ya se acepto. Lo que se revoca ahora es el acceso del ' +
          'actor, desactivandolo.',
      );
    }

    // Idempotente: revocar dos veces no agrega un segundo evento. La bitacora
    // cuenta lo que paso, no cuantas veces se pulso el boton.
    if (invitacion.revocadaEn) {
      return { invitacion: despojarInvitacion(invitacion) };
    }

    const revocada = await this.almacen.guardarInvitacion({
      ...invitacion,
      revocadaEn: new Date().toISOString(),
    });
    await this.registrar(org, 'invitacion_revocada', {
      autorId: actor.id,
      invitacionId: revocada.id,
      detalle: { correo: revocada.correo, rol: revocada.rol },
    });

    return { invitacion: despojarInvitacion(revocada) };
  }

  // ── Actores ──────────────────────────────────────────────────────

  async cambiarActivo(
    actor: ActorSesion,
    organizacionId: string,
    actorId: string,
    activo: boolean,
    motivo?: unknown,
  ): Promise<{ actor: ActorPublico }> {
    const org = await this.alcance(actor, organizacionId);

    if (!puedeInvitar(actor.roles)) {
      throw new ForbiddenException(
        'Administrar el equipo es un permiso de administrador de la organizacion',
      );
    }

    const objetivo = await this.almacen.actorPorId(org, actorId);
    if (!objetivo) throw new NotFoundException('Ese actor no existe');

    // Idempotente y sin evento: no cambio nada.
    if (objetivo.activo === activo) {
      return { actor: despojarActor(objetivo) };
    }

    if (!activo) {
      // Dos puertas que no se pueden cerrar por dentro.
      if (objetivo.id === actor.id) {
        throw new ConflictException(
          'No puedes desactivarte a ti mismo. Que lo haga otro administrador.',
        );
      }
      if (await this.esUltimoAdmin(org, objetivo)) {
        throw new ConflictException(
          'Es el ultimo administrador activo de la organizacion. Nombra a otro ' +
            'antes de desactivarlo, o nadie podra volver a administrar el equipo.',
        );
      }
    }

    const ahora = new Date().toISOString();

    // ⚠️ `activo = false`, NUNCA un borrado. La auditoria historica guarda
    // `actor_id`: si la fila desaparece, todo evento viejo pasa a apuntar a un
    // id que no resuelve a nadie y el registro deja de ser legible.
    const guardado = await this.almacen.guardarActor({
      ...objetivo,
      activo,
      desactivadoEn: activo ? null : ahora,
    });

    await this.registrar(org, activo ? 'actor_reactivado' : 'actor_desactivado', {
      autorId: actor.id,
      actorId: guardado.id,
      detalle: {
        correo: guardado.correo,
        motivo: typeof motivo === 'string' && motivo.trim() ? motivo.trim() : null,
      },
    });

    return { actor: despojarActor(guardado) };
  }

  // ── El lado del invitado (rutas publicas) ────────────────────────

  async describir(token: string): Promise<DescripcionInvitacion> {
    const invitacion = await this.vigente(token);
    return {
      correo: invitacion.correo,
      rol: invitacion.rol,
      codigoSede: invitacion.codigoSede,
      organizacionId: invitacion.organizacionId,
      expiraEn: invitacion.expiraEn,
    };
  }

  async aceptar(
    token: string,
    cuerpo: { nombre?: unknown },
  ): Promise<AceptacionInvitacion> {
    const invitacion = await this.vigente(token);

    const yaEsta = await this.almacen.actorPorCorreo(
      invitacion.organizacionId,
      invitacion.correo,
    );
    if (yaEsta) {
      throw new ConflictException(
        'Ese correo ya es parte del equipo. Entra con el en vez de aceptar otra vez.',
      );
    }

    const actorId = randomUUID();
    const ahora = new Date().toISOString();

    // ── EL USO UNICO ──────────────────────────────────────────────
    // Marcar primero y crear despues. Al reves, dos pulsaciones del enlace
    // crean dos actores y solo una pierde la carrera del `aceptadaEn`.
    const aceptada = await this.almacen.aceptarInvitacion(
      invitacion.tokenHash,
      ahora,
      actorId,
    );
    if (!aceptada) {
      throw new GoneException(
        'Este enlace ya se uso. Si no fuiste tu, pidele a quien te invito que ' +
          'revise el equipo y mande uno nuevo.',
      );
    }

    const actor = await this.almacen.guardarActor({
      id: actorId,
      organizacionId: aceptada.organizacionId,
      correo: aceptada.correo,
      nombre: typeof cuerpo?.nombre === 'string' && cuerpo.nombre.trim()
        ? cuerpo.nombre.trim()
        : null,
      roles: [aceptada.rol],
      codigoSede: aceptada.codigoSede,
      activo: true,
      creadoEn: ahora,
      ultimoAccesoEn: null,
      desactivadoEn: null,
      invitacionId: aceptada.id,
    });

    await this.registrar(aceptada.organizacionId, 'invitacion_aceptada', {
      // `null`: quien acepta todavia no era actor cuando lo hizo. El nuevo
      // actor va en `actorId`, no en el autor.
      autorId: null,
      actorId: actor.id,
      invitacionId: aceptada.id,
      detalle: { correo: actor.correo, rol: aceptada.rol },
    });

    return {
      actor: despojarActor(actor),
      organizacionId: aceptada.organizacionId,
      // Honestidad, no cortesia: el actor existe pero todavia no tiene con que
      // entrar. Fijar contraseña es de 1.3 y no vamos a fingir que ya esta.
      siguiente:
        'Tu cuenta quedo creada. Fijar la contraseña llega con el modelo de ' +
        'identidad (tarea 1.3): por ahora se entra con la contraseña de turno.',
    };
  }

  // ── Interno ──────────────────────────────────────────────────────

  /**
   * Alcance de inquilino, en el servidor. Nivel 3 de aislamiento (§6): el
   * guard de rol y alcance corre ANTES de tocar la base, no despues.
   *
   * `mi` se resuelve aqui y no en el cliente a proposito: es la unica forma en
   * que la organizacion de una peticion no puede ser elegida por quien la
   * manda. `admin_plataforma` es la excepcion escrita en la matriz §5.2.
   */
  private async alcance(
    actor: ActorSesion,
    organizacionId: string,
  ): Promise<string> {
    // Sin organizacion no hay alcance que verificar, y "no se sabe" nunca es
    // "todas". Es el 403 que dice exactamente que falta, en vez de un 403 mudo
    // que manda a alguien a leer codigo.
    if (!actor.organizacionId) {
      throw new ForbiddenException(
        `Esta sesion no acredita ninguna organizacion. Hasta la tarea 1.3, ` +
          `declara ${VAR_ORGANIZACION} y ${VAR_ROLES} en el servidor.`,
      );
    }

    const destino =
      organizacionId === ORGANIZACION_PROPIA ? actor.organizacionId : organizacionId;

    if (destino !== actor.organizacionId && !actor.roles.includes('admin_plataforma')) {
      // El 403 con evento del invariante 1: quien intenta cruzarse de
      // inquilino es la señal mas interesante que produce este modulo.
      await this.registrar(actor.organizacionId, 'intento_cruzado', {
        autorId: actor.id,
        detalle: { organizacionSolicitada: destino },
      });
      throw new ForbiddenException('Esa organizacion no es la tuya');
    }

    return destino;
  }

  /** La invitacion detras de un token, o el 404/410 que corresponda. */
  private async vigente(token: string): Promise<Invitacion> {
    // Se busca por hash: el token en claro no se guarda en ningun sitio, asi
    // que ni siquiera core puede recuperarlo despues de crearlo.
    const invitacion = await this.almacen.invitacionPorHash(hashDe(token ?? ''));

    // 404 y no 410: un token inventado no es una invitacion gastada, y
    // distinguirlo no filtra nada — quien no tiene el token no llega aqui.
    if (!invitacion) throw new NotFoundException('Esa invitacion no existe');

    const estado = estadoDe(invitacion, new Date());
    if (estado === 'aceptada') {
      throw new GoneException(
        'Este enlace ya se uso. Si no fuiste tu, pidele a quien te invito que ' +
          'revise el equipo y mande uno nuevo.',
      );
    }
    if (estado === 'revocada') {
      throw new GoneException(
        'Esta invitacion se revoco. Pidele a quien te invito que mande una nueva.',
      );
    }
    if (estado === 'vencida') {
      throw new GoneException(
        'Esta invitacion vencio: los enlaces duran 72 horas. Pidele a quien te ' +
          'invito que mande uno nuevo.',
      );
    }

    return invitacion;
  }

  private async esUltimoAdmin(
    organizacionId: string,
    objetivo: Actor,
  ): Promise<boolean> {
    if (!objetivo.roles.includes('admin_organizacion')) return false;
    const actores = await this.almacen.listarActores(organizacionId);
    return !actores.some(
      (a) =>
        a.id !== objetivo.id && a.activo && a.roles.includes('admin_organizacion'),
    );
  }

  private async registrar(
    organizacionId: string,
    tipo: TipoEventoEquipo,
    datos: {
      autorId?: string | null;
      actorId?: string | null;
      invitacionId?: string | null;
      detalle?: Record<string, string | null>;
    },
  ): Promise<void> {
    await this.almacen.registrarEvento({
      id: randomUUID(),
      organizacionId,
      tipo,
      en: new Date().toISOString(),
      autorId: datos.autorId ?? null,
      actorId: datos.actorId ?? null,
      invitacionId: datos.invitacionId ?? null,
      detalle: datos.detalle ?? {},
    });
  }

  private baseApp(): string {
    return (
      this.config.get<string>('PULSO_APP_URL')?.replace(/\/$/, '') ??
      'http://localhost:3000'
    );
  }
}

// ── Funciones puras ────────────────────────────────────────────────

/** sha256 en hex. Es lo unico del token que llega a tocar el almacen. */
export function hashDe(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function estadoDe(invitacion: Invitacion, ahora: Date): EstadoInvitacion {
  // El orden importa: una invitacion aceptada y luego vencida sigue siendo
  // "aceptada" — es lo que paso de verdad, y es lo que hay que contarle a quien
  // mira la tabla.
  if (invitacion.aceptadaEn) return 'aceptada';
  if (invitacion.revocadaEn) return 'revocada';
  if (Date.parse(invitacion.expiraEn) <= ahora.getTime()) return 'vencida';
  return 'pendiente';
}

/**
 * Lista blanca, escrita campo por campo, como `estado.service.ts::despojar()`.
 * Si mañana `Invitacion` gana un campo, esto deja de cubrirlo y quien lo
 * agregue TIENE que decidir si puede salir. `tokenHash` es justo el que no.
 */
export function despojarInvitacion(
  invitacion: Invitacion,
  ahora = new Date(),
): InvitacionPublica {
  return {
    id: invitacion.id,
    organizacionId: invitacion.organizacionId,
    correo: invitacion.correo,
    rol: invitacion.rol,
    codigoSede: invitacion.codigoSede,
    estado: estadoDe(invitacion, ahora),
    creadaEn: invitacion.creadaEn,
    expiraEn: invitacion.expiraEn,
    aceptadaEn: invitacion.aceptadaEn,
    revocadaEn: invitacion.revocadaEn,
    invitadaPor: invitacion.invitadaPor,
  };
}

export function despojarActor(actor: Actor): ActorPublico {
  return {
    id: actor.id,
    correo: actor.correo,
    nombre: actor.nombre,
    roles: actor.roles,
    codigoSede: actor.codigoSede,
    activo: actor.activo,
    creadoEn: actor.creadoEn,
    ultimoAccesoEn: actor.ultimoAccesoEn,
    desactivadoEn: actor.desactivadoEn,
  };
}

function normalizarCorreo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  // Minusculas: si no, `Jefe@x.co` y `jefe@x.co` son dos actores distintos de
  // la misma persona y la auditoria se parte en dos.
  const limpio = valor.trim().toLowerCase();
  return CORREO_VALIDO.test(limpio) && limpio.length <= 254 ? limpio : null;
}

function normalizarSede(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio ? limpio : null;
}
