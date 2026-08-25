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
import {
  codigoDesdeEtiqueta,
  etiquetaDeMotivo,
  motivoPorCodigo,
  MOTIVO_POR_DEFECTO,
} from '../catalogo/motivos-rechazo';
import { AlmacenService } from '../almacen/almacen.service';
import { RegistroService } from '../eventos/registro.service';
import { SedesService } from '../sedes/sedes.service';
import { CongestionService } from '../scoring/congestion.service';
import { RoutingService } from '../routing/routing.service';
import { VozClient } from '../voz/voz.client';

@Injectable()
export class HandshakeService {
  private readonly log = new Logger(HandshakeService.name);

  constructor(
    private readonly almacen: AlmacenService,
    private readonly sedes: SedesService,
    private readonly congestion: CongestionService,
    private readonly routing: RoutingService,
    private readonly registro: RegistroService,
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
        codigo: 'PULSO_ILLEGAL_TRANSITION',
      };
    }

    // ⭐ GUARD DE ACEPTACION UNICA — tarea 0.1.
    //
    // Hasta aqui solo se habia mirado el estado de ESTE handshake. Eso deja
    // fuera la pregunta que importa: **¿ya acepto otra sede este caso?**
    //
    // Lo que tapaba el hueco era que el fan-out es secuencial. El dia que
    // alguien active fan-out paralelo —que es la optimizacion obvia— dos
    // hospitales preparan cama para el mismo paciente. El guard ya existia,
    // estaba bien hecho y no lo llamaba nadie.
    //
    // El requestKey lleva handshake + decision para que el DOBLE TOQUE siga
    // siendo idempotente: la segunda vez devuelve el mismo resultado guardado
    // en vez de pelear con la reserva que ella misma hizo.
    if (cuerpo.decision === 'aceptado') {
      const reserva = await this.routing.aceptarDestino(
        h.casoId,
        h.sedeCodigo,
        `${h.id}:${cuerpo.decision}`,
        `${h.casoId}:${h.sedeCodigo}:${cuerpo.decision}`,
      );

      if (!reserva.accepted) {
        const codigo = reserva.error?.error.code ?? 'PULSO_INTERNAL';
        this.log.warn(
          `aceptacion rechazada por el guard: ${h.sedeCodigo} sobre caso ` +
            `${h.casoId} — ${codigo}`,
        );
        // El handshake NO se toca: sigue 'enviado' y vencera solo. Lo que
        // cambia es que quien pregunto se entera de que el caso ya es de
        // otra sede, y `codigo` se lo dice sin obligarle a adivinar mirando
        // un estado que no cambio.
        return {
          handshake: h,
          congestionActualizada: await this.congestionDe(h.sedeCodigo),
          aplicada: false,
          codigo,
        };
      }
    }

    const ahora = new Date();
    const enviado = new Date(h.enviadoEn);

    const { motivoCodigo, motivoRechazo } = this.resolverMotivo(cuerpo);

    const actualizado: Handshake = {
      ...h,
      estado: cuerpo.decision,
      motivoRechazo,
      motivoCodigo,
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

    // ⭐ La respuesta del hospital, que es el dato que se auto-etiqueta.
    //
    // El motivo va por CODIGO (tarea 0.6): agrupado dentro de tres meses
    // sigue significando lo mismo aunque alguien reescriba la etiqueta.
    await this.registro.registrar({
      casoId: h.casoId,
      tipo: cuerpo.decision,
      // Quien decide es el humano de la sede, entrado por el enlace del
      // handshake: hasta 1.3 no hay más identidad que la propia sede.
      actor: { id: `sede:${h.sedeCodigo}`, nombre: null, tipo: 'humano' },
      codigoSede: h.sedeCodigo,
      claveIdempotencia: `${h.id}:${cuerpo.decision}`,
      detalle: {
        handshakeId: h.id,
        latenciaS: actualizado.latenciaS,
        canal: h.canal,
        ...(cuerpo.decision === 'rechazado'
          ? { motivoCodigo: actualizado.motivoCodigo }
          : {}),
      },
    });

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

  /**
   * Motivo de rechazo → codigo del catalogo + etiqueta — tarea 0.6.
   *
   * Lo que se GUARDA y se reporta es el codigo; la etiqueta viaja congelada
   * al momento del rechazo para que la consola y el historial sigan pintando
   * lo mismo que ya pintaban.
   *
   * Tres caminos, en este orden:
   *   1. `motivoCodigo` del catalogo  → camino nuevo, el unico que agrega bien
   *   2. `motivo` de texto que cruza  → cliente viejo o webhook: se recupera
   *   3. texto que no cruza           → se conserva el texto y el codigo queda
   *                                     nulo. **No se inventa un codigo**: un
   *                                     codigo falso ensucia el dataset mas
   *                                     que un hueco declarado.
   *
   * Un `motivoCodigo` desconocido (cliente adelantado a un deploy viejo de
   * core) tampoco revienta: se guarda tal cual y `etiquetaDeMotivo` devuelve
   * el propio codigo.
   */
  private resolverMotivo(cuerpo: RespondRequest): {
    motivoCodigo: string | null;
    motivoRechazo: string | null;
  } {
    if (cuerpo.decision !== 'rechazado')
      return { motivoCodigo: null, motivoRechazo: null };

    if (cuerpo.motivoCodigo) {
      if (!motivoPorCodigo(cuerpo.motivoCodigo))
        this.log.warn(
          `motivoCodigo desconocido '${cuerpo.motivoCodigo}': se guarda igual, ` +
            'revisa el catalogo de motivos_rechazo',
        );
      return {
        motivoCodigo: cuerpo.motivoCodigo,
        motivoRechazo: cuerpo.motivo ?? etiquetaDeMotivo(cuerpo.motivoCodigo),
      };
    }

    const recuperado = codigoDesdeEtiqueta(cuerpo.motivo);
    if (recuperado)
      return { motivoCodigo: recuperado, motivoRechazo: cuerpo.motivo ?? null };

    return cuerpo.motivo
      ? { motivoCodigo: null, motivoRechazo: cuerpo.motivo }
      : {
          motivoCodigo: MOTIVO_POR_DEFECTO,
          motivoRechazo: etiquetaDeMotivo(MOTIVO_POR_DEFECTO),
        };
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
