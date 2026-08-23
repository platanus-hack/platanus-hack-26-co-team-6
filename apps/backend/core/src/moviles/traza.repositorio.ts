/**
 * La traza de posiciones: por dónde ha pasado cada móvil.
 *
 * ⚠️ ESTO NO EXISTÍA. La tabla `movil_posicion` está en la migración `0006`
 * con su índice espacial y su `precision_m`, y **nadie escribía en ella**:
 * `moviles.almacen.ts` guarda sólo la ÚLTIMA posición, en un `Map`. No había
 * forma de saber por dónde pasó una ambulancia ni cuándo se supo de ella por
 * última vez.
 *
 * Sin esto, el recorrido A→B→C→D del mapa no se puede dibujar: sólo se puede
 * pintar un punto que salta.
 *
 * ES TELEMETRÍA, NO AUDITORÍA. Un reporte cada 15 s por móvil son ~240 filas
 * por hora y por ambulancia. Por eso va a su propia tabla y no a
 * `evento_caso`, que existe para decisiones humanas.
 *
 * ⚠️ `movil_posicion` TAMBIÉN ES APPEND-ONLY: un trigger de `0006` rechaza
 *    DELETE. Verificado contra la base real. Dos consecuencias prácticas:
 *    los datos de prueba no se pueden limpiar —conviene usar ids de móvil
 *    reconocibles— y la purga de la tarea 5.8 tendrá que quitar el trigger o
 *    usar particiones por fecha, no `delete`.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export interface PuntoTraza {
  lat: number;
  lng: number;
  precisionM: number | null;
  velocidadKmh: number | null;
  disponible: boolean;
  reportadoEn: string;
}

@Injectable()
export class TrazaRepositorio {
  private readonly log = new Logger(TrazaRepositorio.name);
  private readonly pool: Pool | null;
  /** Respaldo en memoria: sin base, la traza vive el turno y se pierde. */
  private readonly enMemoria = new Map<string, PuntoTraza[]>();

  constructor(@Optional() config?: ConfigService) {
    const url = config?.get<string>('PULSO_ROUTING_DATABASE_URL');
    this.pool = url ? new Pool({ connectionString: url }) : null;
    if (!url) {
      this.log.warn(
        'Sin PULSO_ROUTING_DATABASE_URL — la traza de posiciones vive en ' +
          'memoria y se pierde al reiniciar. El recorrido del mapa sólo ' +
          'mostrará lo de esta sesión.',
      );
    }
  }

  get persistente(): boolean {
    return this.pool !== null;
  }

  /**
   * Anota un punto. NUNCA lanza: perder un punto de telemetría no puede
   * tumbar el reporte de posición, que es lo que mantiene viva la flota.
   */
  async anotar(
    movilId: string,
    organizacionId: string | null,
    p: PuntoTraza,
  ): Promise<void> {
    const cola = this.enMemoria.get(movilId) ?? [];
    cola.push(p);
    // Cota simple: sin ella, un móvil reportando cada 15 s durante un turno
    // de 12 h deja 2.880 puntos en RAM.
    this.enMemoria.set(movilId, cola.slice(-500));

    if (!this.pool) return;
    try {
      await this.pool.query(
        `insert into movil_posicion
           (movil_id, organizacion_id, geom, precision_m, velocidad_kmh,
            disponible, reportado_en)
         values ($1,$2, st_makepoint($3,$4)::geography, $5,$6,$7,$8)`,
        // PostGIS espera (lng, lat). Al revés de lo intuitivo, y es el error
        // más común contra esta base.
        [movilId, organizacionId, p.lng, p.lat, p.precisionM,
         p.velocidadKmh, p.disponible, p.reportadoEn],
      );
    } catch (e) {
      this.log.warn(`no pude anotar la traza de ${movilId}: ${String(e)}`);
    }
  }

  /**
   * El recorrido de un móvil, del más viejo al más nuevo.
   *
   * `desde` acota la ventana: sin él, un móvil con varios turnos devuelve
   * miles de puntos y el mapa se arrastra.
   */
  async recorrido(
    movilId: string,
    limite = 200,
    desde?: string,
  ): Promise<PuntoTraza[]> {
    if (!this.pool) {
      return (this.enMemoria.get(movilId) ?? []).slice(-limite);
    }
    try {
      const { rows } = await this.pool.query(
        `select st_y(geom::geometry) lat, st_x(geom::geometry) lng,
                precision_m, velocidad_kmh, disponible, reportado_en
           from movil_posicion
          where movil_id = $1 and ($2::timestamptz is null or reportado_en >= $2)
          order by reportado_en desc
          limit $3`,
        [movilId, desde ?? null, limite],
      );
      // Se piden en orden descendente para que el LIMIT tome los MÁS
      // RECIENTES, y se devuelven ascendentes porque una polilínea se dibuja
      // en el orden en que se recorrió.
      return rows.reverse().map((r) => ({
        lat: Number(r.lat),
        lng: Number(r.lng),
        precisionM: r.precision_m === null ? null : Number(r.precision_m),
        velocidadKmh: r.velocidad_kmh === null ? null : Number(r.velocidad_kmh),
        disponible: Boolean(r.disponible),
        reportadoEn:
          r.reportado_en instanceof Date
            ? r.reportado_en.toISOString()
            : String(r.reportado_en),
      }));
    } catch (e) {
      this.log.warn(`no pude leer la traza de ${movilId}: ${String(e)}`);
      return (this.enMemoria.get(movilId) ?? []).slice(-limite);
    }
  }
}
