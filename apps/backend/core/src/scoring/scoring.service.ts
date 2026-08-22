/**
 * Motor de scoring.
 *
 * DECISIÓN DE DISEÑO CENTRAL: todo el score está en MINUTOS.
 * No son "puntos" ni una suma de pesos adimensionales. Cada término es una
 * cantidad de minutos de hora dorada que esa decisión cuesta o ahorra. Por eso
 * el jurado entiende el ranking sin que nadie se lo explique.
 *
 *   Costo(sede) = ETA_con_tráfico
 *               + (1 - P_aceptación) * PENALIZACION_REBOTE
 *               + congestión * ESPERA_PUERTA_MAX
 *               - bono_por_camas_libres
 *
 * MENOR ES MEJOR.
 */

import { Injectable } from '@nestjs/common';
import type {
  Candidato,
  Caso,
  DesgloseScore,
  Sede,
} from '../contracts/types';
import {
  complejidadSuficiente,
  movilCompatible,
  nombresServicios,
  serviciosFaltantes,
} from '../catalogo/servicios-reps';
import { AlmacenService } from '../almacen/almacen.service';
import { CongestionService } from './congestion.service';
import { compareMinuteCost } from './ranking-policy';

// ─────────────────────────────────────────────────────────────────
// Constantes. Cada una tiene una justificación que se puede defender.
// ─────────────────────────────────────────────────────────────────

/**
 * Lo que tarda un hospital en contestar si acepta. Prior, antes de haber visto
 * un solo handshake de esa sede. Hoy esa respuesta llega por teléfono.
 */
export const ESPERA_RESPUESTA_PRIOR = 4;

/**
 * El resto del rebote: descargar al paciente, re-llamar, re-rutear y volver a
 * salir. No es observable desde el handshake, así que se queda constante.
 */
export const SOBRECOSTO_REBOTE = 18;

/**
 * Cuánto cuesta un rebote con una sede de la que no sabemos nada. 22 min es
 * conservador; en la práctica el "paseo de la muerte" cuesta mucho más.
 *
 * ⚠️ Es un PARÁMETRO CALIBRABLE, no una verdad: sale de juicio informado, no
 *    de una medición colombiana publicada. Decirlo en el pitch genera
 *    confianza; fingir precisión la destruye.
 */
export const PENALIZACION_REBOTE = ESPERA_RESPUESTA_PRIOR + SOBRECOSTO_REBOTE;

/**
 * Cuántas respuestas observadas hacen falta para que los datos de una sede
 * pesen tanto como el prior. Bajo a propósito: con 3 handshakes ya se nota en
 * pantalla que el sistema aprendió algo de esa sede.
 */
export const FUERZA_PRIOR_LATENCIA = 3;

/** Espera máxima en puerta de urgencias cuando la sede está al 100%. */
export const ESPERA_PUERTA_MAX = 25;

/** Bono máximo por tener camas libres declaradas. */
export const BONO_CAPACIDAD_MAX = 5;

/**
 * Prior Beta-Bernoulli de aceptación.
 * alfa0 + beta0 = 10 → equivale a "hemos visto 10 casos previos". Con pocos
 * datos el prior manda; con muchos handshakes reales, los datos mandan. Esa
 * transición es visible en el demo y es el punto del sistema.
 */
export const FUERZA_PRIOR = 10;

export interface EtaSede {
  codigo: string;
  etaMin: number;
  distKm: number;
}

@Injectable()
export class ScoringService {
  constructor(
    private readonly almacen: AlmacenService,
    private readonly congestion: CongestionService,
  ) {}

  // ── P(aceptación) — Beta-Bernoulli ─────────────────────────────

