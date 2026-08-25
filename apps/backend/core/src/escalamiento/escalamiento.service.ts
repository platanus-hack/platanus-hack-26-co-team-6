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

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AtenderEscalamientoRequest,
  AtenderEscalamientoResponse,
  Escalamiento,
  EscalarRequest,
  EscalarResponse,
  Handshake,
} from '../contracts/types';
import { AlmacenService } from '../almacen/almacen.service';
import { DispatchService } from '../dispatch/dispatch.service';
import {
  motivoDeNegacion,
  tieneAlgunRol,
  type ActorSolicitante,
} from '../eventos/actor.service';
import type { EventoCaso } from '../eventos/evento.tipos';
import { RegistroService } from '../eventos/registro.service';

/** Lo que el regulador manda al forzar un destino (tarea 3.11). */
export interface OverrideRequest {
  casoId: string;
  sedeCodigo: string;
  /** Obligatoria y no vacía. La valida el SERVIDOR, no solo la pantalla. */
  justificacion: string;
  /**
   * El nombre que el regulador declara en la barra de /crue.
   *
   * Se guarda marcado como DECLARADO: no está verificado por nadie, la sesión
   * sigue siendo una contraseña de turno. Cuando la tarea 1.3 traiga actores
   * reales, este campo sobra y `actor.id` lo dice todo.
   */
  firmaDeclarada?: string;
  /** El `motivoDescarte` que la sede tenía, si el override saltó una regla dura. */
  saltaRegla?: string | null;
  /** Radio de búsqueda con el que apareció esa sede, si se amplió el perímetro. */
  radioKm?: number | null;
  /** Un doble toque no despacha dos ambulancias. */
  claveIdempotencia?: string;
}

export interface OverrideResponse {
  evento: EventoCaso;
  handshake: Handshake | null;
  /** true si esta llamada era un reintento y no volvió a despachar. */
  repetido: boolean;
}

/** Solo el regulador. La potestad de forzar un destino es suya (Res. 1220/2010). */
const ROLES_OVERRIDE = ['regulador_crue'] as const;

/** Un motivo de dos palabras no es un motivo. Tampoco lo es una novela. */
const JUSTIFICACION_MIN = 10;
const JUSTIFICACION_MAX = 2000;

@Injectable()
export class EscalamientoService {
  private readonly log = new Logger(EscalamientoService.name);

  constructor(
    private readonly almacen: AlmacenService,
    private readonly despacho: DispatchService,
    private readonly registro: RegistroService,
  ) {}

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

    // `void` y no `await`: `escalar()` es sincrono y lo llaman el controlador
    // y el vigilante. Volverlo async por el registro obligaria a cambiar los
    // dos llamadores para ganar nada; el `catch` de abajo recoge el fallo
    // para que no quede un rechazo suelto.
    void this.registro
      .registrar({
        casoId: cuerpo.casoId,
        tipo: 'escalado',
        actor: { id: 'sys:escalamiento', nombre: null, tipo: 'sistema' },
        // Idempotente por caso: escalar dos veces devuelve el mismo
        // escalamiento (arriba) y ahora tampoco escribe dos eventos.
        claveIdempotencia: escalamiento.id,
        detalle: {
          escalamientoId: escalamiento.id,
          motivo: cuerpo.motivo,
          sedesIntentadas: sedesIntentadas.length,
        },
      })
      .catch((e) => this.log.error(`no se registró 'escalado': ${String(e)}`));

