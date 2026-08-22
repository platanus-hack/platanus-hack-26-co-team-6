/**
 * POST /triage — CARRIL DE NEID
 *
 * Antes vivía en apps/frontend/app/api/triage/route.ts.
 */

import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import type { TriageRequest, TriageResponse } from '../contracts/types';
import { TriageService } from './triage.service';

/** Debajo de esto no hay dictado, hay ruido. */
const MIN_CARACTERES = 10;

@Controller('triage')
export class TriageController {
  constructor(private readonly triage: TriageService) {}

  @Post()
  async procesar(@Body() cuerpo: TriageRequest): Promise<TriageResponse> {
    const texto = (cuerpo?.texto ?? '').trim();
    if (texto.length < MIN_CARACTERES) {
      throw new BadRequestException(
        `Dictado demasiado corto. Mínimo ${MIN_CARACTERES} caracteres.`,
      );
    }
    return this.triage.procesar(cuerpo, texto);
  }
}
