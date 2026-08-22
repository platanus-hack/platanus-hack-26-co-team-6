/**
 * Motor de scoring.
 *
 * DECISION DE DISENO CENTRAL: todo el score esta en MINUTOS.
 * No son "puntos" ni una suma de pesos adimensionales. Cada termino es
 * una cantidad de minutos de hora dorada que esa decision cuesta o ahorra.
 * Por eso el jurado entiende el ranking sin que nadie se lo explique.
 *
 *   Costo(sede) = ETA_con_trafico
 *               + (1 - P_aceptacion) * PENALIZACION_REBOTE
 *               + congestion * ESPERA_PUERTA_MAX
 *               - bono_por_camas_libres
 *
 * MENOR ES MEJOR.
 */

import type { Caso, Candidato, Sede, DesgloseScore } from "./types";
import {
  serviciosFaltantes,
  movilCompatible,
  complejidadSuficiente,
  nombresServicios,
} from "./servicios-reps";
import { indiceCongestion } from "./congestion";
import { historialSede } from "./almacen";

// ─────────────────────────────────────────────────────────────────
// Constantes. Cada una tiene una justificacion que se puede defender.
// ─────────────────────────────────────────────────────────────────

/**
 * Cuanto cuesta un rebote. Descargar al paciente, volver a llamar,
 * re-rutear y volver a salir. 22 min es conservador; en la practica
 * el "paseo de la muerte" cuesta mucho mas.
 */
export const PENALIZACION_REBOTE = 22;

/** Espera maxima en puerta de urgencias cuando la sede esta al 100%. */
export const ESPERA_PUERTA_MAX = 25;

/** Bono maximo por tener camas libres declaradas. */
export const BONO_CAPACIDAD_MAX = 5;

/**
 * Prior Beta-Bernoulli de aceptacion.
 * alfa0 + beta0 = 10 → equivale a "hemos visto 10 casos previos".
 * Con pocos datos el prior manda; con muchos handshakes reales, los datos
 * mandan. Esa transicion es visible en el demo y es el punto del sistema.
 */
export const FUERZA_PRIOR = 10;

// ─────────────────────────────────────────────────────────────────
// P(aceptacion) — Beta-Bernoulli
// ─────────────────────────────────────────────────────────────────

/**
 * Prior estructural: que tan probable es que ESTA sede acepte, antes de
 * haber visto un solo handshake. Sale de features del REPS.
 *
 * Racional (defendible ante un jurado medico):
 *  - las privadas de alta complejidad aceptan mas (capacidad y flujo)
 *  - las publicas de alta complejidad reciben el grueso de la demanda
 *    de urgencias de la ciudad → rechazan mas por saturacion
 *  - mas camas = mas holgura
 */
export function priorAceptacion(sede: Sede): number {
  let p = 0.55;
  if (sede.naturaleza === "Privada") p += 0.12;
  if (sede.naturaleza === "Pública") p -= 0.08;
  if (sede.complejidad === "alta") p += 0.05;

  const camasTotales = sede.camas.reduce((a, c) => a + c.total, 0);
  if (camasTotales > 250) p += 0.05;
  if (camasTotales > 0 && camasTotales < 100) p -= 0.05;

  return Math.max(0.15, Math.min(0.9, p));
}

/**
 * Posterior. Cada handshake respondido mueve este numero.
 *
 *   P = (alfa0 + aceptados) / (alfa0 + beta0 + aceptados + rechazados)
 *
 * Esto es lo que hace que la red "aprenda sola": nadie reporta nada,
 * pero cada boton apretado es una observacion etiquetada.
 */
export function pAceptacion(sede: Sede): number {
  const prior = priorAceptacion(sede);
  const alfa0 = prior * FUERZA_PRIOR;
  const beta0 = (1 - prior) * FUERZA_PRIOR;
  const { aceptados, rechazados } = historialSede(sede.codigo);
  return (alfa0 + aceptados) / (alfa0 + beta0 + aceptados + rechazados);
}

// ─────────────────────────────────────────────────────────────────
// Score
// ─────────────────────────────────────────────────────────────────

/** Fraccion de camas libres declaradas (0..1). */
function holgura(sede: Sede): number {
  const total = sede.camas.reduce((a, c) => a + c.total, 0);
  if (!total) return 0;
  const ocupadas = sede.camas.reduce((a, c) => a + c.ocupadasSnapshot, 0);
  return Math.max(0, (total - ocupadas) / total);
}

