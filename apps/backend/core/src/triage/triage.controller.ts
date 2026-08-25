/**
 * POST /triage — CARRIL DE NEID
 *
 * Antes vivía en apps/frontend/app/api/triage/route.ts.
 */

import { BadRequestException, Body, Controller, Post, Req } from '@nestjs/common';
import type { TriageRequest, TriageResponse } from '../contracts/types';
import { TriageService } from './triage.service';
import { PulsoError } from '../common/pulso-error.filter';
import { ActorService, type SolicitudConSesion } from '../eventos/actor.service';
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
    private readonly actores: ActorService,
  ) {}

  @Post()
  async procesar(
    @Body() cuerpo: TriageRequest,
    @Req() req: SolicitudConSesion,
  ): Promise<TriageResponse> {
    const texto = (cuerpo?.texto ?? '').trim();
    if (texto.length < MIN_CARACTERES) {
      throw new BadRequestException(
        `Dictado demasiado corto. Mínimo ${MIN_CARACTERES} caracteres.`,
      );
    }
    const result = await this.triage.procesar(cuerpo, texto);
    const actor = this.actores.deSolicitud(req);

    // ⚠️ SIN PII: ni `textoCrudo` ni `origen` entran al detalle. El evento
    // dice QUE se creó un caso y con qué confianza, no qué dijo el dictado.
    await this.registro.registrar({
      casoId: result.caso.id,
      tipo: 'caso_creado',
      actor: { id: actor.id, nombre: actor.nombre, tipo: actor.tipo },
      organizacionId: actor.organizacionId,
      movilId: result.caso.unidad?.id ?? null,
      detalle: {
        triage: result.caso.triage,
        motor: result.caso.confianza >= 0.5 ? 'llm' : 'heuristica',
        confianza: result.caso.confianza,
      },
    });

    const clinical = this.routing.assess(result.caso);
    if (clinical.state !== 'ready_for_matching') {
      const motivo = clinical.reasons[0] as
        'PULSO_LOW_CONFIDENCE' | 'PULSO_INCONSISTENT_TRIAGE';

      // ⭐ La compuerta de seguridad clínica se ejerció, y hasta ahora no
      //    dejaba rastro de haberlo hecho. Sin este evento no hay forma de
      //    demostrar que el sistema paró un caso que no entendía — que es
      //    justo lo que hay que poder demostrar.
      await this.registro.registrar({
        casoId: result.caso.id,
        tipo: 'revision_humana',
        actor: { id: actor.id, nombre: actor.nombre, tipo: actor.tipo },
        organizacionId: actor.organizacionId,
        detalle: {
          motivo,
          confianza: result.caso.confianza,
        },
      });

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
