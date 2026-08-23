/**
 * Módulo de la flota (tarea 3.7).
 *
 * El almacén se registra por token: `ALMACEN_MOVILES` es hoy un `Map` en RAM y
 * mañana el store de Postgres de la tarea 1.2 / 3.6. Cambiar de uno a otro es
 * cambiar este provider y nada más.
 */

import { Module } from '@nestjs/common';
import { SedesModule } from '../sedes/sedes.module';
import { MovilesController } from './moviles.controller';
import { MovilesService } from './moviles.service';
import { TrazaRepositorio } from './traza.repositorio';
import { ALMACEN_MOVILES, MovilesMemoria } from './moviles.almacen';

@Module({
  // SedesService da la localidad de la sede más cercana, que es de donde sale
  // la agrupación por localidad del mapa de cobertura.
  imports: [SedesModule],
  controllers: [MovilesController],
  providers: [
    MovilesService,
    { provide: ALMACEN_MOVILES, useClass: MovilesMemoria },
    TrazaRepositorio,
  ],
  // Sale para 4.3 (ETA vivo desde la posición del móvil).
  exports: [MovilesService],
})
export class MovilesModule {}
