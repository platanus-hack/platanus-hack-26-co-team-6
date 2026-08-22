/**
 * Índice de congestión — 0 (vacío) a 1 (colapsado).
 *
 * ═══════════════════════════════════════════════════════════════════
 *  LEER ESTO ANTES DEL PITCH
 * ═══════════════════════════════════════════════════════════════════
 *  No estamos midiendo camas en tiempo real. No tenemos ese sensor y nadie
 *  en 36h lo tiene. Lo que hacemos es mejor de explicar y además es cierto:
 *
 *    El acto de rechazar YA ES el sensor.
 *
 *  Hoy ese rechazo se pierde en una llamada telefónica. PULSO lo captura, lo
 *  fecha, y lo convierte en el prior de la siguiente decisión. Cero fricción
 *  para el hospital: no tipea nada, solo aprieta un botón que ya iba a apretar.
 *
 *  El dataset "Registro diario de ocupación de capacidad instalada"
 *  (uwc4-gvg3 en datos.gov.co) tiene 8.389 filas y UNA SOLA FECHA:
 *  2022-11-30. El Estado ya intentó pedir el reporte manual. Se apagó.
 *
 *  Lo que SÍ tenemos medido, y alimenta las señales 1 y 2:
 *    - ocupación mensual real de urgencias por subred, 2021-2025
 *      (Sur Occidente llegó a 219%)
 *    - curva de demanda de 9206 incidentes reales del 123
 *  Ver data/CATALOGO.md y scripts/datos/.
 * ═══════════════════════════════════════════════════════════════════
 */

import { Injectable } from '@nestjs/common';
import type { Sede } from '../contracts/types';
import { AlmacenService } from '../almacen/almacen.service';
import {
  CURVA_DIA_POR_INDICE,
  CURVA_HORA,
  DEMANDA_META,
} from './demanda.generada';

/** Pesos de las cuatro señales. Suman 1. */
export const PESOS = {
  ocupacionBase: 0.35,
  horario: 0.2,
  rechazoReciente: 0.35, // ← la señal viva
  epidemiologico: 0.1,
} as const;

@Injectable()
export class CongestionService {
  constructor(private readonly almacen: AlmacenService) {}

  /**
   * Señal 1 — ocupación estructural.
   * Sale del snapshot REPS. Es un PRIOR de "qué tan apretada vive esta sede",
   * no la ocupación de hoy. Ponderamos doble las camas de UCI porque son el
   * cuello de botella real de un traslado de alta complejidad.
   */
  ocupacionBase(sede: Sede): number {
    if (!sede.camas.length) return 0.7; // sin dato → asumimos apretado

    let numerador = 0;
    let denominador = 0;
    for (const c of sede.camas) {
      if (c.total <= 0) continue;
      const peso = /UCI|Intensivo/i.test(c.tipo) ? 2 : 1;
      numerador += (c.ocupadasSnapshot / c.total) * peso;
      denominador += peso;
    }
    return denominador ? clamp01(numerador / denominador) : 0.7;
  }

  /**
   * Señal 2 — curva de demanda de urgencias. MEDIDA, no supuesta.
   *
   * Sale de CURVA_HORA, que genera el pipeline de datos a partir de 9206
   * incidentes reales del 123. Devuelve 0..1 donde 1 = hora pico.
   *
   * ⚠️ ESTA CURVA CONTRADIJO LO QUE TENIAMOS. Antes había aquí una curva
   *    escrita a mano que ponía el pico a las 20:00 y suponía que la tarde
   *    (17:00-18:00) era casi tan cargada como la noche. Los datos dicen:
   *
   *      pico real     09:00   (la curva vieja le daba 0.70)
   *      20:00         0.65    (la curva vieja le daba 1.00)
   *
   *    Estábamos penalizando hospitales por "hora pico" siete horas tarde.
   *
   *    El día de semana también estaba al revés: el código asumía fin de
   *    semana +12%, y los datos dicen que sábado (0.92) y domingo (0.91) son
   *    los días MÁS flojos. Los picos son lunes (1.11) y martes (1.12).
   *
   *    Si alguien vuelve a escribir números a mano aquí, esto se pierde.
   */
  factorHorario(fecha = new Date()): number {
    const base = CURVA_HORA[fecha.getHours()] ?? 0.7;
    // El día de semana también sale medido, no de un 1.12 inventado.
    const factorDia = CURVA_DIA_POR_INDICE[fecha.getDay()] ?? 1;
    return clamp01(base * factorDia);
  }

  /**
   * Señal 3 — ⭐ la señal viva, sin fricción.
   * Cada rechazo en las últimas 6h empuja la congestión hacia arriba.
   * Saturamos en 4 rechazos: más allá de eso ya sabemos que está colapsado.
   */
  senalRechazo(sedeCodigo: string): number {
    return clamp01(this.almacen.rechazosEnVentana(sedeCodigo, 6) / 4);
  }

  /**
   * Señal 4 — presión epidemiológica.
   * Stub honesto: hoy es estacional (picos respiratorios en temporada de
   * lluvias bogotana, abril-mayo y octubre-noviembre). El upgrade real es
   * cruzar con SIVIGILA/INS. Si no da tiempo, se queda así y se dice tal cual.
   */
  presionEpidemiologica(fecha = new Date()): number {
    const mes = fecha.getMonth(); // 0 = enero
    const picoRespiratorio = [3, 4, 9, 10].includes(mes);
    return picoRespiratorio ? 0.75 : 0.4;
  }

  /** Índice compuesto. Esto es lo que ve el paramédico como barra de color. */
  indice(sede: Sede, fecha = new Date()): number {
    const c =
      PESOS.ocupacionBase * this.ocupacionBase(sede) +
      PESOS.horario * this.factorHorario(fecha) +
      PESOS.rechazoReciente * this.senalRechazo(sede.codigo) +
      PESOS.epidemiologico * this.presionEpidemiologica(fecha);
    return clamp01(c);
  }

  /** De dónde salió la curva. Lo pinta el panel de "por qué". */
  procedenciaDemanda() {
    return DEMANDA_META;
  }

  /** Desglose para el panel de "por qué" — se pinta al abrir una tarjeta. */
  desglose(sede: Sede, fecha = new Date()) {
    return {
      ocupacionBase: this.ocupacionBase(sede),
      horario: this.factorHorario(fecha),
      rechazoReciente: this.senalRechazo(sede.codigo),
      epidemiologico: this.presionEpidemiologica(fecha),
      total: this.indice(sede, fecha),
    };
  }

  etiqueta(c: number): 'baja' | 'media' | 'alta' | 'crítica' {
    if (c < 0.5) return 'baja';
    if (c < 0.7) return 'media';
    if (c < 0.85) return 'alta';
    return 'crítica';
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
