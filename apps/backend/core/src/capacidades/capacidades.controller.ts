/**
 * GET /capacidades — en qué modo está corriendo cada integración.
 *
 * Exige sesión: no dice secretos, pero sí dibuja el mapa de qué está y qué no
 * está configurado en el despliegue, y eso no es información de la calle.
 */

import { Controller, Get } from '@nestjs/common';
import type { Capacidades } from '../contracts/types';
import { CapacidadesService } from './capacidades.service';

@Controller('capacidades')
export class CapacidadesController {
  constructor(private readonly capacidades: CapacidadesService) {}

  @Get()
  async actual(): Promise<Capacidades> {
    return this.capacidades.actual();
  }
}
