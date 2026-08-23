/**
 * Arma el borrador de RDA de un caso con lo que el sistema sabe HOY.
 *
 * Todo lo que decide la forma del documento vive en `constructor-rda.ts`, que
 * es puro y testeable sin Nest. Este servicio solo hace lo que el constructor
 * no puede: buscar el caso, averiguar qué sede aceptó, y traducir los
 * handshakes a eventos de traslado mientras la tabla `evento_caso` no exista.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Handshake, Sede } from '../contracts/types';
import { AlmacenService } from '../almacen/almacen.service';
import { SedesService } from '../sedes/sedes.service';
import type { BorradorRda, EventoTrasladoRda } from './borrador';
import { construirBundleRda } from './constructor-rda';

/**
 * El evento que anunciaría que hay borrador listo. Tipado aquí para que 5.1
 * tenga contra qué escribir. **Nadie lo publica todavía** — ver `anunciar()`.
 */
export interface EventoRdaDisponible {
  tipo: 'caso.rda_disponible';
  casoId: string;
  ocurridoEn: string;
  /** Nunca el Bundle entero: un evento no es un canal de datos clínicos. */
  estado: BorradorRda['estado'];
  huecosBloqueantes: number;
  cobertura: number;
}

@Injectable()
export class RdaService {
  private readonly log = new Logger(RdaService.name);

  constructor(
    private readonly almacen: AlmacenService,
    private readonly sedes: SedesService,
  ) {}

  /**
   * El borrador de un caso. Siempre en estado `pendiente`.
   *
   * No muta nada y no envía nada. Lo segundo es la funcionalidad, no una
   * limitación: **el borrador nunca se envía solo.**
   */
  async borrador(casoId: string): Promise<BorradorRda> {
    const caso = this.almacen.obtenerCaso(casoId);
    if (!caso) throw new NotFoundException('Caso no encontrado');

    const handshakes = this.almacen.listarHandshakes(casoId);
    const sede = await this.sedeQueAcepto(handshakes);

    // `caso` es un `Caso` y entra donde se pide `CasoPublico` porque el
    // segundo es el Omit del primero. El constructor NO puede leer
    // `textoCrudo` ni `origen`: no están en el tipo que declara.
    const borrador = construirBundleRda(
      caso,
      sede,
      eventosDesdeHandshakes(handshakes),
    );

    this.anunciar(borrador);
    return borrador;
  }

  /**
   * La sede que aceptó el traslado, o `null` si ninguna todavía.
   *
   * Solo cuenta `aceptado`. Una sede a la que se le preguntó y no contestó no
   * es la IPS que atendió, y ponerla como prestador del documento sería
   * atribuirle una atención que no prestó.
   */
  private async sedeQueAcepto(handshakes: Handshake[]): Promise<Sede | null> {
    const aceptado = handshakes.find((h) => h.estado === 'aceptado');
    if (!aceptado) return null;
    return (await this.sedes.porCodigo(aceptado.sedeCodigo)) ?? null;
  }

  /**
   * ── PUNTO DE EXTENSIÓN — tarea 5.1 (`webhook_outbox`, carril de Zaid) ──
   *
   * Aquí es donde el evento `caso.rda_disponible` entra al outbox. **El outbox
   * no existe todavía y este método NO lo construye**: arma el evento, lo deja
   * en el log y se acaba.
   *
   * Cuando 5.1 aterrice, el cuerpo de este método pasa a ser UNA escritura en
   * la tabla de outbox, dentro de la misma transacción que persista el
   * borrador — nunca un `fetch` desde aquí. Ese es el punto del patrón: si el
   * dato se guardó, el evento también, y el relay se encarga del resto.
   *
   * Lo que este método no va a hacer nunca es despachar el borrador. Un RDA
   * sin firma humana no sale de PULSO (regla 6 del repo, y punto 3 del §0 del
   * plan maestro sin verificar: no sabemos siquiera si un traslado
   * prehospitalario genera RDA propio).
   */
  private anunciar(borrador: BorradorRda): EventoRdaDisponible {
    const evento: EventoRdaDisponible = {
      tipo: 'caso.rda_disponible',
      casoId: borrador.casoId,
      ocurridoEn: borrador.generadoEn,
      estado: borrador.estado,
      huecosBloqueantes: borrador.huecos.filter(
        (h) => h.severidad === 'bloqueante',
      ).length,
      cobertura: borrador.cobertura.proporcion,
    };
    this.log.debug(
      `caso.rda_disponible ${evento.casoId} — sin outbox (tarea 5.1): el evento no sale de este proceso`,
    );
    return evento;
  }
}

/**
 * Handshakes → eventos de traslado.
 *
 * Puente declarado. La tarea 3.1 (`evento_caso` + `RegistroService`) aterrizó
 * en esta misma ola y es la fuente correcta; conectarla aquí es cambiar esta
 * función por una lectura del registro, y el constructor no se entera porque
 * `EventoTrasladoRda` ya tiene la forma de `EventoCaso`. Se deja el puente
 * para no acoplar dos carriles a mitad de ola.
 *
 * Mientras tanto, esto da el despacho y la aceptación; **no da la llegada a
 * puerta**, que es justo lo que cerraría el encuentro. Por eso el borrador
 * sale con el hueco `encuentro-sin-cierre` — y sale bien, porque es la verdad.
 */
export function eventosDesdeHandshakes(
  handshakes: Handshake[],
): EventoTrasladoRda[] {
  const eventos: EventoTrasladoRda[] = [];
  for (const h of handshakes) {
    eventos.push({
      tipo: 'despachado',
      ocurridoEn: h.enviadoEn,
      codigoSede: h.sedeCodigo,
    });
    if (h.estado === 'aceptado' && h.respondidoEn) {
      eventos.push({
        tipo: 'aceptado',
        ocurridoEn: h.respondidoEn,
        codigoSede: h.sedeCodigo,
      });
    }
  }
  return eventos.sort((a, b) => a.ocurridoEn.localeCompare(b.ocurridoEn));
}
