/**
 * GET /estado — estado vivo del sistema.
 *
 * GET /estado?casoId=xxx → filtra a un solo caso.
 * Antes vivía en apps/frontend/app/api/estado/route.ts.
 */

import { Controller, Get, Query } from '@nestjs/common';
import { EstadoService, type EstadoResponse } from './estado.service';

@Controller('estado')
export class EstadoController {
  constructor(private readonly estado: EstadoService) {}

  @Get()
  async instantanea(@Query('casoId') casoId?: string): Promise<EstadoResponse> {
    return this.estado.instantanea(casoId);
  }
}