export function calcularDesglose(
  sede: Sede,
  etaMin: number,
  fecha = new Date()
): DesgloseScore {
  const p = pAceptacion(sede);
  const c = indiceCongestion(sede, fecha);
  return {
    ruta: etaMin,
    riesgoRechazo: (1 - p) * PENALIZACION_REBOTE,
    espera: c * ESPERA_PUERTA_MAX,
    bono: -(holgura(sede) * BONO_CAPACIDAD_MAX),
  };
}

export function sumarDesglose(d: DesgloseScore): number {
  return d.ruta + d.riesgoRechazo + d.espera + d.bono;
}

// ─────────────────────────────────────────────────────────────────
// Ranking
// ─────────────────────────────────────────────────────────────────

export interface EtaSede {
  codigo: string;
  etaMin: number;
  distKm: number;
}

/**
 * Convierte sedes + ETAs en el ranking final.
 *
 * Dos pasos, en este orden y no al reves:
 *  1. FILTRO DURO   — servicios habilitados, complejidad, tipo de movil.
 *                     Esto NO se pondera. Una sede sin hemodinamia no es
 *                     "peor opcion", es NO OPCION.
 *  2. RANKING BLANDO — costo en minutos sobre las que sobrevivieron.
 *
 * Las descartadas igual se devuelven (con serviciosFaltantes lleno) para
 * que Juan las pueda pintar en gris. Ver una sede a 4 minutos tachada por
 * "no tiene hemodinamia" es lo que hace entender el producto de un vistazo.
 */
export function rankear(
  caso: Caso,
  sedes: Sede[],
  etas: EtaSede[],
  opciones: { limite?: number; incluirDescartadas?: boolean } = {}
): Candidato[] {
  const { limite = 5, incluirDescartadas = true } = opciones;
  const fecha = new Date();
  const mapaEta = new Map(etas.map((e) => [e.codigo, e]));

  const evaluados: Candidato[] = [];

  for (const sede of sedes) {
    const eta = mapaEta.get(sede.codigo);
    if (!eta) continue;

    const faltantes = serviciosFaltantes(sede.servicios, caso.serviciosRequeridos);
    const complejidadOk = complejidadSuficiente(sede.complejidad, caso.complejidadRequerida);
    const movilOk = movilCompatible(caso.tipoMovil, caso.requiereMedicoABordo);

    // El primer motivo que aparezca es el que se muestra. Un solo motivo
    // claro se lee mejor que una lista de tres.
    let motivoDescarte: string | null = null;
    if (faltantes.length > 0) {
      motivoDescarte = `No tiene ${nombresServicios(faltantes)}`;
    } else if (!complejidadOk) {
      motivoDescarte = `Complejidad ${sede.complejidad}, el caso requiere ${caso.complejidadRequerida}`;
    } else if (!movilOk) {
      motivoDescarte = "El paciente requiere médico a bordo (móvil TAM)";
    }

    const desglose = calcularDesglose(sede, eta.etaMin, fecha);

    evaluados.push({
      sede,
      rank: 0, // se asigna abajo
      etaMin: eta.etaMin,
      distKm: eta.distKm,
      pAceptacion: pAceptacion(sede),
      congestion: indiceCongestion(sede, fecha),
      score: sumarDesglose(desglose),
      desglose,
      serviciosFaltantes: faltantes,
      motivoDescarte,
    });
  }

  const viables = evaluados
    .filter((c) => c.motivoDescarte === null)
    .sort((a, b) => a.score - b.score)
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
 * Texto de una linea que explica POR QUE gano el #1.
 * Sebas lo usa en el pitch, Juan lo pinta debajo de la tarjeta ganadora.
 */
export function explicarGanador(ganador: Candidato, segundo?: Candidato): string {
  if (!segundo) {
    return `${ganador.sede.nombre}: ${Math.round(ganador.etaMin)} min de ruta, ` +
      `${Math.round(ganador.pAceptacion * 100)}% de probabilidad de aceptación.`;
  }
  const dif = segundo.score - ganador.score;
  const masCerca = segundo.etaMin < ganador.etaMin;
  if (masCerca) {
    return (
      `${segundo.sede.nombre} está ${Math.round(segundo.etaMin - ganador.etaMin)} min más cerca, ` +
      `pero su riesgo de rechazo y congestión suman ${Math.round(
        segundo.desglose.riesgoRechazo + segundo.desglose.espera
      )} min. ${ganador.sede.nombre} gana por ${Math.round(dif)} min efectivos.`
    );
  }
  return `${ganador.sede.nombre} gana por ${Math.round(dif)} min efectivos sobre ${segundo.sede.nombre}.`;
}
