/**
 * Cliente de Supabase del lado servidor.
 *
 * Usa la service role key, que se salta RLS. Esta llave NUNCA puede vivir en
 * el front — esa es la razón de fondo por la que el backend salió de Next.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly log = new Logger(SupabaseService.name);
  private cliente: SupabaseClient | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('SUPABASE_URL');
    const llave =
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY') ??
      this.config.get<string>('SUPABASE_ANON_KEY');

    if (!url || !llave) {
      // Arrancar sin credenciales es un modo de operación válido, no un error:
      // el equipo entero trabaja contra semillas hasta que el ETL esté listo.
      this.log.warn('Sin credenciales de Supabase — se usarán las semillas.');
      return;
    }

    this.cliente = createClient(url, llave, {
      auth: { persistSession: false },
    });
    this.log.log('Cliente de Supabase listo.');
  }

  /** null cuando no hay credenciales. Quien llame decide el fallback. */
  obtener(): SupabaseClient | null {
    return this.cliente;
  }

  disponible(): boolean {
    return this.cliente !== null;
  }
}
