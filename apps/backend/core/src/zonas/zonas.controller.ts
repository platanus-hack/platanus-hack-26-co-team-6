/**
 * `GET /zonas` — la grilla de cobertura de Bogotá.
 *
 * ⚠️ NO SON LAS LOCALIDADES. Son hexágonos H3 de resolución 8 (~0,74 km²),
 * generados por `scripts/etl/grilla_h3.py`. Las localidades son divisiones
 * administrativas de tamaños incomparables —Sumapaz 780 km², La Candelaria 2—
 * y «manda una ambulancia a cubrir Sumapaz» no significa nada. Los hexágonos
 * son parametrizables, comparables y subdivisibles, que es lo que hace falta
 * para repartir una flota. Es el modelo de Uber, y H3 es su librería.
 *
 * Un hexágono tiene 6 vecinos TODOS a la misma distancia. Un cuadrado tiene 4
 * de lado y 4 en diagonal, un 41% más lejos: cualquier cálculo de «la zona de
 * al lado» queda sesgado.
 *
 * LA DEMANDA sale de las 9.206 llamadas del NUSE 123, como **densidad por
 * km²** de su localidad. Los Mártires lidera con 47,9 llamadas/km², no
 * Kennedy — que tiene más llamadas totales pero está mucho más extendida.
 * Esa diferencia es la que decide dónde conviene esperar.
 *
 * ⚠️ SE ASUME QUE LA DEMANDA SE REPARTE UNIFORME DENTRO DE CADA LOCALIDAD, y
 *    no es cierto: el 123 no trae coordenadas. La comparación ENTRE
 *    localidades sí es exacta; la de dos hexágonos de la misma, no. La
 *    respuesta lo declara para que la consola pueda decirlo.
 *
 * Público a propósito: son datos abiertos agregados, sin un paciente adentro.
 */

import { Controller, Get, Logger, Query } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Publico } from '../auth/publico.decorator';

/** `core/src/zonas/` → `src/` → `core/` → `backend/` → `apps/` → raíz. */
const RAIZ = join(__dirname, '..', '..', '..', '..', '..');
const GRILLA = join(RAIZ, 'data', 'derivados', 'zonas_h3.json');
const POLIGONOS = join(RAIZ, 'data', 'geo', 'localidades.geojson');

/** Lo que el ETL deja al lado de las zonas: procedencia y advertencias. */
export interface MetaGrilla {
  resolucion?: number;
  celdas?: number;
  _fuente?: string;
  _demanda?: string;
  _advertencia?: string;
  _descartado?: string;
  error?: string;
}

export interface ZonaH3 {
  /** Índice H3. Opaco a propósito: cambiar de resolución no rompe a nadie. */
  id: string;
  localidad: string;
  centroide: { lat: number; lng: number };
  /** Llamadas por km² de su localidad. El color del mapa de calor. */
  densidad: number;
  /** Normalizada, suma 1 sobre la grilla. Lo que usa el reparto. */
  demandaRelativa: number;
}

@Controller('zonas')
export class ZonasController {
  private readonly log = new Logger(ZonasController.name);
  private grilla: { zonas: ZonaH3[]; meta: MetaGrilla } | null = null;
  private poligonos: unknown | null = null;

  /**
   * `?localidad=KENNEDY` recorta. Sin filtro son 1.114 hexágonos (~167 KB):
   * mucho para una consola móvil, bien para el tablero del CRUE.
   */
  @Publico()
  @Get()
  zonas(
    @Query('localidad') localidad?: string,
  ): MetaGrilla & { zonas: ZonaH3[]; total: number } {
    if (!this.grilla) this.grilla = this.cargarGrilla();
    const filtro = localidad?.trim().toUpperCase();
    const zonas = filtro
      ? this.grilla.zonas.filter((z) => z.localidad === filtro)
      : this.grilla.zonas;

    return { ...this.grilla.meta, zonas, total: zonas.length };
  }

  /**
   * `GET /zonas/localidades` — los polígonos oficiales, para el contorno.
   *
   * La grilla pinta el calor; esto pinta las fronteras y los nombres. Un
   * regulador del CRUE sabe «Kennedy», no `8a2a1072b59ffff`.
   */
  @Publico()
  @Get('localidades')
  localidades() {
    if (!this.poligonos) {
      try {
        this.poligonos = JSON.parse(readFileSync(POLIGONOS, 'utf8'));
      } catch (e) {
        this.log.error(`no pude leer ${POLIGONOS}: ${String(e)}`);
        this.poligonos = { type: 'FeatureCollection', features: [] };
      }
    }
    return this.poligonos;
  }

  private cargarGrilla() {
    try {
      const d = JSON.parse(readFileSync(GRILLA, 'utf8')) as {
        zonas: ZonaH3[];
      } & MetaGrilla;
      const { zonas, ...meta } = d;
      return { zonas, meta: meta as MetaGrilla };
    } catch (e) {
      // Sin la grilla no hay mapa de calor ni reparto, pero el resto de core
      // sigue vivo. Se avisa y se devuelve vacío, no se revienta.
      this.log.error(
        `no pude leer ${GRILLA}: ${String(e)}. ` +
          'Corre: python3 scripts/etl/grilla_h3.py',
      );
      return { zonas: [], meta: { error: 'grilla no disponible' } };
    }
  }
}
