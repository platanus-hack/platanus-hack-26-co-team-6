import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { nombreServicio } from '../catalogo/servicios-reps';
import type { Sede } from '../contracts/types';
import { cargarFuente, type FuenteDatos, type TipoFuente } from './fuentes';
import { PostgresService } from './postgres.service';

export interface ResultadoSiembra {
  fuente: TipoFuente;
  sedes: number;
  servicios: number;
  capacidades: number;
  sedesSinServicios: number;
  serviciosDisponibles: boolean;
}

export interface ResultadoVerificacion {
  totalSedes: number;
  fueraBogota: number;
  sinGeom: number;
  conUrgencias: number;
  conHemodinamia: number;
  cercanas: number;
}

interface ResumenDb {
  total_sedes: number | string;
  fuera_bogota: number | string;
  sin_geom: number | string;
  con_urgencias: number | string;
  con_hemodinamia: number | string;
}

const TAMANO_LOTE_SEDES = 500;
const TAMANO_LOTE_HIJOS = 1_000;

@Injectable()
export class DatosService {
  constructor(private readonly pg: PostgresService) {}

  async sembrar(fuente: TipoFuente): Promise<ResultadoSiembra> {
    return this.sembrarSedes(await cargarFuente(fuente), fuente);
  }

  /** Punto de entrada separado para probar los upserts sin leer archivos. */
  async sembrarSedes(
    datos: FuenteDatos,
    fuente: TipoFuente,
  ): Promise<ResultadoSiembra> {
    if (datos.sedes.length === 0) {
      throw new Error(`La fuente ${fuente} no produjo ninguna sede.`);
    }

    const servicios = datos.sedes.flatMap((sede) =>
      sede.servicios.map((codServicio) => ({
        codigoSede: sede.codigo,
        codServicio,
        nombre: nombreServicio(codServicio),
      })),
    );
    const capacidades = datos.sedes.flatMap((sede) =>
      sede.camas.map((cama) => ({ codigoSede: sede.codigo, ...cama })),
    );

    await this.pg.enTransaccion(async (cx) => {
      await insertarSedes(cx, datos.sedes);
      await insertarServicios(cx, servicios);
      await insertarCapacidades(cx, capacidades);
    });

    const [sinServicios] = await this.pg.consultar<{
      cantidad: number | string;
    }>(
      `select count(*)::int as cantidad
         from sede s
        where not exists (
          select 1 from servicio_sede ss where ss.codigo_sede = s.codigo
        )`,
    );
    const sedesSinServicios = Number(sinServicios?.cantidad ?? 0);

    return {
      fuente,
      sedes: datos.sedes.length,
      servicios: servicios.length,
      capacidades: capacidades.length,
      sedesSinServicios,
      serviciosDisponibles: datos.serviciosDisponibles,
    };
  }

  async verificar(): Promise<ResultadoVerificacion> {
    const [resumen] = await this.pg.consultar<ResumenDb>(`
      select
        count(*)::int as total_sedes,
        count(*) filter (
          where geom is not null and (
            st_y(geom::geometry) not between 4.45 and 4.84
            or st_x(geom::geometry) not between -74.25 and -73.99
          )
        )::int as fuera_bogota,
        count(*) filter (where geom is null)::int as sin_geom,
        count(*) filter (
          where exists (
            select 1 from servicio_sede ss
            where ss.codigo_sede = sede.codigo and ss.cod_servicio = 1102
          )
        )::int as con_urgencias,
        count(*) filter (
          where exists (
            select 1 from servicio_sede ss
            where ss.codigo_sede = sede.codigo and ss.cod_servicio = 743
          )
        )::int as con_hemodinamia
      from sede
    `);
    const [cercanas] = await this.pg.consultar<{ cantidad: number | string }>(`
      select count(*)::int as cantidad
      from sedes_cercanas(4.5981, -74.0758, 25000)
    `);

    const resultado: ResultadoVerificacion = {
      totalSedes: Number(resumen?.total_sedes ?? 0),
      fueraBogota: Number(resumen?.fuera_bogota ?? 0),
      sinGeom: Number(resumen?.sin_geom ?? 0),
      conUrgencias: Number(resumen?.con_urgencias ?? 0),
      conHemodinamia: Number(resumen?.con_hemodinamia ?? 0),
      cercanas: Number(cercanas?.cantidad ?? 0),
    };

    const errores: string[] = [];
    if (resultado.totalSedes === 0) errores.push('No hay sedes cargadas.');
    if (resultado.fueraBogota > 0) {
      errores.push(
        `${resultado.fueraBogota} sede(s) están fuera del bounding box de Bogotá.`,
      );
    }
    if (resultado.sinGeom > 0) {
      errores.push(`${resultado.sinGeom} sede(s) tienen geom nulo.`);
    }
    if (resultado.conUrgencias === 0) {
      errores.push('Ninguna sede tiene urgencias (servicio 1102).');
    }
    if (resultado.conHemodinamia === 0) {
      errores.push(
        'Ninguna sede tiene hemodinamia (servicio 743); el demo del IAM no tiene ganador.',
      );
    }
    if (resultado.cercanas === 0) {
      errores.push(
        'sedes_cercanas(4.5981, -74.0758, 25000) no devolvió filas.',
      );
    }

    if (errores.length > 0) {
      throw new Error(`Verificación fallida:\n  - ${errores.join('\n  - ')}`);
    }
    return resultado;
  }
}

