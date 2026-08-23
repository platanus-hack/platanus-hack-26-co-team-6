/**
 * El borrador de RDA: lo que PULSO entrega y lo que declara que le falta.
 *
 * ═══ LA REGLA QUE DECIDE ESTE ARCHIVO ═════════════════════════════
 * **Los huecos aparecen explícitos, no rellenados con datos falsos.**
 *
 * Un RDA de urgencias tiene 47 perfiles posibles y PULSO conoce seis. La
 * tentación obvia es completar el resto con placeholders para que "valide".
 * Eso produce un documento clínico con datos inventados, que es peor que no
 * producir nada: alguien lo firma sin leerlo y el dato falso entra a la
 * historia clínica nacional.
 *
 * Así que este módulo hace lo contrario: cada elemento que el perfil exige y
 * PULSO no tiene sale como un `HuecoRda` con nombre, motivo y dueño. El
 * borrador dice de qué tamaño es lo que falta antes de que un humano lo firme.
 *
 * Corolario que se cumple en `constructor-rda.ts`: si un recurso no existe, la
 * referencia hacia él tampoco se emite. Toda referencia del Bundle resuelve.
 */

import type { Bundle } from './tipos-fhir';

// ─────────────────────────────────────────────────────────────────
// Huecos
// ─────────────────────────────────────────────────────────────────

/**
 *  bloqueante    el perfil lo exige y PULSO no tiene el dato. Nadie puede
 *                firmar esto sin completarlo a mano.
 *  divergente    PULSO SÍ tiene el dato, pero no en la forma que el perfil
 *                fija. Se emite lo que es cierto y se declara la diferencia.
 *  por-verificar no pudimos leer ese punto de la guía. No es que falte el
 *                dato: es que no sabemos qué exige. Lo resuelve la tarea 4.9.
 */
export type SeveridadHueco = 'bloqueante' | 'divergente' | 'por-verificar';

export interface HuecoRda {
  /** Estable entre corridas: sirve de clave para deduplicar y para la UI. */
  id: string;
  /** URL canónica del perfil afectado. */
  perfil: string;
  /** Ruta FHIRPath del elemento, ej. `Composition.subject`. */
  elemento: string;
  severidad: SeveridadHueco;
  /** Qué falta, en una línea. */
  queFalta: string;
  /** POR QUÉ falta. Sin esto el hueco parece un bug y alguien lo "arregla". */
  porQue: string;
  /** Quién lo aporta: una tarea del backlog, o la IPS receptora. */
  quienLoAporta: string;
  /**
   * Lo que PULSO SÍ sabe de ese hueco, para que quien complete el borrador no
   * tenga que buscarlo. Nunca lleva PII: ni el dictado literal, ni el punto de
   * recogida, ni teléfonos.
   */
  contexto?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────
// Eventos de traslado
// ─────────────────────────────────────────────────────────────────

/**
 * Lo que el constructor necesita de un `evento_caso`, y nada más.
 *
 * Los nombres de campo son los de `eventos/evento.tipos.ts::EventoCaso`
 * (tarea 3.1), así que un `EventoCaso[]` entra aquí sin conversión. **No se
 * importa aquel tipo a propósito**: el constructor es puro y no debe arrastrar
 * el módulo de eventos — el worker `rda-builder` del plan maestro §1.2 tiene
 * que poder llamarlo sin levantar Nest. Este es el único acoplamiento, y es
 * estructural.
 */
export interface EventoTrasladoRda {
  /** Uno de `TIPOS_EVENTO`. Ver `EVENTOS_DE_CIERRE`. */
  tipo: string;
  /** ISO 8601. */
  ocurridoEn: string;
  /** Sede a la que se refiere el evento, si aplica. */
  codigoSede?: string | null;
}

/**
 * Eventos que cierran el encuentro prehospitalario.
 *
 * Transcritos de `TIPOS_EVENTO` en `eventos/evento.tipos.ts`. Si 3.1 cambia el
 * vocabulario, esta lista es el ÚNICO sitio de este módulo que hay que tocar.
 * Si no llega ninguno de los tres, el encuentro queda `in-progress` y sale un
 * hueco diciéndolo — que es la respuesta honesta, no un fallo.
 */
export const EVENTOS_DE_CIERRE: readonly string[] = [
  'llegada_puerta',
  'entrega',
  'cerrado',
];

// ─────────────────────────────────────────────────────────────────
// El borrador
// ─────────────────────────────────────────────────────────────────

/**
 * `pendiente` es el ÚNICO estado que este módulo produce.
 *
 * `firmado` existe en el tipo porque es el destino, y lo escribe la tarea 4.10
 * cuando un humano firma. Regla 6 del repo: PULSO propone, el humano decide.
 * **Ningún trámite se firma solo.**
 */
export type EstadoBorradorRda = 'pendiente' | 'firmado';

/** Cuánto del Bundle exigido está realmente poblado. No es conformidad. */
export interface CoberturaRda {
  /** Perfiles que `BundleEmergencyRDA` exige 1..1 (leído de la guía). */
  exigidos: string[];
  presentes: string[];
  ausentes: string[];
  /** 0..1. Es una barra de progreso del borrador, no un sello de validez. */
  proporcion: number;
}

export interface BorradorRda {
  casoId: string;
  /**
   * Siempre `pendiente` al salir de aquí. Ver `EstadoBorradorRda`.
   */
  estado: EstadoBorradorRda;
  generadoEn: string;
  /** Contra qué versión de la guía se construyó. */
  guia: { nombre: string; version: string; navegable: string };
  /**
   * Qué es esto y qué NO es. **Viaja en la respuesta de la API a propósito**:
   * el texto que sale por el cable es el mismo que se puede decir en el pitch.
   */
  aviso: string;
  bundle: Bundle;
  /** Ordenados: primero lo bloqueante. */
  huecos: HuecoRda[];
  cobertura: CoberturaRda;
  /** `null` hasta que la tarea 4.10 registre una firma humana. */
  firma: null;
}

/**
 * El aviso literal. Está en una constante para que nadie lo suavice sin
 * darse cuenta de que lo está suavizando.
 *
 * Está sin verificar (punto 3 del §0 del plan maestro) si un traslado
 * prehospitalario genera RDA propio o si solo lo genera la IPS receptora.
 * Mientras eso no se confirme, la frase es "PULSO pre-llena", nunca "PULSO
 * reporta al IHCE".
 */
export const AVISO_BORRADOR =
  'PULSO PRE-LLENA este RDA con lo que ocurrió en la escena. ' +
  'PULSO NO lo reporta al IHCE ni lo envía a ningún destino: queda en estado ' +
  '"pendiente" hasta que un humano de la IPS lo complete y lo firme. ' +
  'Los huecos declarados son lo que falta para poder firmarlo.';
