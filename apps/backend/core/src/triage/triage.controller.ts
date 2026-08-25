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
    if (clinical.state !== 'ready_for_matching') {
      const motivo = clinical.reasons[0] as
        'PULSO_LOW_CONFIDENCE' | 'PULSO_INCONSISTENT_TRIAGE';
      // La consola de campo manda `permitirRevision`: tiene a un humano
      // delante que puede corregir los campos y confirmar (regla 6 — el
      // humano decide). Se le entrega el caso CON la marca de revision
      // requerida; /match lo seguira rechazando hasta que traiga
      // `revisionHumana`. Los canales sin humano (voz) no mandan la
      // bandera y conservan el 4xx de siempre.
      if (cuerpo.permitirRevision) {
        return { ...result, revision: { requerida: true, motivo } };
      }
      throw new PulsoError(motivo, 'Clinical review is required before matching');
    }
    return result;
  }
}
