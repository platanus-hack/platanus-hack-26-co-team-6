/**
 * Sesion con actor real — tarea 1.3.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  LO QUE HABIA
 * ═══════════════════════════════════════════════════════════════════
 *  Una contraseña de turno compartida y un token `{ sub: 'operador', exp }`.
 *  Con eso, **cualquiera podia aceptar por cualquier hospital**, y la
 *  pregunta que importa —"¿quien acepto a este paciente?"— no tenia
 *  respuesta posible. La auditoria guardaba que decidio la maquina y nadie
 *  guardaba quien apreto el boton.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  LO QUE HAY AHORA
 * ═══════════════════════════════════════════════════════════════════
 *  Access de 15 minutos que lleva actor, organizacion, roles y alcance
 *  (§3.2), y refresh de 30 dias con rotacion y deteccion de reuso. El
 *  access lleva los roles adentro para no consultar la base en cada
 *  request; el precio es que un rol revocado viviria hasta 15 minutos, y
 *  por eso el guard ademas pregunta por `sid` a `RegistroSesiones`, que es
 *  memoria y no Postgres.
 *
 *  El token sigue siendo `<carga>.<firma>` con HMAC-SHA256 — no hace falta
 *  una libreria de JWT para esto y no se agrega una dependencia por gusto.
 *  Lo que si se agrega es `typ`: sin el, un access sirve de refresh.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  MODO LEGADO — PULSO_AUTH_LEGACY
 * ═══════════════════════════════════════════════════════════════════
 *  La contraseña de turno **sigue funcionando** y emite un token de una
 *  organizacion `demo`. Es lo que permite mergear esto sin bloquear al
 *  equipo: las tres consolas entran igual que ayer mientras la tabla `actor`
 *  (tarea 1.1) no exista.
 *
 *  Viene ENCENDIDO por defecto justamente porque esa tabla no existe: si
 *  llegara apagado, este commit dejaria a todo el mundo fuera. El dia que
 *  1.1 aterrice se apaga con `PULSO_AUTH_LEGACY=false`, y el arranque lo
 *  recuerda en cada boot para que nadie se olvide de que esta abierto.
 *
 * ── SIN CONFIGURAR ─────────────────────────────────────────────────
 *  Como antes: NO cae a un modo permisivo. Sin variables, genera
 *  credenciales aleatorias y las imprime. **La autenticacion es la unica
 *  excepcion a la regla de degradar del repo** — un fallback abierto aqui
 *  es la vulnerabilidad, no la degradacion.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { ActorSesion, CargaAcceso, CargaRefresh } from './carga';
import type { Rol } from './roles';
import { algoritmoActivo } from './contrasena';
import { RegistroSesiones } from './sesiones';

/** §3.2. Corto a proposito: es lo que acota el daño de un token filtrado. */
const ACCESO_MS = 15 * 60 * 1000;
/** Un turno no se interrumpe por volver a escribir la contraseña cada dia. */
const REFRESCO_MS = 30 * 24 * 60 * 60 * 1000;

export const COOKIE_SESION = 'pulso_sesion';
/** Path propio: el refresh NO viaja en cada peticion, solo cuando toca. */
export const COOKIE_REFRESCO = 'pulso_refresco';
export const RUTA_REFRESCO = '/auth/refresh';

/** La organizacion ficticia del modo legado. Se ve a simple vista en la auditoria. */
export const ORG_LEGADO = 'demo';

/**
 * Roles del turno compartido.
 *
 * Es lo que la contraseña de turno YA podia hacer —todo— dicho en voz alta
 * en vez de por omision. No es un permiso nuevo: es el permiso que existia
 * sin nombre. Cuando 1.1 traiga actores, esta lista se borra con el modo.
 */
const ROLES_LEGADO: Rol[] = ['paramedico', 'jefe_urgencias', 'regulador_crue'];

/**
 * Saca el token de las cabeceras: `Authorization: Bearer` (curl, scripts) o
 * la cookie (el navegador). Vive aqui y no en el guard porque el controlador
 * necesita exactamente lo mismo, y dos parsers de cookie que se desincronizan
 * es justo el tipo de bug que abre una puerta.
 */
