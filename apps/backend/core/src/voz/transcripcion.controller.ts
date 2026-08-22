/**
 * POST /voz/transcribir — dictado grabado → texto.
 *
 * ── POR QUÉ EXISTE ESTE CAMINO ────────────────────────────────────
 * El dictado de /campo usa la Web Speech API del navegador, que es gratis e
 * instantánea… donde existe. **Firefox no la trae y Safari/iOS tampoco.** En
 * esos navegadores el botón de dictar no hacía nada útil y el paramédico
 * tenía que teclear el caso con el paciente en la camilla.
 *
 * Aquí el navegador graba con MediaRecorder y manda el audio; core se lo pasa
 * a ai-core, que habla con el proveedor de STT. Funciona en cualquier
 * navegador con micrófono.
 *
 * Como efecto lateral resuelve el otro problema del dictado local: un audio
 * grabado se puede GUARDAR y reintentar cuando vuelva la señal. La Web Speech
 * API, en una zona muerta, pierde lo dicho.
 *
 * ── POR QUÉ PASA POR CORE Y NO VA DIRECTO A ai-core ───────────────
 * ai-core es interno: no tiene CORS ni sesión, y no debería ser alcanzable
 * desde el navegador. core es la única puerta, y aquí además se comprueba la
 * sesión del turno antes de gastar créditos de transcripción.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiCoreClient } from '../ai-core/ai-core.client';

/** Contenedores que los MediaRecorder de los navegadores producen. */
const MIMES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-m4a',
];

export interface TranscribirResponse {
  texto: string;
  proveedor: string;
  latenciaMs: number;
}

@Controller('voz')
export class TranscripcionController {
  private readonly log = new Logger(TranscripcionController.name);

  constructor(private readonly aiCore: AiCoreClient) {}

  /**
   * El cuerpo llega como Buffer crudo — main.ts registra `express.raw()` para
   * esta ruta. Sin eso, el parser de JSON intentaría leer un webm y fallaría
   * con un error de sintaxis que no dice nada del problema real.
   */
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
    // y el resto viaja tal cual, que sí dice qué codec traen los datos.
    const base = (tipoMime ?? '').split(';')[0].trim().toLowerCase();
    if (!MIMES.includes(base)) {
      throw new BadRequestException(
        `Content-Type no soportado: ${base || 'ausente'}`,
      );
    }

    if (!this.aiCore.configurado()) {
      // 503 y no 500: no es un bug, es una capacidad ausente. La UI lo lee así
      // y deja el textarea como camino en vez de pintar un error rojo.
      throw new ServiceUnavailableException(
        'Transcripción no disponible: ai-core no está configurado',
      );
    }

    const r = await this.aiCore.transcribir(audio, tipoMime ?? base);
    this.log.log(
      `transcritos ${(audio.length / 1024).toFixed(0)} KB por ${r.proveedor} ` +
        `en ${r.latenciaMs}ms · ${r.texto.length} caracteres`,
    );
    return r;
  }
}
