/**
 * Dónde viven los eventos — tarea 3.1.
 *
 * Dos implementaciones detrás de una interfaz, con la misma elección que
 * `PersistenceModule`: si hay `PULSO_ROUTING_DATABASE_URL`, Postgres; si no,
 * memoria **y se dice en el log**. La regla del repo es degradar y decirlo.
 *
 * ⚠️ En memoria, `evento_caso` se pierde al reiniciar igual que
 *    `AlmacenService`. Para el demo alcanza; para el reporte del paramédico
 *    (3.10) y la retención (5.8) no, y por eso 1.2 sigue siendo urgente.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { EntradaEvento, EventoCaso, TipoEvento } from './tipos';

export const ALMACEN_EVENTOS = Symbol('ALMACEN_EVENTOS');

export interface AlmacenEventos {
  /**
   * Agrega el evento y lo devuelve. Si la clave de idempotencia ya existía
   * para ese `(casoId, tipo)`, devuelve **el que ya estaba** sin insertar.
   */
  agregar(entrada: EntradaEvento): Promise<EventoCaso>;
  deCaso(casoId: string): Promise<EventoCaso[]>;
}

@Injectable()
export class EventosMemoria implements AlmacenEventos {
  private readonly eventos: EventoCaso[] = [];
  private secuencia = 0;

  agregar(entrada: EntradaEvento): Promise<EventoCaso> {
    if (entrada.claveIdempotencia) {
      const previo = this.eventos.find(
        (e) =>
          e.casoId === entrada.casoId &&
          e.tipo === entrada.tipo &&
          e.detalle.__clave === entrada.claveIdempotencia,
      );
      if (previo) return Promise.resolve(clonar(previo));
    }

    this.secuencia += 1;
    const evento: EventoCaso = {
      id: this.secuencia,
      casoId: entrada.casoId,
      tipo: entrada.tipo,
      actorId: entrada.actorId ?? null,
      movilId: entrada.movilId ?? null,
      codigoSede: entrada.codigoSede ?? null,
      detalle: {
        ...(entrada.detalle ?? {}),
        // La clave viaja dentro del detalle solo en memoria; en Postgres es
        // una columna con índice único, que es donde de verdad protege.
        ...(entrada.claveIdempotencia
          ? { __clave: entrada.claveIdempotencia }
          : {}),
      },
      ocurridoEn: new Date().toISOString(),
      corrigeA: entrada.corrigeA ?? null,
    };

    this.eventos.push(evento);
    return Promise.resolve(clonar(evento));
  }

  deCaso(casoId: string): Promise<EventoCaso[]> {
    return Promise.resolve(
      this.eventos.filter((e) => e.casoId === casoId).map(clonar),
    );
  }
}

interface FilaEvento {
  id: string;
  caso_id: string;
  tipo: TipoEvento;
  actor_id: string | null;
  movil_id: string | null;
  codigo_sede: string | null;
  detalle: Record<string, unknown>;
  ocurrido_en: Date;
  corrige_a: string | null;
}

export class EventosPostgres implements AlmacenEventos {
  constructor(private readonly pool: Pool) {}

  /**
   * El candado es el índice único parcial `(caso_id, tipo, clave_idempotencia)`.
   * `on conflict do nothing` + un `select` de rescate: quien pierde la carrera
   * lee la fila del que la ganó, en vez de reventar o duplicar.
   */
  async agregar(entrada: EntradaEvento): Promise<EventoCaso> {
    const insertado = await this.pool.query<FilaEvento>(
      `insert into evento_caso
         (caso_id, tipo, actor_id, movil_id, codigo_sede, detalle, clave_idempotencia, corrige_a)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       on conflict do nothing
       returning *`,
      [
        entrada.casoId,
        entrada.tipo,
        entrada.actorId ?? null,
        entrada.movilId ?? null,
        entrada.codigoSede ?? null,
        JSON.stringify(entrada.detalle ?? {}),
        entrada.claveIdempotencia ?? null,
        entrada.corrigeA ?? null,
      ],
    );

    if (insertado.rowCount) return desdeFila(insertado.rows[0]);

    const previo = await this.pool.query<FilaEvento>(
      `select * from evento_caso
       where caso_id = $1 and tipo = $2 and clave_idempotencia = $3`,
      [entrada.casoId, entrada.tipo, entrada.claveIdempotencia],
    );
    if (previo.rowCount) return desdeFila(previo.rows[0]);

    // Ni insertó ni encuentra el previo: el conflicto no fue por la clave de
    // idempotencia. Se levanta en vez de devolver algo inventado.
    throw new Error(
      `no se pudo registrar el evento ${entrada.tipo} del caso ${entrada.casoId}`,
    );
  }

  async deCaso(casoId: string): Promise<EventoCaso[]> {
    const filas = await this.pool.query<FilaEvento>(
      'select * from evento_caso where caso_id = $1 order by ocurrido_en, id',
      [casoId],
    );
    return filas.rows.map(desdeFila);
  }
}

export const proveedorEventos = {
  provide: ALMACEN_EVENTOS,
  inject: [ConfigService, EventosMemoria],
  useFactory: (
    config: ConfigService,
    memoria: EventosMemoria,
  ): AlmacenEventos => {
    const log = new Logger('AlmacenEventos');
    const url = config.get<string>('PULSO_ROUTING_DATABASE_URL');

    if (config.get<string>('ROUTING_STORE') === 'memory' || !url) {
      log.warn(
        'evento_caso en memoria: la linea de tiempo se pierde al reiniciar. ' +
          'Pon PULSO_ROUTING_DATABASE_URL para persistirla.',
      );
      return memoria;
    }
    return new EventosPostgres(new Pool({ connectionString: url, max: 4 }));
  },
};

const clonar = (e: EventoCaso): EventoCaso => ({
  ...e,
  detalle: { ...e.detalle },
});

function desdeFila(fila: FilaEvento): EventoCaso {
  return {
    // `bigint` llega como string desde pg: convertirlo aquí y no en cada
    // llamador es lo que evita comparar `1` con `'1'` dentro de seis meses.
    id: Number(fila.id),
    casoId: fila.caso_id,
    tipo: fila.tipo,
    actorId: fila.actor_id,
    movilId: fila.movil_id,
    codigoSede: fila.codigo_sede,
    detalle: fila.detalle ?? {},
    ocurridoEn: fila.ocurrido_en.toISOString(),
    corrigeA: fila.corrige_a === null ? null : Number(fila.corrige_a),
  };
}
