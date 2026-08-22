/**
 * POST /voz/token       — credencial efímera para transcribir en streaming
 * POST /voz/transcribir — el audio ya grabado, transcrito por core
 *
 * Ambas exigen sesión (no llevan @Publico): quien no está en turno no gasta
 * los créditos de transcripción del equipo. Y el audio de /voz/transcribir es
 * el dictado clínico de un paciente real — no es una ruta abierta.
 *
 * Ver el encabezado de voz.service.ts para por qué existen los dos caminos.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';
import type { TokenVozResponse, TranscribirResponse } from '../contracts/types';
import { VozService } from './voz.service';

/** Contenedores que Deepgram digiere sin conversión de por medio. */
const MIMES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg'];

@Controller('voz')
export class VozController {
  constructor(private readonly voz: VozService) {}

  @Post('token')
  async token(): Promise<TokenVozResponse> {
    return this.voz.tokenEfimero();
  }

  /**
   * El body llega como Buffer crudo — main.ts registra `express.raw()` para
   * esta ruta. Sin eso, el parser de JSON intentaría leer un webm y fallaría
   * con un error de sintaxis que no dice nada del problema real.
   */
  // 200 y no el 201 por defecto de Nest: transcribir no crea nada, devuelve
  // una lectura del audio que le mandaron.
  @HttpCode(200)
  @Post('transcribir')
  async transcribir(
    @Body() audio: Buffer,
    @Headers('content-type') tipoMime?: string,
  ): Promise<TranscribirResponse> {
    if (!Buffer.isBuffer(audio) || audio.length === 0) {
      throw new BadRequestException(
        'Se esperaba el audio como cuerpo binario con su Content-Type',
      );
    }

    // El MediaRecorder manda "audio/webm;codecs=opus": se compara el tipo base
    // y el resto viaja a Deepgram tal cual, que sí sabe qué hacer con el codec.
    const base = (tipoMime ?? '').split(';')[0].trim().toLowerCase();
    if (!MIMES.includes(base)) {
      throw new BadRequestException(
        `Content-Type no soportado: ${base || 'ausente'}. Use uno de: ${MIMES.join(', ')}`,
      );
    }

    return this.voz.transcribir(audio, tipoMime ?? base);
  }
}
