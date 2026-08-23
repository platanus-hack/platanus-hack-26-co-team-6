/**
 * ⭐ EL ÚNICO PUNTO DE ESCRITURA DE EVENTOS — tarea 3.1.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  POR QUE UNA SOLA PUERTA
 * ═══════════════════════════════════════════════════════════════════
 *  La tentación es dejar que cada servicio inserte directo en la tabla. **No.**
 *  Un solo punto de escritura es lo que permite:
 *
 *    · el test de cobertura de eventos (5.12): recorrer las transiciones y
 *      verificar que cada una registra — si una no lo hace, es un bug, no
 *      una omisión;
 *    · que dentro de un mes no haya eventos con formas distintas para lo
 *      mismo, que es como un registro de auditoría deja de servir;
 *    · un solo sitio donde arreglar la idempotencia, el actor y el orden.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  NUNCA TUMBA LA OPERACIÓN
 * ═══════════════════════════════════════════════════════════════════
 *  `registrar()` no lanza. Si la base está caída, se pierde el evento y se
 *  grita en el log — pero **el traslado sigue**. Un paciente no se queda sin
 *  hospital porque no se pudo escribir su línea de tiempo.
 *
 *  La excepción es `registrarEnTransaccion()`, que existe para cuando el
 *  evento y el cambio de estado tienen que ir juntos o no ir (paso 5 de la
 *  tarea). Hoy no hay transacción que compartir porque el estado vive en
 *  memoria; cuando 1.2 la traiga, esa es la firma que hay que usar y este
 *  comentario se borra.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ALMACEN_EVENTOS, type AlmacenEventos } from './almacen-eventos';
import type { EntradaEvento, EventoCaso } from './tipos';

@Injectable()
export class RegistroService {
  private readonly log = new Logger(RegistroService.name);

  constructor(
    @Inject(ALMACEN_EVENTOS) private readonly almacen: AlmacenEventos,
  ) {}

  /**
   * Registra un evento. **No lanza nunca**: devuelve `null` si no pudo.
   *
   * Quien llama no tiene que envolver en try/catch ni decidir qué hacer si
   * falla — si tuviera que hacerlo, la mitad de las llamadas lo olvidarían y
   * la otra mitad tumbaría la operación por un fallo de auditoría.
   */
  async registrar(entrada: EntradaEvento): Promise<EventoCaso | null> {
    try {
      const evento = await this.almacen.agregar(entrada);
      this.log.log(
        `${evento.tipo} · caso ${evento.casoId}` +
          (evento.codigoSede ? ` · sede ${evento.codigoSede}` : '') +
          (evento.actorId ? ` · actor ${evento.actorId}` : ''),
      );
      return evento;
    } catch (e) {
      // Se grita, porque un evento perdido es un hueco en el acta y alguien
      // tiene que verlo — pero no se propaga.
      this.log.error(
        `NO se registró ${entrada.tipo} del caso ${entrada.casoId}: ${String(
          (e as Error).message,
        )}`,
      );
      return null;
    }
  }

  /**
   * Corrige un evento anterior.
   *
   * No edita nada: escribe uno nuevo apuntando al viejo. Los dos se leen
   * juntos, y esa lectura es la que sirve en una auditoría — *"a las 22:14 se
   * registró llegada a puerta; a las 22:19 el mismo actor la corrigió a
   * 22:11"*. Un `UPDATE` habría borrado el error, que es justo lo que hay que
   * poder ver.
   */
  corregir(
    idOriginal: number,
    entrada: EntradaEvento,
  ): Promise<EventoCaso | null> {
    return this.registrar({ ...entrada, corrigeA: idOriginal });
  }

  /** La línea de tiempo del caso, en orden. La consume `GET /casos/:id/eventos`. */
  async deCaso(casoId: string): Promise<EventoCaso[]> {
    try {
      return await this.almacen.deCaso(casoId);
    } catch (e) {
      this.log.error(
        `no se pudo leer la linea de tiempo del caso ${casoId}: ${String(
          (e as Error).message,
        )}`,
      );
      return [];
    }
  }
}
