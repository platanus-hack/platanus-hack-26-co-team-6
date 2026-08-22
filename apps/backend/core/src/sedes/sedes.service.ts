/**
 * Capa de acceso a sedes. Carril de Zaid.
 *
 * REGLA DE ORO: si Supabase no está configurado, esto NO revienta — cae a las
 * semillas y el resto del equipo sigue trabajando. Cuando el ETL termine, se
 * llena `apps/backend/core/.env` y empieza a leer de la DB real sin que nadie
 * más toque una línea.
 *
 * ⚠️ El precio de esa regla: el fallback es SILENCIOSO. Una RPC rota se ve
 *    igual que "no hay credenciales". Por eso cada caída se loguea con
 *    `Logger` — revisen esos logs a propósito.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { Sede } from '../contracts/types';
import { distanciaKm } from '../common/geo';
import { SEDES_MOCK } from './semillas';
import { SupabaseService } from './supabase.service';

@Injectable()
export class SedesService {
  private readonly log = new Logger(SedesService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Sedes candidatas dentro de un radio.
   *
   * Llama a la RPC `sedes_cercanas(p_lat, p_lng, p_radio_m)` que hace el
   * ST_DWithin en PostGIS. La firma de salida NO cambia respecto al fallback —
   * por eso nadie más se entera de cuál de las dos respondió.
   */
  async cercanas(lat: number, lng: number, radioKm = 25): Promise<Sede[]> {
    const sb = this.supabase.obtener();

    if (sb) {
      const { data, error } = await sb.rpc('sedes_cercanas', {
        p_lat: lat,
        p_lng: lng,
        p_radio_m: radioKm * 1000,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        return data as Sede[];
      }
      if (error) {
        this.log.warn(`sedes_cercanas falló, usando semillas: ${error.message}`);
      }
    }

    return SEDES_MOCK.filter(
      (s) => distanciaKm(lat, lng, s.coord.lat, s.coord.lng) <= radioKm,
    );
  }

  async todas(): Promise<Sede[]> {
    const sb = this.supabase.obtener();
    if (sb) {
      const { data, error } = await sb.from('sede').select('*');
      if (!error && Array.isArray(data) && data.length > 0) return data as Sede[];
      if (error) {
        this.log.warn(`select sede falló, usando semillas: ${error.message}`);
      }
    }
    return SEDES_MOCK;
  }

  async porCodigo(codigo: string): Promise<Sede | undefined> {
    const sedes = await this.todas();
    return sedes.find((s) => s.codigo === codigo);
  }
}
