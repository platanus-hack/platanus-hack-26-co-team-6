/**
 * GET /demo-sintetico — ¿esto que estoy viendo es real?
 *
 * `GET /capacidades` sería el sitio natural, pero el tipo `Capacidades` vive
 * en `contracts/types.ts`, que es ley y no se toca en silencio (regla 1).
 * Añadirle un campo —aunque fuera opcional— obliga a mover también el espejo
 * de `apps/frontend/lib/types.ts`, y eso es trabajo de otro carril.
 *
 * Así que la visibilidad va en su propia ruta: no rompe a nadie, y la barra
 * de /campo puede consultarla cuando alguien quiera pintarla. Devuelve solo
 * conteos y una advertencia — ni un dato de un caso.
 */

import { Controller, Get } from '@nestjs/common';
import { SemillasDemoService } from './semillas-demo.service';

@Controller('demo-sintetico')
export class SemillasDemoController {
  constructor(private readonly semillas: SemillasDemoService) {}

  @Get()
  estado() {
    return this.semillas.resumen();
  }
}
