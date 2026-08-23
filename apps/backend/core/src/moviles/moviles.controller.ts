/**
 * PUT /moviles/:id/estado — la ambulancia reporta dónde está
 * GET /moviles          — la flota que le corresponde ver a quien pregunta
 *
 * Solo traduce HTTP ↔ dominio. Las decisiones viven en `moviles.service.ts`,
 * `actor.ts` y `posicion.ts`.
 *
 * ── POR QUÉ LA POSICIÓN VA EN EL CUERPO Y NO EN LA URL ────────────
 * Regla 5 del repo: sin PII en logs ni en URLs. Una URL viaja al access log
 * del proxy, al historial del navegador y a cualquier APM enchufado; las
 * coordenadas de una ambulancia con paciente a bordo no pueden ir ahí. El
 * `:id` sí va en la ruta: un indicativo como "AMB-014" es lo que se dice por
 * radio en abierto todo el día.
 *
 * Ninguna de las dos rutas es @Publico(): el guard global las cubre.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { resolverActor, type SolicitudConActor } from './actor';
import { normalizarMovilId, validarReporte } from './posicion';
import {
  MovilesService,
  type MovilVisible,
  type RespuestaMoviles,
} from './moviles.service';

@Controller('moviles')
export class MovilesController {
  constructor(private readonly moviles: MovilesService) {}

  /**
   * La flota. El CRUE ve todos; un operador, solo los suyos.
   *
   * El recorte lo hace el servidor sobre la lista completa (ver `visiblesPara`
   * en actor.ts). Nunca se manda la flota entera "para que el front filtre":
   * eso ya sería la filtración.
   */
  @Get()
  listar(@Req() req: Request): Promise<RespuestaMoviles> {
    return this.moviles.listar(this.actor(req));
  }

  /**
   * `{ lat, lng, velocidadKmh?, precisionM?, disponible }`
   *
   * `precisionM` no estaba en el enunciado de la tarea y se añadió a
   * propósito: la geolocalización del navegador en interiores se equivoca por
   * cientos de metros, y sin el radio de error el mapa del CRUE pinta una
   * certeza falsa. Es opcional — un cliente que no lo mande sigue funcionando.
   */
  @Put(':id/estado')
  async reportar(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() cuerpo: unknown,
  ): Promise<MovilVisible> {
    const movilId = normalizarMovilId(id ?? '');
    if (!movilId) throw new BadRequestException('Falta el identificador del móvil');

    const leido = validarReporte(cuerpo);
    // El motivo se devuelve tal cual: lo lee un paramédico en la consola, no
    // un desarrollador en un stack trace.
    if (!leido.ok) throw new BadRequestException(leido.motivo);

    return await this.moviles.reportar(this.actor(req), movilId, leido.valor);
  }

  /** Único punto donde este controlador se pregunta quién está pidiendo. */
  private actor(req: Request) {
    return resolverActor(
      req as Request & SolicitudConActor,
      this.moviles.configuracionProvisional(),
    );
  }
}
