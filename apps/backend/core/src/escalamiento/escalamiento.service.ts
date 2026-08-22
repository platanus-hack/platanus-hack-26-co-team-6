/**
 * Escalamiento al CRUE.
 *
 * ── QUÉ PROBLEMA RESUELVE ─────────────────────────────────────────
 * Hasta ahora, cuando el match no devolvía ninguna sede elegible, /campo
 * pintaba una lista vacía y ahí terminaba el sistema. El paramédico quedaba
 * mirando una pantalla en blanco con un paciente en la camilla — que es
 * exactamente el "paseo de la muerte" que PULSO dice eliminar, reproducido en
 * una interfaz nueva.
 *
 * Este módulo hace que el sistema NOMBRE ese momento: lo registra, dice por
 * qué pasó, deja constancia de a qué sedes ya se les preguntó, y lo pone en
 * la consola del regulador. El caso deja de resolverse solo, pero no deja de
 * resolverse.
 *
 * ── LO QUE NO HACE ────────────────────────────────────────────────
 * No notifica al CRUE por ningún canal. El tablero de /crue hace polling de
 * GET /estado cada 2s y ahí aparece. Si algún día hace falta un timbre, el
 * lugar es CanalesService, no aquí.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AtenderEscalamientoRequest,
  AtenderEscalamientoResponse,
  Escalamiento,
  EscalarRequest,
  EscalarResponse,
} from '../contracts/types';
import { AlmacenService } from '../almacen/almacen.service';

@Injectable()
export class EscalamientoService {
  private readonly log = new Logger(EscalamientoService.name);

  constructor(private readonly almacen: AlmacenService) {}

  escalar(cuerpo: EscalarRequest): EscalarResponse {
    const caso = this.almacen.obtenerCaso(cuerpo.casoId);
    if (!caso) throw new NotFoundException('Caso no encontrado');

    // Idempotente por caso. /campo puede llamar a esto desde dos caminos
    // distintos (ranking vacío y candidatos agotados) y en el segundo hay
    // polling de por medio: sin esta guarda, un caso difícil aparecería tres
    // veces en el tablero del CRUE y el regulador no sabría cuál atender.
    const abierto = this.almacen.escalamientoAbiertoDe(cuerpo.casoId);
    if (abierto) return { escalamiento: abierto };

    // A quién ya se le preguntó. Es lo primero que el regulador necesita
    // saber: sin esto su primera llamada sería a la sede que acaba de decir
    // que no.
    const sedesIntentadas = [
      ...new Set(
        this.almacen
          .listarHandshakes(cuerpo.casoId)
          .filter((h) => h.estado === 'rechazado' || h.estado === 'timeout')
          .map((h) => h.sedeCodigo),
      ),
    ];

    const escalamiento: Escalamiento = {
      id: randomUUID(),
      casoId: cuerpo.casoId,
      motivo: cuerpo.motivo,
      sedesIntentadas,
      detalle: cuerpo.detalle ?? null,
      creadoEn: new Date().toISOString(),
      atendidoEn: null,
      atendidoPor: null,
    };

    this.almacen.guardarEscalamiento(escalamiento);

    // Nivel error a propósito: en la operación real esto es un incidente, no
    // una nota de color. Si los logs se llenan de esto, el problema no son
    // los logs.
    this.log.error(
      `escalamiento ${escalamiento.id} · caso ${cuerpo.casoId} · ` +
        `${cuerpo.motivo} · ${sedesIntentadas.length} sedes agotadas`,
    );

    return { escalamiento };
  }

  atender(
    cuerpo: AtenderEscalamientoRequest,
  ): AtenderEscalamientoResponse {
    const e = this.almacen.obtenerEscalamiento(cuerpo.escalamientoId);
    if (!e) throw new NotFoundException('Escalamiento no encontrado');

    // Ya lo tomó alguien: no se re-sella. Que dos reguladores lo abran a la
    // vez es normal; que el segundo borre el nombre del primero, no.
    if (e.atendidoEn) return { escalamiento: e };

    const atendido: Escalamiento = {
      ...e,
      atendidoEn: new Date().toISOString(),
      atendidoPor: cuerpo.atendidoPor ?? 'CRUE',
    };
    this.almacen.guardarEscalamiento(atendido);

    this.log.log(`escalamiento ${e.id} atendido por ${atendido.atendidoPor}`);

    return { escalamiento: atendido };
  }
}
