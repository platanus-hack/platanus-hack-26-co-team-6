/**
 * POST /dispatch — CARRIL DE SEBAS
 *
 * Antes vivía en apps/frontend/app/api/dispatch/route.ts.
 */

import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import type { DispatchRequest, DispatchResponse } from '../contracts/types';
import { DispatchService } from './dispatch.service';

@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Post()
  async despachar(@Body() cuerpo: DispatchRequest): Promise<DispatchResponse> {
    if (!cuerpo?.casoId || !cuerpo?.sedeCodigo) {
      throw new BadRequestException('Faltan casoId o sedeCodigo');
    }
    return this.dispatch.despachar(cuerpo);
  }
}
