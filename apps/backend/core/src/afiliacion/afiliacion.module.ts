import { Module } from '@nestjs/common';
import { SedesModule } from '../sedes/sedes.module';
import { AfiliacionController } from './afiliacion.controller';
import { AfiliacionService } from './afiliacion.service';

/**
 * Afiliación — tareas 2.1 y 2.9.
 *
 * Importa SedesModule porque el cruce contra el REPS es exactamente el mismo
 * catálogo que usa el ruteo: `SedesService` ya decide entre Supabase y las
 * semillas compiladas, y duplicar esa decisión aquí sería tener dos verdades
 * sobre qué sedes existen. `SupabaseService` sale del mismo módulo y solo se
 * le pregunta `disponible()`, para poder decir de dónde salió la respuesta.
 *
 * Exporta el servicio para que el ranking pueda pedirle el filtro de
 * despachabilidad cuando llegue el momento (ver `estados.ts::esDespachable`).
 */
@Module({
  imports: [SedesModule],
  controllers: [AfiliacionController],
  providers: [AfiliacionService],
  exports: [AfiliacionService],
})
export class AfiliacionModule {}