export function tokenDeCabeceras(
  cabeceras: { authorization?: string; cookie?: string },
  nombre: string = COOKIE_SESION,
): string | undefined {
  if (nombre === COOKIE_SESION) {
    const auth = cabeceras.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  }

  if (!cabeceras.cookie) return undefined;
  for (const parte of cabeceras.cookie.split(';')) {
    const sep = parte.indexOf('=');
    if (sep <= 0) continue;
    if (parte.slice(0, sep).trim() === nombre) {
      return decodeURIComponent(parte.slice(sep + 1).trim());
    }
  }
  return undefined;
}

/** Lo que hace falta para emitir un par de tokens. */
export interface ActorParaToken {
  id: string;
  organizacionId: string;
  roles: Rol[];
  sedes: string[];
  tipo: 'humano' | 'servicio';
}

@Injectable()
export class SesionService implements OnModuleInit {
  private readonly log = new Logger(SesionService.name);

  private secreto: Buffer = randomBytes(32);
  /** sha256 de la contraseña de TURNO. Ver `verificarPasswordLegado`. */
  private passwordDigest: Buffer = randomBytes(32);

  constructor(
    private readonly config: ConfigService,
    private readonly registro: RegistroSesiones,
  ) {}

  async onModuleInit(): Promise<void> {
    const secreto = this.config.get<string>('SESION_SECRET');
    if (secreto && secreto.length >= 16) {
      this.secreto = Buffer.from(secreto, 'utf8');
    } else {
      // Aleatorio en memoria: las sesiones no sobreviven al reinicio. Molesto
      // en desarrollo, inofensivo. Lo contrario (una constante en el repo)
      // permitiria a cualquiera firmar su propia sesion.
      this.secreto = randomBytes(32);
      this.log.warn(
        'SESION_SECRET no configurado (o muy corto): usando uno aleatorio. ' +
          'Las sesiones se invalidan en cada reinicio.',
      );
    }

    const password = this.config.get<string>('OPERADOR_PASSWORD');
    if (password) {
      this.passwordDigest = sha256(password);
    } else {
      const generada = randomBytes(9).toString('base64url');
      this.passwordDigest = sha256(generada);
      this.log.warn(
        '\n──────── [PULSO · contraseña de operador generada] ────────\n' +
          `  ${generada}\n` +
          'Cambia en cada reinicio. Fijala en OPERADOR_PASSWORD.\n' +
          '───────────────────────────────────────────────────────────',
      );
    }

    if (this.legadoActivo()) {
      this.log.warn(
        'PULSO_AUTH_LEGACY activo: la contraseña de turno abre las tres ' +
          `consolas como organizacion '${ORG_LEGADO}' con roles ` +
          `[${ROLES_LEGADO.join(', ')}]. Nadie queda atribuido a una persona. ` +
          'Apagalo con PULSO_AUTH_LEGACY=false cuando existan actores reales.',
      );
    }

    this.log.log(`Contraseñas: ${await algoritmoActivo()}.`);
  }

  /** ¿Sigue abierta la puerta del turno compartido? */
  legadoActivo(): boolean {
    // Encendido salvo que se apague explicitamente: sin la tabla `actor` de
    // 1.1, apagarlo por omision dejaria al equipo entero fuera del sistema.
    return this.config.get<string>('PULSO_AUTH_LEGACY') !== 'false';
  }

  /**
   * La contraseña de turno. Sigue siendo sha256 sin sal **a proposito**: es
   * una credencial efimera, compartida y de un solo uso operativo, no la
   * contraseña de una persona. Las de personas van por `contrasena.ts` con
   * Argon2id/scrypt.
   */
  verificarPasswordLegado(password: string): boolean {
    return igual(sha256(password ?? ''), this.passwordDigest);
  }

  /** Abre sesion y emite los dos tokens. Es el unico sitio que los crea. */
  abrirSesion(actor: ActorParaToken): {
    acceso: string;
    refresco: string;
    sesionId: string;
    expiraEn: number;
  } {
    const sesion = this.registro.abrir(actor.id, REFRESCO_MS);
    return {
      ...this.emitirPar(actor, sesion.id, sesion.jtiVigente),
      sesionId: sesion.id,
    };
  }

