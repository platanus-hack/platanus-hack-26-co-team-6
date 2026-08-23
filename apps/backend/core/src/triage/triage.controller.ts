/**
 * POST /triage — CARRIL DE NEID
 *
 * Antes vivía en apps/frontend/app/api/triage/route.ts.
 */

import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import type { TriageRequest, TriageResponse } from '../contracts/types';
import { TriageService } from './triage.service';
import { PulsoError } from '../common/pulso-error.filter';
import { RegistroService } from '../eventos/registro.service';
import { RoutingService } from '../routing/routing.service';

/** Debajo de esto no hay dictado, hay ruido. */
const MIN_CARACTERES = 10;

@Controller('triage')
export class TriageController {
  constructor(
    private readonly triage: TriageService,
    private readonly routing: RoutingService,
    private readonly registro: RegistroService,
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

    // ⚠️ SIN PII: ni `textoCrudo` ni `origen` entran al detalle. El evento
    // dice QUE se creó un caso y con qué confianza, no qué dijo el dictado.
    await this.registro.registrar({
      casoId: result.caso.id,
      tipo: 'caso_creado',
      movilId: result.caso.unidad?.id ?? null,
      detalle: {
        triage: result.caso.triage,
        motor: result.caso.confianza >= 0.5 ? 'llm' : 'heuristica',
        confianza: result.caso.confianza,
      },
    });

    const clinical = this.routing.assess(result.caso);
    if (clinical.state !== 'ready_for_matching') {
      // ⭐ La compuerta de seguridad clínica se ejerció, y hasta ahora no
      //    dejaba rastro de haberlo hecho. Sin este evento no hay forma de
      //    demostrar que el sistema paró un caso que no entendía — que es
      //    justo lo que hay que poder demostrar.
      await this.registro.registrar({
        casoId: result.caso.id,
        tipo: 'revision_humana',
        detalle: {
          motivo: clinical.reasons[0],
          confianza: result.caso.confianza,
        },
      });
      throw new PulsoError(
        clinical.reasons[0] as
          'PULSO_LOW_CONFIDENCE' | 'PULSO_INCONSISTENT_TRIAGE',
        'Clinical review is required before matching',
      );
    }
    return result;
  }
}
