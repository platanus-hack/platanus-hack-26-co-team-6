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

    // ⚠️ UNA URL INVÁLIDA NO PUEDE TUMBAR EL ARRANQUE.
    //
    //    `createClient` LANZA si la URL no es http(s), y `onModuleInit` que
    //    lanza mata el proceso entero. El caso real que lo destapó: alguien
    //    puso la cadena de conexión de Postgres en SUPABASE_URL —se parecen,
    //    las dos salen del mismo panel de Supabase— y core dejó de arrancar
    //    con un error de la librería que no menciona la variable culpable.
    //
    //    Es incoherente con la regla de arriba: si faltar la credencial es un
    //    modo válido, tenerla mal escrita no puede ser peor que no tenerla.
    if (!/^https?:\/\//i.test(url)) {
      this.log.error(
        `SUPABASE_URL no es una URL http(s): "${url.slice(0, 12)}…". ` +
          'Es la URL del proyecto (Settings → API), no la cadena de conexión ' +
          'de Postgres — esa va en PULSO_ROUTING_DATABASE_URL. ' +
          'Se usarán las semillas.',
      );
      return;
    }

    try {
      this.cliente = createClient(url, llave, {
        auth: { persistSession: false },
      });
      this.log.log('Cliente de Supabase listo.');
    } catch (e) {
      // Cinturón sobre tirantes: si la librería rechaza la URL por otra razón,
      // se cae a semillas en vez de impedir el arranque.
      this.log.error(`No pude crear el cliente de Supabase: ${String(e)}`);
    }
  }

  /** null cuando no hay credenciales. Quien llame decide el fallback. */
  obtener(): SupabaseClient | null {
    return this.cliente;
  }

  disponible(): boolean {
    return this.cliente !== null;
  }
}
