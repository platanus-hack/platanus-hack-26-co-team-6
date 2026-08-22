/**
 * El que vigila el reloj.
 *
 * ANTES DE ESTO NADIE MIRABA EL TIEMPO PASAR, y tres cosas dependían de eso:
 *   1. Un hospital que no contesta dejaba el caso colgado para siempre.
 *      El estado `timeout` existía en el tipo y nadie lo escribía nunca.
 *   2. Nadie notaba que un traslado se estaba demorando.
 *   3. La llamada de seguimiento tenía gatillo, pero nada lo apretaba.
 *
 * Un solo barrido periódico resuelve las tres.
 *
 * Corre en proceso, no como cron externo, a propósito: el estado vive en
 * memoria en `AlmacenService`, así que un worker aparte no vería nada.
 * Cuando el estado se mude a Supabase, esto puede salirse a un cron.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import type { Handshake } from '../contracts/types';
import { AlmacenService } from '../almacen/almacen.service';
import { SedesService } from '../sedes/sedes.service';
import { MatchService } from '../match/match.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { VozClient } from '../voz/voz.client';

/** Cada cuánto barre. Bajo: en un demo de 3 minutos, 30s es una eternidad. */
const CADA_MS = 5_000;

/**
 * Cuánto se le espera a un hospital antes de darlo por no-respuesta.
 * 60s es agresivo para la vida real y correcto para el escenario: el jurado
 * no aguanta más, y el punto es justamente que el sistema no se queda quieto.
 */
const ESPERA_HANDSHAKE_S = 60;

/**
 * Cuánto puede pasarse un traslado de su ETA antes de que llamemos.
 * 1.5x es holgado a propósito: un paramédico no necesita que lo llamen
 * porque el semáforo estuvo largo.
 */
const FACTOR_DEMORA = 1.5;

@Injectable()
export class VigilanteService {
  private readonly log = new Logger(VigilanteService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly almacen: AlmacenService,
    private readonly sedes: SedesService,
    private readonly match: MatchService,
    private readonly dispatch: DispatchService,
    private readonly voz: VozClient,
  ) {}

  @Interval(CADA_MS)
  async barrer(): Promise<void> {
    try {
      await this.vencerHandshakes();
      await this.detectarDemoras();
    } catch (e) {
      // Un barrido que lanza mata el intervalo en algunos runtimes. Nunca.
      this.log.error(`el barrido falló: ${String(e)}`);
    }
  }

  // ── 1. Handshakes sin respuesta ────────────────────────────────

  private async vencerHandshakes(): Promise<void> {
    const limite = this.esperaHandshakeS() * 1000;
    const ahora = Date.now();

    for (const h of this.almacen.handshakesPendientes()) {
      const edad = ahora - new Date(h.enviadoEn).getTime();
      if (edad < limite) continue;

      const vencido: Handshake = {
        ...h,
        estado: 'timeout',
        respondidoEn: new Date().toISOString(),
        latenciaS: Math.round(edad / 1000),
      };
      this.almacen.guardarHandshake(vencido);
      this.log.warn(
        `handshake ${h.id} venció tras ${vencido.latenciaS}s — ${h.sedeCodigo} no contestó`,
      );

      // Un timeout NO alimenta P(aceptación) como un rechazo: no sabemos si
      // habrían aceptado. Sí saca a la sede del ranking de ESTE caso, que es
      // lo que hace MatchService al filtrar por estado.
      await this.reRutear(vencido);
    }
  }

  /** Re-rutea al siguiente candidato. Es el "el sistema sigue solo". */
  private async reRutear(vencido: Handshake): Promise<void> {
    const caso = this.almacen.obtenerCaso(vencido.casoId);
    if (!caso) return;

    try {
      const { candidatos } = await this.match.rankear(caso, 3);
      const siguiente = candidatos.find((c) => c.rank >= 1);

      if (!siguiente) {
        this.log.error(`caso ${caso.id}: sin más candidatos tras el timeout`);
        await this.avisar(
          caso.telefonoReporta,
          '⚠️ No hubo respuesta y no quedan más sedes viables. Escala al CRUE por radio.',
        );
        return;
      }

      await this.avisar(
        caso.telefonoReporta,
        `⏱️ Sin respuesta. Reintentando con ${siguiente.sede.nombre}.`,
      );
      await this.dispatch.despachar({
        casoId: caso.id,
        sedeCodigo: siguiente.sede.codigo,
        canal: 'telegram',
      });
    } catch (e) {
      this.log.error(`no pude re-rutear el caso ${caso.id}: ${String(e)}`);
    }
  }

  // ── 2. Traslados que se demoran ────────────────────────────────

  private async detectarDemoras(): Promise<void> {
    const ahora = Date.now();

    for (const h of this.almacen.listarHandshakes()) {
      if (h.estado !== 'aceptado' || h.demoraAvisada) continue;
      // Sin línea base no hay demora que medir. Pasa cuando Mapbox no
      // respondió al despachar: se deja pasar en vez de inventar un umbral.
      if (!h.etaMinAlDespachar) continue;

      const aceptadoEn = new Date(h.respondidoEn ?? h.enviadoEn).getTime();
      const transcurridoMin = (ahora - aceptadoEn) / 60_000;
      if (transcurridoMin < h.etaMinAlDespachar * FACTOR_DEMORA) continue;

      // Se marca ANTES de llamar: si la llamada falla, no queremos que el
      // siguiente barrido la repita cada 5 segundos.
      this.almacen.guardarHandshake({ ...h, demoraAvisada: true });

      const caso = this.almacen.obtenerCaso(h.casoId);
      const sede = await this.sedes.porCodigo(h.sedeCodigo);
      this.log.warn(
        `traslado ${h.casoId} lleva ${Math.round(transcurridoMin)} min ` +
          `contra un ETA de ${h.etaMinAlDespachar} min`,
      );

      if (caso?.telefonoReporta && this.voz.configurado()) {
        await this.voz.llamarSeguimiento(
          caso.telefonoReporta,
          `El traslado a ${sede?.nombre ?? 'la sede'} lleva ` +
            `${Math.round(transcurridoMin)} minutos, contra un estimado de ` +
            `${h.etaMinAlDespachar}.`,
        );
      }
    }
  }

  // ── Utilidades ─────────────────────────────────────────────────

  private esperaHandshakeS(): number {
    const n = Number(this.config.get<string>('ESPERA_HANDSHAKE_S'));
    return Number.isFinite(n) && n > 0 ? n : ESPERA_HANDSHAKE_S;
  }

  private async avisar(telefono: string | null | undefined, texto: string) {
    if (telefono && this.voz.configurado()) {
      await this.voz.notificar(telefono, texto);
    }
  }
}
