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
import { VozClient } from '../voz/voz.client';

@Injectable()
export class HandshakeService {
  private readonly log = new Logger(HandshakeService.name);

  constructor(
    private readonly almacen: AlmacenService,
    private readonly sedes: SedesService,
    private readonly congestion: CongestionService,
    private readonly voz: VozClient,
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

    // Dos casos distintos que se manejan igual, y por eso comparten rama:
    //
    //  DOBLE TOQUE (ya aceptado/rechazado). Sin esto la señal se duplica y
    //  ensucia el modelo. En un demo en vivo esto pasa siempre.
    //
    //  RESPUESTA TARDÍA (ya en timeout). El paramédico probablemente ya siguió
    //  con el siguiente candidato, así que revivir esta solicitud podría dejar
    //  a dos hospitales esperando al mismo paciente. La respuesta se descarta
    //  y `aplicada: false` obliga a quien llama a decirlo en voz alta.
    if (h.estado !== 'enviado') {
      this.log.warn(
        `respuesta ignorada sobre handshake ${h.id}: ya estaba en '${h.estado}'`,
      );
      return {
        handshake: h,
        congestionActualizada: await this.congestionDe(h.sedeCodigo),
        aplicada: false,
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
    this.almacen.registrarRespuesta(
      h.sedeCodigo,
      cuerpo.decision,
      actualizado.latenciaS,
    );

    const congestionActualizada = await this.congestionDe(h.sedeCodigo);

    // ⭐ CIERRA EL BUCLE. Sin esto, el jefe de urgencias acepta y el
    // paramédico nunca se entera: la confirmación se queda en el servidor.
    // Es el momento 1:50 del guion, el del cronómetro.
    await this.avisarAlParamedico(actualizado);

    this.log.log(
      `${h.sedeCodigo} → ${cuerpo.decision} en ${actualizado.latenciaS}s ` +
        `· congestión ahora ${(congestionActualizada * 100).toFixed(0)}%`,
    );

    return { handshake: actualizado, congestionActualizada, aplicada: true };
  }

  /** Nunca lanza: un fallo del canal no puede tumbar el handshake. */
  private async avisarAlParamedico(h: Handshake): Promise<void> {
    const caso = this.almacen.obtenerCaso(h.casoId);
    const telefono = caso?.telefonoReporta;
    if (!telefono || !this.voz.configurado()) return;

    const sede = await this.sedes.porCodigo(h.sedeCodigo);
    const nombre = sede?.nombre ?? 'la sede';

    if (h.estado === 'aceptado') {
      await this.voz.notificar(
        telefono,
        `✅ ${nombre} aceptó el traslado. Van para allá.`,
        sede
          ? {
              lat: sede.coord.lat,
              lng: sede.coord.lng,
              nombre: sede.nombre,
              direccion: sede.direccion ?? '',
            }
          : undefined,
      );
      return;
    }

    const motivo = h.motivoRechazo ? ` (${h.motivoRechazo})` : '';
    await this.voz.notificar(
      telefono,
      `⚠️ ${nombre} no puede recibir${motivo}. Buscando otra sede.`,
    );
  }

  private async congestionDe(sedeCodigo: string): Promise<number> {
    const sede = await this.sedes.porCodigo(sedeCodigo);
    return sede ? this.congestion.indice(sede) : 0;
  }
}
