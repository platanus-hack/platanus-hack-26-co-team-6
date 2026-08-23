/**
 * POST /auth/login    — identificador + contraseña (o contraseña de turno) → cookies
 * POST /auth/refresh  — rota el refresh y renueva el access
 * POST /auth/logout   — REVOCA la sesion, no solo borra la cookie
 * GET  /auth/sesion   — ¿hay sesion valida? (lo pregunta el front al montar)
 * GET  /auth/yo       — quien soy: organizacion, roles y alcance
 *
 * La cookie es HttpOnly a proposito: si el token viviera en localStorage,
 * cualquier XSS en las consolas se lo llevaria. El front nunca lee el token,
 * solo manda `credentials: "include"`. Eso ya estaba bien y no se toca.
 *
 * Lo que agrega 1.3:
 *   · dos cookies, no una. El refresh va con `path=/auth/refresh` para que NO
 *     viaje en cada peticion: si el access se filtra, dura 15 minutos; el
 *     refresh ni siquiera pasa por ahi.
 *   · logout revoca la sesion en el servidor. Borrar la cookie no invalidaba
 *     nada: quien tuviera una copia del token seguia dentro 12 horas.
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { ActorSesion } from './carga';
import { Actor } from './rol.decorator';
import { Publico } from './publico.decorator';
import { BloqueoLogin } from './bloqueo';
import { HASH_SENUELO, RepoActoresMemoria } from './actores';
import {
  verificar as verificarClave,
  requiereRehash,
  hashear,
} from './contrasena';
import {
  COOKIE_REFRESCO,
  COOKIE_SESION,
  RUTA_REFRESCO,
  SesionService,
  tokenDeCabeceras,
  type ActorParaToken,
} from './sesion.service';
import { RegistroSesiones } from './sesiones';

interface LoginRequest {
  /** Correo o documento. Ausente = login de turno (modo legado). */
  identificador?: string;
  password?: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly sesion: SesionService,
    private readonly config: ConfigService,
    private readonly actores: RepoActoresMemoria,
    private readonly bloqueo: BloqueoLogin,
    private readonly registro: RegistroSesiones,
  ) {}

  @Publico()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() cuerpo: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true; expiraEn: number; legado: boolean }> {
    const identificador = cuerpo?.identificador?.trim() ?? '';
    const password = cuerpo?.password ?? '';
    const ip = ipDe(req);

    // Bloqueo progresivo por cuenta Y por IP, antes de tocar el hash: si se
    // mirara despues, cada intento seguiria costando una derivacion de clave
    // y el bloqueo no protegeria de nada.
    const espera = this.bloqueo.esperaRestanteS(identificador || 'turno', ip);
    if (espera > 0) {
      res.setHeader('Retry-After', String(espera));
      throw new ForbiddenException(
        `Demasiados intentos. Reintenta en ${espera} s.`,
      );
    }

    const actor = identificador
      ? await this.actorDeCredenciales(identificador, password)
      : this.actorDeTurno(password);

    if (!actor) {
      this.bloqueo.registrarFallo(identificador || 'turno', ip);
      // Mensaje unico: no distinguimos "no existe" de "esta mal". Distinguir
      // convierte el login en un enumerador de cuentas validas.
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    this.bloqueo.registrarExito(identificador || 'turno');

    const { acceso, refresco, expiraEn } = this.sesion.abrirSesion(actor);
    this.ponerCookies(res, acceso, refresco);
    return { ok: true, expiraEn, legado: !identificador };
  }

  /**
   * ⭐ Rotacion con deteccion de reuso (§3.3).
   *
   * Publico porque, por definicion, se llama cuando el access ya expiro: la
   * prueba de identidad es el propio refresh firmado, no una sesion vigente.
   */
  @Publico()
  @Post('refresh')
  @HttpCode(200)
  async refrescar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true; expiraEn: number }> {
    const carga = this.sesion.verificarRefresco(
      tokenDeCabeceras(req.headers, COOKIE_REFRESCO),
    );
    if (!carga) throw new UnauthorizedException('Sesion expirada');

    const actor = await this.actorParaToken(carga.sub);
    if (!actor) throw new UnauthorizedException('Sesion expirada');

    const par = this.sesion.rotar(carga, actor);
    if (!par) {
      // Puede ser un refresh reusado —y entonces `RegistroSesiones` ya revoco
      // la cadena y emitio el evento— o simplemente una sesion vencida. Al
      // cliente se le dice lo mismo en los dos casos; la diferencia queda en
      // el registro de seguridad, que es donde sirve.
      this.borrarCookies(res);
      throw new UnauthorizedException('Sesion expirada');
    }

    this.ponerCookies(res, par.acceso, par.refresco);
    return { ok: true, expiraEn: par.expiraEn };
  }

  /**
   * Revoca la sesion ademas de borrar las cookies.
   *
   * Publico porque tiene que funcionar con un access ya expirado: si exigiera
   * sesion valida, cerrar sesion seria imposible justo cuando mas se quiere.
   */
  @Publico()
  @Post('logout')
  @HttpCode(200)
  logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): { ok: true } {
    const carga =
      this.sesion.verificarAcceso(tokenDeCabeceras(req.headers)) ??
      this.sesion.verificarRefresco(
        tokenDeCabeceras(req.headers, COOKIE_REFRESCO),
      );
    if (carga) this.registro.revocar(carga.sid, 'logout');

    this.borrarCookies(res);
    return { ok: true };
  }

  /**
   * Publico a proposito: solo devuelve un booleano, y el front lo necesita
   * ANTES de tener sesion para decidir si pinta la consola o el login.
   */
  @Publico()
  @Get('sesion')
  estado(@Req() req: Request): { autenticado: boolean } {
    return {
      autenticado:
        this.sesion.verificarAcceso(tokenDeCabeceras(req.headers)) !== null,
    };
  }

  /**
   * Quien soy. Lo consume el shell de `/panel` (2.7) para pintar la
   * navegacion segun el rol, y cualquier consola que quiera decir "estas
   * respondiendo como el Hospital X".
   *
   * No devuelve el token ni nada que sirva para autenticarse: solo identidad.
   */
  @Get('yo')
  yo(@Actor() actor: ActorSesion): { actor: ActorSesion } {
    return { actor };
  }

  /** Credenciales de una persona. Argon2id/scrypt, nunca sha256. */
  private async actorDeCredenciales(
    identificador: string,
    password: string,
  ): Promise<ActorParaToken | null> {
    const registrado = await this.actores.porIdentificador(identificador);

    // Se verifica SIEMPRE, aunque el actor no exista: contra un hash señuelo.
    // Sin esto, un identificador inexistente responde en 1 ms y uno real en
    // 60 ms, y esa diferencia es un enumerador de cuentas.
    const hash = registrado?.hash ?? HASH_SENUELO;
    const coincide = await verificarClave(password, hash);

    if (!registrado || !registrado.activo || !coincide) return null;

    // Rehash oportunista: el dia que se instale argon2, cada login va
    // migrando su propio hash sin pedirle nada a nadie.
    if (await requiereRehash(registrado.hash)) {
      await this.actores.guardarHash(registrado.id, await hashear(password));
    }

    return {
      id: registrado.id,
      organizacionId: registrado.organizacionId,
      roles: registrado.roles,
      sedes: registrado.sedes,
      tipo: registrado.tipo,
    };
  }

  /** La contraseña de turno. Solo si PULSO_AUTH_LEGACY sigue encendido. */
  private actorDeTurno(password: string): ActorParaToken | null {
    if (!this.sesion.legadoActivo()) return null;
    return this.sesion.verificarPasswordLegado(password)
      ? this.sesion.actorLegado()
      : null;
  }

  /** El actor de un refresh: puede ser una persona o el turno compartido. */
  private async actorParaToken(sub: string): Promise<ActorParaToken | null> {
    if (sub === this.sesion.actorLegado().id) {
      return this.sesion.legadoActivo() ? this.sesion.actorLegado() : null;
    }

    const registrado = await this.actores.porId(sub);
    if (!registrado?.activo) return null;

    // Los roles se releen del repositorio en cada refresh: si a alguien le
    // quitaron un rol, lo pierde como mucho al siguiente refresh aunque nadie
    // haya revocado su sesion a mano.
    return {
      id: registrado.id,
      organizacionId: registrado.organizacionId,
      roles: registrado.roles,
      sedes: registrado.sedes,
      tipo: registrado.tipo,
    };
  }

  private ponerCookies(res: Response, acceso: string, refresco: string): void {
    res.cookie(COOKIE_SESION, acceso, {
      ...this.opcionesCookie(),
      maxAge: this.sesion.duracionAccesoMs(),
    });
    res.cookie(COOKIE_REFRESCO, refresco, {
      ...this.opcionesCookie(),
      // El refresh NO viaja en cada peticion: solo cuando se va a rotar.
      path: RUTA_REFRESCO,
      maxAge: this.sesion.duracionRefrescoMs(),
    });
  }

  private borrarCookies(res: Response): void {
    res.clearCookie(COOKIE_SESION, { ...this.opcionesCookie(), maxAge: 0 });
    res.clearCookie(COOKIE_REFRESCO, {
      ...this.opcionesCookie(),
      path: RUTA_REFRESCO,
      maxAge: 0,
    });
  }

  /**
   * SameSite=Lax basta si front y core comparten sitio (localhost:3000 y
   * localhost:3001 lo comparten: el puerto no cuenta para SameSite). Si los
   * despliegas en dominios distintos, el navegador no mandara la cookie:
   * para eso esta COOKIE_CROSS_SITE, que exige ademas HTTPS.
   */
  private opcionesCookie() {
    const cruzado = this.config.get<string>('COOKIE_CROSS_SITE') === 'true';
    return {
      httpOnly: true,
      sameSite: cruzado ? ('none' as const) : ('lax' as const),
      secure: cruzado || this.config.get<string>('NODE_ENV') === 'production',
      path: '/',
    };
  }
}

/** La IP real detras del proxy de Render, o la del socket en local. */
function ipDe(req: Request): string {
  const reenviada = req.headers['x-forwarded-for'];
  const primera = Array.isArray(reenviada) ? reenviada[0] : reenviada;
  return (primera?.split(',')[0] ?? req.ip ?? 'desconocida').trim();
}
