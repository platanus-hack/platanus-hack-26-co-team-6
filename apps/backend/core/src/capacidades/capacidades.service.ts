/**
 * Qué puede hacer el sistema AHORA MISMO.
 *
 * ── POR QUÉ ES NECESARIO ──────────────────────────────────────────
 * Todo core degrada solo cuando falta una credencial: sin ANTHROPIC_API_KEY
 * el triage cae a palabras clave, sin MAPBOX_TOKEN el ETA se estima por regla
 * de tres, sin TELEGRAM_BOT_TOKEN el handshake se imprime en un log. Esa
 * regla mantiene al equipo trabajando sin bloquearse, y es buena.
 *
 * El problema es que hasta ahora esa degradación era INVISIBLE hacia afuera.
 * La consola pintaba "8 min" con la misma tipografía viniera de Mapbox con
 * tráfico o de dividir kilómetros entre 22. En una ambulancia esa diferencia
 * decide si el paramédico confía en el minuto exacto o solo en el orden.
 *
 * Este endpoint hace decible el modo en que está corriendo cada pieza, para
 * que la barra persistente de /campo pueda ser honesta.
 *
 * ── LO QUE NO DEVUELVE ────────────────────────────────────────────
 * Ni una credencial, ni una URL, ni un nombre de proyecto: solo en qué modo
 * está cada integración. Saber que "el ruteo es estimado" no le sirve a un
 * atacante; saber a qué host apunta, sí.
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Capacidades } from '../contracts/types';
import { SupabaseService } from '../sedes/supabase.service';
import { VozService } from '../voz/voz.service';
import { handshakeTimeoutS } from '../common/plazos';

@Injectable()
export class CapacidadesService {
  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly voz: VozService,
  ) {}

  async actual(): Promise<Capacidades> {
    return {
      ia: this.config.get<string>('ANTHROPIC_API_KEY') ? 'llm' : 'heuristico',
      ruteo: this.config.get<string>('MAPBOX_TOKEN') ? 'trafico' : 'estimado',
      // Async porque la primera vez se prueba contra Deepgram qué permisos
      // tiene la key. Después sale de caché.
      voz: await this.voz.modo(),
      canal: this.canal(),
      datos: this.supabase.disponible() ? 'supabase' : 'semillas',
      handshakeTimeoutS: handshakeTimeoutS(this.config),
      ts: new Date().toISOString(),
    };
  }

  /**
   * El canal por el que saldría un handshake ahora mismo.
   *
   * Espeja el orden de CanalesService.notificar(). Se comprueba el par
   * completo token + chat porque con uno solo Telegram no envía nada y el
   * mensaje termina en el log, que es exactamente el modo 'consola'.
   */
  private canal(): Capacidades['canal'] {
    const tg =
      this.config.get<string>('TELEGRAM_BOT_TOKEN') &&
      this.config.get<string>('TELEGRAM_CHAT_ID_DEMO');
    if (tg) return 'telegram';

    const wa =
      this.config.get<string>('WHATSAPP_TOKEN') &&
      this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID') &&
      this.config.get<string>('WHATSAPP_TO_DEMO');
    if (wa) return 'whatsapp';

    return 'consola';
  }
}
