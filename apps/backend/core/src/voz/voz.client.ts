/**
 * Cliente del servicio `voz`. El único archivo de core que sabe su URL.
 *
 * `voz` es el canal público (WhatsApp y telefonía). core le habla para dos
 * cosas: avisarle al paramédico cuando el hospital responde, y pedirle que
 * llame cuando un traslado se demora.
 *
 * Sin `VOZ_BASE_URL` configurada, todo esto se salta en silencio. Es un modo
 * de operación válido: el demo por consola y Telegram no lo necesita.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Un aviso no puede colgar el handshake: si voz no responde, seguimos. */
const TIMEOUT_MS = 8_000;

@Injectable()
export class VozClient {
  private readonly log = new Logger(VozClient.name);

  constructor(private readonly config: ConfigService) {}

  configurado(): boolean {
    return Boolean(this.baseUrl());
  }

  /**
   * Avisa por WhatsApp. Nunca lanza: un fallo del canal no puede tumbar el
   * handshake, que es el núcleo del producto.
   */
  async notificar(
    telefono: string,
    texto: string,
    ubicacion?: { lat: number; lng: number; nombre: string; direccion?: string },
  ): Promise<boolean> {
    return this.enviar('/notificar', { telefono, texto, ubicacion });
  }

  /** Pide una llamada de seguimiento. Nunca lanza. */
  async llamarSeguimiento(telefono: string, motivo: string): Promise<boolean> {
    return this.enviar('/seguimiento', { telefono, motivo });
  }

  private async enviar(ruta: string, cuerpo: unknown): Promise<boolean> {
    const base = this.baseUrl();
    if (!base) return false;

    const secreto = this.config.get<string>('VOZ_SECRETO');
    try {
      const res = await fetch(`${base}${ruta}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secreto ? { 'X-Secreto': secreto } : {}),
        },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        this.log.warn(`voz ${ruta} devolvió ${res.status}`);
        return false;
      }
      return true;
    } catch (e) {
      this.log.warn(`voz ${ruta} inalcanzable: ${String(e)}`);
      return false;
    }
  }

  private baseUrl(): string | undefined {
    const url = this.config.get<string>('VOZ_BASE_URL')?.trim();
    return url ? url.replace(/\/+$/, '') : undefined;
  }
}