  /**
   * Prior estructural: qué tan probable es que ESTA sede acepte, antes de
   * haber visto un solo handshake. Sale de features del REPS.
   *
   * Racional (defendible ante un jurado médico):
   *  - las privadas de alta complejidad aceptan más (capacidad y flujo)
   *  - las públicas de alta complejidad reciben el grueso de la demanda de
   *    urgencias de la ciudad → rechazan más por saturación
   *  - más camas = más holgura
   */
  priorAceptacion(sede: Sede): number {
    let p = 0.55;
    if (sede.naturaleza === 'Privada') p += 0.12;
    if (sede.naturaleza === 'Pública') p -= 0.08;
    if (sede.complejidad === 'alta') p += 0.05;

    const camasTotales = sede.camas.reduce((a, c) => a + c.total, 0);
    if (camasTotales > 250) p += 0.05;
    if (camasTotales > 0 && camasTotales < 100) p -= 0.05;

    return Math.max(0.15, Math.min(0.9, p));
  }

  /**
   * Posterior. Cada handshake respondido mueve este número.
   *
   *   P = (alfa0 + aceptados) / (alfa0 + beta0 + aceptados + rechazados)
   *
   * Esto es lo que hace que la red "aprenda sola": nadie reporta nada, pero
   * cada botón apretado es una observación etiquetada.
   */
  pAceptacion(sede: Sede): number {
    const prior = this.priorAceptacion(sede);
    const alfa0 = prior * FUERZA_PRIOR;
    const beta0 = (1 - prior) * FUERZA_PRIOR;
    const { aceptados, rechazados } = this.almacen.historialSede(sede.codigo);
    return (alfa0 + aceptados) / (alfa0 + beta0 + aceptados + rechazados);
  }

  // ── Penalización de rebote, por sede ───────────────────────────

  /**
   * Cuántos minutos cuesta que ESTA sede diga que no.
   *
   * El rebote tiene dos mitades y solo una es observable:
   *
   *   1. Lo que la sede tarda en contestar → SÍ lo medimos. Cada handshake
   *      deja su `latenciaS`. Una sede que contesta en 40 segundos cuesta
   *      mucho menos rebotar que una que se demora ocho minutos.
   *   2. Descargar, re-llamar, re-rutear y volver a salir → no lo medimos, y
   *      es igual para todas. Se queda en SOBRECOSTO_REBOTE.
   *
   * Sobre la mitad observable aplicamos el mismo encogimiento hacia el prior
   * que usa P(aceptación): con 0 datos devuelve exactamente los 22 minutos de
   * siempre, y cada respuesta observada lo mueve hacia lo que esa sede hace de
   * verdad. Nadie reporta nada; el número se calibra solo.
   */
  penalizacionRebote(sedeCodigo: string): number {
    const observadas = this.almacen.latenciasRespuestaMin(sedeCodigo);
    const suma = observadas.reduce((a, b) => a + b, 0);
    const espera =
      (FUERZA_PRIOR_LATENCIA * ESPERA_RESPUESTA_PRIOR + suma) /
      (FUERZA_PRIOR_LATENCIA + observadas.length);
    return espera + SOBRECOSTO_REBOTE;
  }

  // ── Score ──────────────────────────────────────────────────────

  calcularDesglose(sede: Sede, etaMin: number, fecha = new Date()): DesgloseScore {
    const p = this.pAceptacion(sede);
    const c = this.congestion.indice(sede, fecha);
    return {
      ruta: etaMin,
      riesgoRechazo: (1 - p) * this.penalizacionRebote(sede.codigo),
      espera: c * ESPERA_PUERTA_MAX,
      bono: -(holgura(sede) * BONO_CAPACIDAD_MAX),
    };
  }

  // ── Ranking ────────────────────────────────────────────────────

