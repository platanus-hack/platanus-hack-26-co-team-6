/**
 * POST /triage — CARRIL DE NEID
 *
 * Antes vivía en apps/frontend/app/api/triage/route.ts.
 */

import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import type { TriageRequest, TriageResponse } from '../contracts/types';
import { TriageService } from './triage.service';
import { PulsoError } from '../common/pulso-error.filter';
import { RoutingService } from '../routing/routing.service';

/** Debajo de esto no hay dictado, hay ruido. */
const MIN_CARACTERES = 10;

@Controller('triage')
export class TriageController {
  constructor(
    private readonly triage: TriageService,
    private readonly routing: RoutingService,
  ) {}

  @Post()
  async procesar(@Body() cuerpo: TriageRequest): Promise<TriageResponse> {
    const texto = (cuerpo?.texto ?? '').trim();
    if (texto.length < MIN_CARACTERES) {
      throw new BadRequestException(
        `Dictado demasiado corto. Mínimo ${MIN_CARACTERES} caracteres.`,
      );
    }
    const result = await this.triage.procesar(cuerpo, texto);
    const clinical = this.routing.assess(result.caso);
    if (clinical.state !== 'ready_for_matching')
      throw new PulsoError(
        clinical.reasons[0] as
          'PULSO_LOW_CONFIDENCE' | 'PULSO_INCONSISTENT_TRIAGE',
        'Clinical review is required before matching',
      );
    return result;
  }
}
