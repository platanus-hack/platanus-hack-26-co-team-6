/**
 * GET /casos/:id/origen — dónde se recoge al paciente de UN caso.
 *
 * Este endpoint es la salida que el comentario de `CasoPublico` dejó escrita:
 * `origen` no viaja en el listado de `/estado` y no se re-abre ahí — se expone
 * **por caso, en su propia ruta, con su propia autorización**. La diferencia
 * no es cosmética: quien raspa `/estado` cada 2 s se lleva la foto de toda la
 * red; quien pide un origen tiene que nombrar un caso concreto, pasar por el
 * guard, y deja un rastro de a cuál miró.
 *
 * Autorización HOY: la sesión de operador (guard global). Cuando 1.3 traiga
 * el actor real, aquí se recorta a la tripulación del caso y al regulador —
 * este comentario es el sitio exacto donde hacerlo. Los tokens de servicio no
 * entran: la ruta no está en la lista blanca de `token-servicio.ts`, y ese
 * cierre por omisión es deliberado (`svc:voz` reporta casos, no los ubica).
 */

import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import type { Coordenada } from '../contracts/types';
import { AlmacenService } from '../almacen/almacen.service';

@Controller('casos')
export class OrigenController {
  constructor(private readonly almacen: AlmacenService) {}

  @Get(':id/origen')
  origen(@Param('id') id: string): { casoId: string; origen: Coordenada } {
    const caso = this.almacen.obtenerCaso(id);
    if (!caso) {
      // El mensaje no distingue "no existe" de "existió y se reinició core":
      // para quien pregunta son lo mismo, y enumerar ids no es un servicio
      // que este endpoint quiera prestar.
      throw new NotFoundException('Caso no disponible');
    }
    return { casoId: caso.id, origen: caso.origen };
  }
}
