/**
 * POST /handshake/respond — CARRIL DE SEBAS
 *
 * Solo traduce HTTP ↔ dominio. La lógica está en HandshakeService, porque el
 * webhook de Telegram la llama también.
 */

import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import type { RespondRequest, RespondResponse } from '../contracts/types';
import { HandshakeService } from './handshake.service';

@Controller('handshake')
export class HandshakeController {
  constructor(private readonly handshake: HandshakeService) {}

  @Post('respond')
  async responder(
    @Body() cuerpo: RespondRequest,
  ): Promise<RespondResponse> {
    if (!cuerpo?.handshakeId || !cuerpo?.decision) {
      throw new BadRequestException('Faltan handshakeId o decision');
    }
    return this.handshake.procesarRespuesta(cuerpo);
  }
}