    return { escalamiento };
  }

  atender(cuerpo: AtenderEscalamientoRequest): AtenderEscalamientoResponse {
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

  /**
   * El override del CRUE — tarea 3.11.
   *
   * ── LAS CUATRO COSAS QUE HACE, EN ESTE ORDEN Y POR ESTE MOTIVO ──
   *
   * 1. **Comprueba el rol.** Forzar un destino es la potestad del regulador,
   *    no de cualquiera que tenga la contraseña del turno. Se verifica en el
   *    servidor: la pantalla puede esconder el botón, pero eso no es una
   *    autorización.
   * 2. **Exige la justificación.** No vacía, mínimo una frase. "PULSO
   *    propone, el humano decide" solo es cierto si la decisión humana queda
   *    escrita; sin motivo, el override es indistinguible de un clic.
   * 3. **Despacha.** Y lo hace llamando a `DispatchService` DIRECTAMENTE, sin
   *    pasar por el guard de evidencia de `RoutingService.dispatch()`. Es
   *    deliberado y es el corazón del asunto: un override es, por
   *    definición, un despacho que el motor no eligió. Exigirle la evidencia
   *    del motor sería prohibir el override. Su evidencia es la
   *    justificación del humano, y por eso el paso 2 no es opcional.
   * 4. **Escribe el `evento_caso`.** Después del despacho: lo que se registra
   *    es un override EJECUTADO, no una intención. Si el despacho falla no
   *    hay nada que auditar todavía, y la regla append-only prohíbe volver
   *    atrás a tachar lo que se escribió de más.
   */
  async override(
    cuerpo: OverrideRequest,
    actor: ActorSolicitante,
  ): Promise<OverrideResponse> {
    if (!tieneAlgunRol(actor, ROLES_OVERRIDE)) {
      throw new ForbiddenException(motivoDeNegacion(actor, ROLES_OVERRIDE));
    }

    const justificacion = (cuerpo.justificacion ?? '').trim();
    if (justificacion.length < JUSTIFICACION_MIN) {
      throw new BadRequestException(
        'La justificación es obligatoria y tiene que decir algo: al menos ' +
          `${JUSTIFICACION_MIN} caracteres. Es lo que un auditor va a leer ` +
          'dentro de seis meses para entender por qué se saltó el ranking.',
      );
    }
    if (justificacion.length > JUSTIFICACION_MAX) {
      throw new BadRequestException(
        `La justificación no puede pasar de ${JUSTIFICACION_MAX} caracteres.`,
      );
    }

    const caso = this.almacen.obtenerCaso(cuerpo.casoId);
    if (!caso) throw new NotFoundException('Caso no encontrado');

    // Idempotencia ANTES de despachar. Un reintento del navegador (o un dedo
    // nervioso en la doble confirmación) no puede mandar dos ambulancias al
    // mismo paciente: es el bug más caro del sistema.
    if (cuerpo.claveIdempotencia) {
      const previos = await this.registro.listar(cuerpo.casoId);
      const yaEsta = previos.find(
        (e) =>
          e.tipo === 'override_crue' &&
          e.claveIdempotencia === cuerpo.claveIdempotencia,
      );
      if (yaEsta) return { evento: yaEsta, handshake: null, repetido: true };
    }

    const { handshake } = await this.despacho.despachar({
      casoId: cuerpo.casoId,
      sedeCodigo: cuerpo.sedeCodigo,
      canal: 'consola',
    });

    const evento = await this.registro.registrar({
      casoId: cuerpo.casoId,
      tipo: 'override_crue',
      actor: { id: actor.id, nombre: actor.nombre, tipo: actor.tipo },
      organizacionId: actor.organizacionId,
      codigoSede: cuerpo.sedeCodigo,
      movilId: caso.unidad?.id ?? null,
      claveIdempotencia: cuerpo.claveIdempotencia,
      detalle: {
        justificacion,
        handshakeId: handshake.id,
        // Si el override pasa por encima de un filtro duro, eso NO se
        // esconde: es lo primero que un auditor quiere ver.
        saltaReglaDura: cuerpo.saltaRegla ?? null,
        // Con qué perímetro apareció esa sede. Explica por qué el ranking
        // original no la traía.
        radioKmBusqueda: cuerpo.radioKm ?? null,
        // El nombre que el humano tecleó. Declarado, no verificado — hasta 1.3
        // la sesión es una contraseña de turno y esto hay que decirlo.
        firmaDeclarada: cuerpo.firmaDeclarada?.trim() || null,
        firmaVerificada: false,
        // Bajo qué potestad se actúa. La spec pide `base_legal` en todo
        // evento que mueva datos clínicos; el override además la necesita
        // para no leerse como un capricho.
        baseLegal: 'Res. 1220/2010 — regulación del CRUE',
      },
    });

    this.log.warn(
      `override_crue · caso ${cuerpo.casoId} → sede ${cuerpo.sedeCodigo} · ` +
        `actor ${actor.id}${cuerpo.saltaRegla ? ' · SALTÓ REGLA DURA' : ''}`,
    );

    return { evento, handshake, repetido: false };
  }
}