  /**
   * Convierte sedes + ETAs en el ranking final.
   *
   * Dos pasos, en este orden y no al revés:
   *  1. FILTRO DURO   — servicios habilitados, complejidad, tipo de móvil.
   *                     Esto NO se pondera. Una sede sin hemodinamia no es
   *                     "peor opción", es NO OPCIÓN.
   *  2. RANKING BLANDO — costo en minutos sobre las que sobrevivieron.
   *
   * Las descartadas igual se devuelven (con serviciosFaltantes lleno) para que
   * el front las pueda pintar en gris. Ver una sede a 4 minutos tachada por
   * "no tiene hemodinamia" es lo que hace entender el producto de un vistazo.
   */
  rankear(
    caso: Caso,
    sedes: Sede[],
    etas: EtaSede[],
    opciones: { limite?: number; incluirDescartadas?: boolean } = {},
  ): Candidato[] {
    const { limite = 5, incluirDescartadas = true } = opciones;
    const fecha = new Date();
    const mapaEta = new Map(etas.map((e) => [e.codigo, e]));

    const evaluados: Candidato[] = [];

    for (const sede of sedes) {
      const eta = mapaEta.get(sede.codigo);
      if (!eta) continue;

      const faltantes = serviciosFaltantes(sede.servicios, caso.serviciosRequeridos);
      const complejidadOk = complejidadSuficiente(
        sede.complejidad,
        caso.complejidadRequerida,
      );
      const movilOk = movilCompatible(caso.tipoMovil, caso.requiereMedicoABordo);

      // El primer motivo que aparezca es el que se muestra. Un solo motivo
      // claro se lee mejor que una lista de tres.
      let motivoDescarte: string | null = null;
      if (faltantes.length > 0) {
        motivoDescarte = `No tiene ${nombresServicios(faltantes)}`;
      } else if (!complejidadOk) {
        motivoDescarte = `Complejidad ${sede.complejidad}, el caso requiere ${caso.complejidadRequerida}`;
      } else if (!movilOk) {
        motivoDescarte = 'El paciente requiere médico a bordo (móvil TAM)';
      }

      const desglose = this.calcularDesglose(sede, eta.etaMin, fecha);

      evaluados.push({
        sede,
        rank: 0, // se asigna abajo
        etaMin: eta.etaMin,
        distKm: eta.distKm,
        pAceptacion: this.pAceptacion(sede),
        congestion: this.congestion.indice(sede, fecha),
        score: sumarDesglose(desglose),
        desglose,
        serviciosFaltantes: faltantes,
        motivoDescarte,
      });
    }

    const viables = evaluados
      .filter((c) => c.motivoDescarte === null)
      .sort((a, b) => compareMinuteCost({ codigo: a.sede.codigo, totalMinutes: a.score, etaMin: a.etaMin }, { codigo: b.sede.codigo, totalMinutes: b.score, etaMin: b.etaMin }))
      .slice(0, limite)
      .map((c, i) => ({ ...c, rank: i + 1 }));

    if (!incluirDescartadas) return viables;

    const descartadas = evaluados
      .filter((c) => c.motivoDescarte !== null)
      .sort((a, b) => a.etaMin - b.etaMin)
      .slice(0, 4)
      .map((c) => ({ ...c, rank: 0 }));

    return [...viables, ...descartadas];
  }

  /**
   * Texto de una línea que explica POR QUÉ ganó el #1.
   * Se usa en el pitch y debajo de la tarjeta ganadora.
   */
  explicarGanador(ganador: Candidato, segundo?: Candidato): string {
    if (!segundo) {
      return (
        `${ganador.sede.nombre}: ${Math.round(ganador.etaMin)} min de ruta, ` +
        `${Math.round(ganador.pAceptacion * 100)}% de probabilidad de aceptación.`
      );
    }
    const dif = segundo.score - ganador.score;
    const masCerca = segundo.etaMin < ganador.etaMin;
    if (masCerca) {
      return (
        `${segundo.sede.nombre} está ${Math.round(segundo.etaMin - ganador.etaMin)} min más cerca, ` +
        `pero su riesgo de rechazo y congestión suman ${Math.round(
          segundo.desglose.riesgoRechazo + segundo.desglose.espera,
        )} min. ${ganador.sede.nombre} gana por ${Math.round(dif)} min efectivos.`
      );
    }
    return `${ganador.sede.nombre} gana por ${Math.round(dif)} min efectivos sobre ${segundo.sede.nombre}.`;
  }
}

export function sumarDesglose(d: DesgloseScore): number {
  return d.ruta + d.riesgoRechazo + d.espera + d.bono;
}

/** Fracción de camas libres declaradas (0..1). */
function holgura(sede: Sede): number {
  const total = sede.camas.reduce((a, c) => a + c.total, 0);
  if (!total) return 0;
  const ocupadas = sede.camas.reduce((a, c) => a + c.ocupadasSnapshot, 0);
  return Math.max(0, (total - ocupadas) / total);
}
