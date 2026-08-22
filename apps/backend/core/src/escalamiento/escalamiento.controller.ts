/**
 * POST /escalamiento         — /campo pasa el caso a un regulador humano
 * POST /escalamiento/atender — /crue lo toma
 *
 * Solo traduce HTTP ↔ dominio. La lógica vive en EscalamientoService.
 */

import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import type {
  AtenderEscalamientoRequest,
  AtenderEscalamientoResponse,
  EscalarRequest,
  EscalarResponse,
  MotivoEscalamiento,
} from '../contracts/types';
import { EscalamientoService } from './escalamiento.service';

const MOTIVOS: MotivoEscalamiento[] = [
  'sin-candidatos',
  'candidatos-agotados',
  'solicitud-paramedico',
];

@Controller('escalamiento')
export class EscalamientoController {
  constructor(private readonly escalamiento: EscalamientoService) {}

  @Post()
  escalar(@Body() cuerpo: EscalarRequest): EscalarResponse {
    if (!cuerpo?.casoId) throw new BadRequestException('Falta casoId');
    // El motivo se valida contra la lista: es lo que el regulador lee para
    // decidir por dónde empezar, así que un string libre lo haría inútil.
    if (!MOTIVOS.includes(cuerpo.motivo)) {
      throw new BadRequestException(
        `motivo debe ser uno de: ${MOTIVOS.join(', ')}`,
      );
    }
    return this.escalamiento.escalar(cuerpo);
  }

  @Post('atender')
  atender(
    @Body() cuerpo: AtenderEscalamientoRequest,
  ): AtenderEscalamientoResponse {
    if (!cuerpo?.escalamientoId) {
      throw new BadRequestException('Falta escalamientoId');
    }
    return this.escalamiento.atender(cuerpo);
  }
}