async function insertarSedes(cx: PoolClient, sedes: Sede[]): Promise<void> {
  for (const lote of lotes(sedes, TAMANO_LOTE_SEDES)) {
    const params: unknown[] = [];
    const valores = lote.map((sede) => {
      const inicio = params.length;
      params.push(
        sede.codigo,
        sede.nombre,
        sede.direccion,
        sede.localidad,
        sede.naturaleza,
        sede.complejidad,
        sede.telefono,
        sede.coord.lng,
        sede.coord.lat,
      );
      const p = (offset: number) => `$${inicio + offset}`;
      return `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)},
        st_makepoint(${p(8)}, ${p(9)})::geography,
        ${p(5)}, ${p(6)}, ${p(7)})`;
    });

    await cx.query(
      `insert into sede (
        codigo, nombre, direccion, localidad, geom,
        naturaleza, complejidad, telefono
      ) values ${valores.join(',')}
      on conflict (codigo) do update set
        nombre = excluded.nombre,
        direccion = excluded.direccion,
        localidad = excluded.localidad,
        geom = excluded.geom,
        naturaleza = excluded.naturaleza,
        complejidad = excluded.complejidad,
        telefono = excluded.telefono`,
      params,
    );
  }
}

async function insertarServicios(
  cx: PoolClient,
  servicios: Array<{
    codigoSede: string;
    codServicio: number;
    nombre: string;
  }>,
): Promise<void> {
  for (const lote of lotes(servicios, TAMANO_LOTE_HIJOS)) {
    const params: unknown[] = [];
    const valores = lote.map((servicio) => {
      const inicio = params.length;
      params.push(servicio.codigoSede, servicio.codServicio, servicio.nombre);
      return `($${inicio + 1}, $${inicio + 2}, $${inicio + 3})`;
    });
    await cx.query(
      `insert into servicio_sede (codigo_sede, cod_servicio, nombre_servicio)
       values ${valores.join(',')}
       on conflict (codigo_sede, cod_servicio) do update set
         nombre_servicio = excluded.nombre_servicio`,
      params,
    );
  }
}

async function insertarCapacidades(
  cx: PoolClient,
  capacidades: Array<{
    codigoSede: string;
    tipo: string;
    total: number;
    ocupadasSnapshot: number;
  }>,
): Promise<void> {
  for (const lote of lotes(capacidades, TAMANO_LOTE_HIJOS)) {
    const params: unknown[] = [];
    const valores = lote.map((capacidad) => {
      const inicio = params.length;
      params.push(
        capacidad.codigoSede,
        capacidad.tipo,
        capacidad.total,
        capacidad.ocupadasSnapshot,
      );
      return `($${inicio + 1}, $${inicio + 2}, $${inicio + 3}, $${inicio + 4})`;
    });
    await cx.query(
      `insert into capacidad_sede (
         codigo_sede, tipo_capacidad, camas_reps, ocupadas_snapshot
       ) values ${valores.join(',')}
       on conflict (codigo_sede, tipo_capacidad) do update set
         camas_reps = excluded.camas_reps,
         ocupadas_snapshot = excluded.ocupadas_snapshot`,
      params,
    );
  }
}

function* lotes<T>(items: T[], tamano: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += tamano) {
    yield items.slice(i, i + tamano);
  }
}
