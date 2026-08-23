/**
 * `GET /zonas` — las 19 localidades con su demanda histórica real.
 *
 * Es lo que el mapa necesita para pintar el **mapa de calor**: cuánta
 * urgencia se atiende en cada zona, para colorearlas y filtrar.
 *
 * El dato NO es una estimación: sale de las **9.206 llamadas del NUSE 123**
 * procesadas por `scripts/etl/demanda_123.py`. Kennedy concentra el 15,0% de
 * la demanda de la ciudad; Sumapaz el 0,08%.
 *
 * ⚠️ SIN POLÍGONOS. Se devuelve `centroide`, no geometría: las llamadas del
 *    123 no traen coordenadas —la unidad más fina es la localidad— y en el
 *    repo no hay polígonos de localidad. El mapa puede pintar círculos
 *    proporcionales a la demanda; para coropletas de verdad hacen falta los
 *    polígonos de datos abiertos de Bogotá.
 *
 * Público a propósito: son datos abiertos agregados, sin un solo paciente
 * adentro. Exigir sesión para pintar un mapa de calor de la ciudad sería
 * cerrar lo que ya es público.
 */

import { Controller, Get, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Publico } from '../auth/publico.decorator';

/** `core/src/zonas/` → `src/` → `core/` → `backend/` → `apps/` → raíz. */
const RAIZ = join(__dirname, '..', '..', '..', '..', '..');
const DEMANDA = join(RAIZ, 'data', 'derivados', 'demanda_localidad.json');

/**
 * Centroides aproximados por localidad, en ASCII sin tildes — igual que los
 * normaliza el ETL. El CSV del 123 tiene codificación mixta y "USAQUÉN" llega
 * de dos formas distintas según la fila; una clave con tilde no cruza y esa
 * localidad desaparece del mapa en silencio.
 */
const CENTROIDES: Record<string, [number, number]> = {
  USAQUEN: [4.703, -74.03], CHAPINERO: [4.649, -74.058],
  'SANTA FE': [4.608, -74.07], 'SAN CRISTOBAL': [4.557, -74.087],
  USME: [4.479, -74.126], TUNJUELITO: [4.572, -74.132],
  BOSA: [4.618, -74.195], KENNEDY: [4.628, -74.155],
  FONTIBON: [4.674, -74.146], ENGATIVA: [4.706, -74.117],
  SUBA: [4.744, -74.083], 'BARRIOS UNIDOS': [4.667, -74.083],
  TEUSAQUILLO: [4.639, -74.092], 'LOS MARTIRES': [4.604, -74.09],
  'ANTONIO NARINO': [4.591, -74.1], 'PUENTE ARANDA': [4.615, -74.115],
  'LA CANDELARIA': [4.594, -74.074], 'RAFAEL URIBE URIBE': [4.558, -74.116],
  'CIUDAD BOLIVAR': [4.531, -74.156], SUMAPAZ: [4.1, -74.3],
};

export interface ZonaDemanda {
  id: string;
  nombre: string;
  /** Fracción de la demanda de la ciudad (0..1). El color del mapa. */
  demandaRelativa: number;
  llamadas: number;
  /** Cuántas fueron prioridad alta o crítica. */
  llamadasPrioritarias: number;
  /** 24 valores. Permite animar el mapa por hora del día. */
  porHora: number[];
  /** Hora pico de esta zona. El dato que sorprende: no es la noche. */
  horaPico: number;
  centroide: { lat: number; lng: number };
}

@Controller('zonas')
export class ZonasController {
  private readonly log = new Logger(ZonasController.name);
  private cache: { zonas: ZonaDemanda[]; fuente: string; llamadas: number } | null =
    null;

  @Publico()
  @Get()
  demanda() {
    if (!this.cache) this.cache = this.cargar();
    return {
      ...this.cache,
      // La consola LO DICE: los centroides son referencias, no geometría.
      // Un mapa que pinta un punto aproximado con la misma tipografía que uno
      // exacto miente por omisión.
      geometria: 'centroide-aproximado',
      nota:
        'Demanda histórica del NUSE 123. Los centroides son referencias por ' +
        'localidad, no polígonos: sirven para colorear, no para navegar.',
    };
  }

  private cargar() {
    try {
      const datos = JSON.parse(readFileSync(DEMANDA, 'utf8')) as {
        llamadas: number;
        fuente: string;
        zonas: Array<Record<string, unknown>>;
      };

      const zonas: ZonaDemanda[] = [];
      const sinCentroide: string[] = [];

      for (const z of datos.zonas) {
        const nombre = String(z.localidad);
        const centro = CENTROIDES[nombre];
        if (!centro) {
          sinCentroide.push(nombre);
          continue;
        }
        const porHora = (z.porHora as number[]) ?? [];
        zonas.push({
          id: String(z.codigo || nombre),
          nombre,
          demandaRelativa: Number(z.fraccionDemanda ?? 0),
          llamadas: Number(z.llamadas ?? 0),
          llamadasPrioritarias: Number(z.llamadasPrioritarias ?? 0),
          porHora,
          horaPico: porHora.length
            ? porHora.indexOf(Math.max(...porHora))
            : -1,
          centroide: { lat: centro[0], lng: centro[1] },
        });
      }

      // Una localidad sin centroide desaparece del mapa. Callarlo dejaría un
      // hueco que nadie ve.
      if (sinCentroide.length) {
        this.log.warn(`localidades sin centroide: ${sinCentroide.join(', ')}`);
      }

      return { zonas, fuente: datos.fuente, llamadas: datos.llamadas };
    } catch (e) {
      // Sin el archivo derivado no hay mapa de calor, pero el resto de core
      // sigue vivo. Se avisa y se devuelve vacío, no se revienta.
      this.log.error(
        `no pude leer ${DEMANDA}: ${String(e)}. ` +
          'Corre: python3 scripts/etl/demanda_123.py',
      );
      return { zonas: [], fuente: 'no disponible', llamadas: 0 };
    }
  }
}
