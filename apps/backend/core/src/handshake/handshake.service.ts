/**
 * Lógica del handshake.
 *
 * Dos clientes la llaman: la consola web /hospital (vía HandshakeController) y
 * el webhook de Telegram (vía TelegramController). Por eso vive en un servicio
 * y no dentro de un controlador.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  Handshake,
  RespondRequest,
  RespondResponse,
} from '../contracts/types';
import { AlmacenService } from '../almacen/almacen.service';
import { SedesService } from '../sedes/sedes.service';
import { CongestionService } from '../scoring/congestion.service';

@Injectable()
export class HandshakeService {
  private readonly log = new Logger(HandshakeService.name);

  constructor(
    private readonly almacen: AlmacenService,
    private readonly sedes: SedesService,
    private readonly congestion: CongestionService,
  ) {}

  /**
   * ⭐ EL NÚCLEO DEL PRODUCTO.
   *
   * El jefe de urgencias aprieta un botón que de todas formas iba a apretar
   * (hoy lo dice por teléfono y se pierde en el aire). Esa respuesta:
   *   1. desbloquea al paramédico
   *   2. actualiza el posterior Beta-Bernoulli de P(aceptación) de la sede
   *   3. empuja el índice de congestión de la sede
   *
   * Nadie reportó nada. La red aprendió sola.
   *
   * Lanza NotFoundException si el handshake no existe — Nest la traduce a 404.
   */
  async procesarRespuesta(cuerpo: RespondRequest): Promise<RespondResponse> {
    const h = this.almacen.obtenerHandshake(cuerpo.handshakeId);
    if (!h) throw new NotFoundException('Handshake no encontrado');

    // Idempotencia: sin esto, un doble toque en el celular duplica la señal y
    // ensucia el modelo. En un demo en vivo esto pasa siempre.
    if (h.estado !== 'enviado') {
      return {
        handshake: h,
        congestionActualizada: await this.congestionDe(h.sedeCodigo),
      };
    }

    const ahora = new Date();
    const enviado = new Date(h.enviadoEn);

    const actualizado: Handshake = {
      ...h,
      estado: cuerpo.decision,
      motivoRechazo:
        cuerpo.decision === 'rechazado' ? (cuerpo.motivo ?? 'Saturación') : null,
      respondidoEn: ahora.toISOString(),
      latenciaS: Math.round((ahora.getTime() - enviado.getTime()) / 1000),
    };
    this.almacen.guardarHandshake(actualizado);

    // ⭐ El dato se etiqueta solo.
    this.almacen.registrarRespuesta(h.sedeCodigo, cuerpo.decision);

    const congestionActualizada = await this.congestionDe(h.sedeCodigo);

    this.log.log(
      `${h.sedeCodigo} → ${cuerpo.decision} en ${actualizado.latenciaS}s ` +
        `· congestión ahora ${(congestionActualizada * 100).toFixed(0)}%`,
    );

    return { handshake: actualizado, congestionActualizada };
  }

  private async congestionDe(sedeCodigo: string): Promise<number> {
    const sede = await this.sedes.porCodigo(sedeCodigo);
    return sede ? this.congestion.indice(sede) : 0;
  }
}
