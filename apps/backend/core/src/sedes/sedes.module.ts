import { Module } from '@nestjs/common';
import { SedesService } from './sedes.service';
import { SupabaseService } from './supabase.service';

@Module({
  providers: [SupabaseService, SedesService],
  exports: [SedesService],
})
export class SedesModule {}
