/**
 * POST /auth/login   — contraseña de turno → cookie de sesión
 * POST /auth/logout  — borra la cookie
 * GET  /auth/sesion  — ¿hay sesión válida? (lo pregunta el front al montar)
 *
 * La cookie es HttpOnly a propósito: si el token viviera en localStorage,
 * cualquier XSS en las consolas se lo llevaría. El front nunca lee el token,
 * solo manda `credentials: "include"`.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Publico } from './publico.decorator';
import {
  COOKIE_SESION,
  SesionService,
  tokenDeCabeceras,
} from './sesion.service';

interface LoginRequest {
  password?: string;
}

@Controller('auth')
export class AuthController {
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
