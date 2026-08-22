/**
 * POST /dispatch — CARRIL DE SEBAS
 *
 * Antes vivía en apps/frontend/app/api/dispatch/route.ts.
 */

import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import type { DispatchRequest, DispatchResponse } from '../contracts/types';
import { DispatchService } from './dispatch.service';
import { PulsoError } from '../common/pulso-error.filter';
import { RoutingService } from '../routing/routing.service';

@Controller('dispatch')
export class DispatchController {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly routing: RoutingService,
  ) {}

  @Post()
  async despachar(@Body() cuerpo: DispatchRequest): Promise<DispatchResponse> {
    if (!cuerpo?.casoId || !cuerpo?.sedeCodigo) {
      throw new BadRequestException('Faltan casoId o sedeCodigo');
    }
    const decision = await this.routing.dispatch(cuerpo.casoId, cuerpo.sedeCodigo);
    if ('error' in decision)
      throw new PulsoError(
        decision.error.error.code,
        decision.error.error.message,
      );
    return this.dispatch.despachar(cuerpo);
  }
}