  /**
   * ⭐ Rota el refresh y emite un par nuevo.
   *
   * Si el `jti` presentado ya se habia usado, `RegistroSesiones` revoca la
   * cadena completa y esto devuelve null. Quien tenga la copia se queda
   * fuera; el dueño legitimo tambien, y **eso es lo correcto**: su siguiente
   * peticion lo manda al login y ahi se entera de que algo paso.
   */
  rotar(
    carga: CargaRefresh,
    actor: ActorParaToken,
  ): { acceso: string; refresco: string; expiraEn: number } | null {
    const rotacion = this.registro.rotar(carga.sid, carga.jti);
    if (!rotacion.ok) return null;
    return this.emitirPar(actor, carga.sid, rotacion.jti);
  }

  /** La carga del access si el token vale, no expiro y su sesion sigue viva. */
  verificarAcceso(token: string | undefined): CargaAcceso | null {
    const carga = this.abrir<CargaAcceso>(token);
    if (!carga || carga.typ !== 'a') return null;
    // ⭐ Aqui es donde revocar surte efecto al instante en vez de en 15 min.
    if (!this.registro.vigente(carga.sid)) return null;
    return carga;
  }

  /**
   * La carga del refresh. NO consulta si la sesion sigue viva: eso lo decide
   * `rotar()`, que ademas necesita ver el reuso de un `jti` sobre una sesion
   * ya revocada — si se filtrara antes, esa señal se perderia.
   */
  verificarRefresco(token: string | undefined): CargaRefresh | null {
    const carga = this.abrir<CargaRefresh>(token);
    return carga && carga.typ === 'r' ? carga : null;
  }

  /** El actor tal como lo ve el resto de core. */
  actorDeCarga(carga: CargaAcceso): ActorSesion {
    return {
      id: carga.sub,
      organizacionId: carga.org,
      roles: carga.rol,
      sedes: carga.sed,
      tipo: carga.tip,
      sesionId: carga.sid,
      legado: carga.org === ORG_LEGADO,
    };
  }

  /** El actor sintetico del turno compartido. */
  actorLegado(): ActorParaToken {
    return {
      // `legado:` delante para que nadie lo confunda con un uuid de persona
      // al leer la auditoria de hace tres meses.
      id: 'legado:operador',
      organizacionId: ORG_LEGADO,
      roles: ROLES_LEGADO,
      sedes: [],
      tipo: 'humano',
    };
  }

  duracionAccesoMs(): number {
    return ACCESO_MS;
  }

  duracionRefrescoMs(): number {
    return REFRESCO_MS;
  }

  private emitirPar(
    actor: ActorParaToken,
    sid: string,
    jti: string,
  ): { acceso: string; refresco: string; expiraEn: number } {
    const expiraEn = Date.now() + ACCESO_MS;
    const acceso: CargaAcceso = {
      sub: actor.id,
      org: actor.organizacionId,
      rol: actor.roles,
      sed: actor.sedes,
      tip: actor.tipo,
      sid,
      typ: 'a',
      exp: expiraEn,
    };
    const refresco: CargaRefresh = {
      sub: actor.id,
      sid,
      jti,
      typ: 'r',
      exp: Date.now() + REFRESCO_MS,
    };
    return {
      acceso: this.firmarCarga(acceso),
      refresco: this.firmarCarga(refresco),
      expiraEn,
    };
  }

  private firmarCarga(carga: CargaAcceso | CargaRefresh): string {
    const cuerpo = Buffer.from(JSON.stringify(carga)).toString('base64url');
    return `${cuerpo}.${this.firmar(cuerpo)}`;
  }

  /** Firma → expiracion → JSON. En ese orden, y el orden es la seguridad. */
  private abrir<T extends { exp: number }>(
    token: string | undefined,
  ): T | null {
    if (!token) return null;

    const corte = token.lastIndexOf('.');
    if (corte <= 0) return null;

    const carga = token.slice(0, corte);
    const firma = token.slice(corte + 1);

    // Firma primero: sin esto estariamos parseando JSON de un desconocido.
    if (!igual(Buffer.from(firma), Buffer.from(this.firmar(carga))))
      return null;

    try {
      const datos = JSON.parse(
        Buffer.from(carga, 'base64url').toString('utf8'),
      ) as T;
      if (typeof datos?.exp !== 'number' || datos.exp < Date.now()) return null;
      return datos;
    } catch {
      return null;
    }
  }

  private firmar(carga: string): string {
    return createHmac('sha256', this.secreto).update(carga).digest('base64url');
  }
}

function sha256(valor: string): Buffer {
  return createHash('sha256').update(valor, 'utf8').digest();
}

/** timingSafeEqual revienta si las longitudes difieren; esto no. */
function igual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
