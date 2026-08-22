import { Module } from '@nestjs/common';
import { SedesService } from './sedes.service';
import { SupabaseService } from './supabase.service';

@Module({
  providers: [SupabaseService, SedesService],
  // SupabaseService sale para que CapacidadesService pueda reportar si el
  // catálogo viene de la DB o de las semillas. Solo se le pregunta
  // `disponible()`; el cliente en sí no cruza el módulo.
  exports: [SedesService, SupabaseService],
})
export class SedesModule {}
