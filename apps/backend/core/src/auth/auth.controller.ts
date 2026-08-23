/**
 * POST /auth/login     — contraseña de turno → cookie de sesión
 * POST /auth/logout    — borra la cookie
 * GET  /auth/sesion    — ¿hay sesión válida? (lo pregunta el front al montar)
 * POST /auth/servicio  — token de servicio (`svc:voz`). Credencial de plataforma.
 *
 * La cookie es HttpOnly a propósito: si el token viviera en localStorage,
 * cualquier XSS en las consolas se lo llevaría. El front nunca lee el token,
 * solo manda `credentials: "include"`.
 */

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { Publico } from './publico.decorator';
import {
  COOKIE_SESION,
  SesionService,
  tokenDeCabeceras,
} from './sesion.service';
import {
  ALCANCE_POR_SERVICIO,
  esAlcance,
  type Alcance,
} from './token-servicio';

interface LoginRequest {
  password?: string;
}

interface ServicioRequest {
  nombre?: string;
  alcance?: string[];
}

/**
 * La credencial de plataforma va en su propia cabecera, no en Authorization:
 * Authorization es la sesión, y confundir las dos haría que un operador con
 * sesión válida pudiera emitir identidades de servicio. No es lo mismo.
 */
const CABECERA_ADMIN = 'x-pulso-admin-token';

@Controller('auth')
export class AuthController {
  private readonly log = new Logger(AuthController.name);

  constructor(
    private readonly sesion: SesionService,
    private readonly config: ConfigService,
  ) {}

  @Publico()
  @Post('login')
  @HttpCode(200)
  login(
    @Body() cuerpo: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): { ok: true; expiraEn: number } {
    if (!this.sesion.verificarPassword(cuerpo?.password ?? '')) {
      // Mensaje único: no distinguimos "falta el campo" de "está mal".
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    const { token, expiraEn } = this.sesion.emitir();
    res.cookie(COOKIE_SESION, token, this.opcionesCookie());
    return { ok: true, expiraEn };
  }

  @Publico()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    res.clearCookie(COOKIE_SESION, { ...this.opcionesCookie(), maxAge: 0 });
    return { ok: true };
  }

  /**
   * Público a propósito: solo devuelve un booleano, y el front lo necesita
   * ANTES de tener sesión para decidir si pinta la consola o el login.
   */
  @Publico()
  @Get('sesion')
  estado(@Req() req: Request): { autenticado: boolean } {
    return {
      autenticado:
        this.sesion.verificar(tokenDeCabeceras(req.headers)) !== null,
    };
  }

  /**
   * Emite el token con el que `voz` habla con core, en vez de la contraseña
   * compartida de los operadores (tarea 1.8).
   *
   * ── QUIÉN PUEDE LLAMARLO ────────────────────────────────────────
   * El doc dice "solo `admin_plataforma`" y ese rol todavía no existe: la
   * identidad real es la tarea 1.3. La salida honesta mientras tanto NO es
   * dejarlo con la contraseña de turno —cualquier operador podría fabricarse
   * un bot— sino exigir una credencial de plataforma propia en
   * PULSO_ADMIN_TOKEN, y **negar por defecto si no está configurada**.
   *
   * @Publico() aquí no significa abierto: significa "no lo protege la sesión
   * de operador, lo protege su propio secreto" — el mismo patrón que el
   * webhook de Telegram. Cuando llegue 1.3, esto se marca con
   * `@Rol('admin_plataforma')`, se quita el @Publico() y desaparece
   * verificarAdminPlataforma().
   *
   * Queda auditado: se registra qué `sub` se emitió, con qué alcance y con qué
   * huella — nunca el token, que es la credencial misma.
   */
  @Publico()
  @Post('servicio')
  @HttpCode(201)
  servicio(
    @Body() cuerpo: ServicioRequest,
    @Req() req: Request,
  ): { sub: string; token: string; alcance: Alcance[]; expiraEn: number } {
    if (!this.sesion.emisionDeServicioHabilitada()) {
      throw new ForbiddenException(
        'Emisión de tokens de servicio deshabilitada: falta PULSO_ADMIN_TOKEN',
      );
    }
    const credencial = req.headers[CABECERA_ADMIN];
    if (
      !this.sesion.verificarAdminPlataforma(
        typeof credencial === 'string' ? credencial : undefined,
      )
    ) {
      throw new ForbiddenException('Credencial de plataforma inválida');
    }

    const nombre = (cuerpo?.nombre ?? '').trim();
    if (!nombre) {
      throw new BadRequestException('Falta `nombre` del servicio (ej. "voz")');
    }

    // Sin `alcance` explícito se usa el del catálogo. Un dedo de más en un
    // curl no puede ser la diferencia entre un bot que notifica y uno que
    // acepta pacientes.
    const pedido = cuerpo?.alcance ?? ALCANCE_POR_SERVICIO[nombre];
    if (!pedido) {
      throw new BadRequestException(
        `El servicio "${nombre}" no tiene alcance por defecto: mándalo en \`alcance\``,
      );
    }
    const invalido = pedido.find((a) => !esAlcance(a));
    if (invalido !== undefined) {
      throw new BadRequestException(`Alcance desconocido: "${invalido}"`);
    }

    let emitido: ReturnType<SesionService['emitirServicio']>;
    try {
      emitido = this.sesion.emitirServicio(nombre, pedido as Alcance[]);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    // Auditoría. Sin PII y sin el token: la huella basta para atar este evento
    // al token que aparezca después en un log de uso. Cuando 3.1 traiga
    // RegistroService, esta línea pasa a ser una fila, no un log.
    this.log.warn(
      `[auditoría] token de servicio emitido: ${emitido.sub} ` +
        `alcance=[${emitido.alcance.join(', ')}] ` +
        `expira=${new Date(emitido.expiraEn).toISOString()} ` +
        `huella=${huella(emitido.token)}`,
    );

    return emitido;
  }

  /**
   * SameSite=Lax basta si front y core comparten sitio (localhost:3000 y
   * localhost:3001 lo comparten: el puerto no cuenta para SameSite). Si los
   * despliegas en dominios distintos, el navegador no mandará la cookie:
   * para eso está COOKIE_CROSS_SITE, que exige además HTTPS.
   */
  private opcionesCookie() {
    const cruzado = this.config.get<string>('COOKIE_CROSS_SITE') === 'true';
    return {
      httpOnly: true,
      sameSite: cruzado ? ('none' as const) : ('lax' as const),
      secure: cruzado || this.config.get<string>('NODE_ENV') === 'production',
      maxAge: this.sesion.duracionMs(),
      path: '/',
    };
  }
}

/** 12 hex del sha256. Identifica el token sin permitir reconstruirlo. */
function huella(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}
