/**
 * POST /casos/:id/override — el regulador del CRUE fuerza un destino.
 *
 * Vive en el módulo de escalamiento porque es su desenlace: el caso llegó al
 * tablero del CRUE precisamente porque el ruteo automático no cerró, y esto
 * es lo que el regulador hace después.
 *
 * ── POR QUÉ ESTE ENDPOINT EXISTE ──────────────────────────────────
 * Hasta ahora la consola despachaba con `POST /dispatch` y escribía la
 * justificación en el `localStorage` del navegador. Una decisión que la ley
 * le atribuye al regulador (Res. 1220/2010) vivía en la caché de un Chrome:
 * se borraba al limpiar el navegador, no la veía ningún otro regulador y
 * ningún servidor había comprobado que existiera.
 *
 * Ahora el servidor exige la justificación, comprueba el rol y escribe el
 * `evento_caso`. La UI sigue pidiendo doble confirmación — eso no lo
 * reemplaza un endpoint.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ActorService,
  type SolicitudConSesion,
} from '../eventos/actor.service';
import {
  EscalamientoService,
  type OverrideRequest,
  type OverrideResponse,
} from './escalamiento.service';

type CuerpoOverride = Omit<OverrideRequest, 'casoId'>;

@Controller('casos')
export class OverrideController {
  constructor(
    private readonly escalamiento: EscalamientoService,
    private readonly actores: ActorService,
  ) {}

  @Post(':id/override')
  override(
    @Param('id') casoId: string,
    @Body() cuerpo: CuerpoOverride,
    @Req() req: SolicitudConSesion,
  ): Promise<OverrideResponse> {
    if (!cuerpo?.sedeCodigo?.trim()) {
      throw new BadRequestException('Falta sedeCodigo: un override elige destino');
    }
    // La misma regla se vuelve a comprobar en el servicio. No es descuido:
    // el 400 de aquí es para que la consola diga qué falta, y el del
    // servicio es el que hace cumplir la regla venga de donde venga la
    // llamada.
    if (!cuerpo?.justificacion?.trim()) {
      throw new BadRequestException(
        'La justificación es obligatoria: el override es una decisión humana ' +
          'con potestad legal y sin motivo escrito no es auditable.',
      );
    }

    return this.escalamiento.override(
      { ...cuerpo, casoId },
      this.actores.deSolicitud(req),
    );
  }
}
