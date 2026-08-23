/**
 * GET /casos/:id/eventos — la linea de tiempo de un caso. Tarea 3.1.
 *
 * ⚠️ ALCANCE: hoy exige sesion (el guard global) pero **no filtra por
 *    organizacion**, porque `caso` todavia no tiene dueño — eso llega con
 *    1.2 (Neid) y las policies de 1.6. Cuando existan, aqui va el filtro por
 *    `caso_acceso` (§10.3) y este aviso se borra.
 *
 *    Mientras tanto no expongan esta ruta fuera del equipo: devuelve la linea
 *    de tiempo de cualquier caso a cualquier sesion valida.
 */

import { Controller, Get, Param } from '@nestjs/common';
import { RegistroService } from './registro.service';
import type { EventoCaso } from './tipos';

@Controller('casos')
export class EventosController {
  constructor(private readonly registro: RegistroService) {}

  @Get(':id/eventos')
  async deCaso(@Param('id') id: string): Promise<{ eventos: EventoCaso[] }> {
    return { eventos: await this.registro.deCaso(id) };
  }
}
