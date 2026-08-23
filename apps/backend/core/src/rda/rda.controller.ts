/**
 * GET /casos/:id/rda — el borrador de RDA de un caso.
 *
 * ═══ LO QUE NO HAY EN ESTE ARCHIVO ════════════════════════════════
 * No hay POST. No hay `/enviar`, `/reportar` ni `/transmitir`. **La ausencia
 * es la funcionalidad**: el borrador nunca se envía solo. Sale en estado
 * `pendiente` y ahí se queda hasta que un humano lo firme (tarea 4.10).
 *
 * Y no se llama "reportar al IHCE" en ningún lado, porque no lo es: PULSO
 * PRE-LLENA el RDA. Está sin verificar (punto 3 del §0 del plan maestro) si un
 * traslado prehospitalario genera RDA propio o si solo lo genera la IPS
 * receptora. Hasta que eso se confirme, la palabra es "pre-llena".
 *
 * ═══ AUTORIZACIÓN ═════════════════════════════════════════════════
 * Sin `@Publico()`: el guard global exige sesión. Y SIN `@Alcance()` a
 * propósito — un token de servicio (`voz`) cae en el deny por omisión de
 * `token-servicio.ts`. Ningún bot necesita leer un documento clínico que un
 * humano va a firmar; el olvido cierra, no abre.
 */

import { Controller, Get, Param } from '@nestjs/common';
import type { BorradorRda } from './borrador';
import { RdaService } from './rda.service';

@Controller('casos')
export class RdaController {
  constructor(private readonly rda: RdaService) {}

  @Get(':id/rda')
  borrador(@Param('id') id: string): Promise<BorradorRda> {
    return this.rda.borrador(id);
  }
}
