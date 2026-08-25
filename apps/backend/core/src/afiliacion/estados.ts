/**
 * Maquina de estados de la afiliacion — tarea 2.1, paso 3.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  POR QUE UNA TABLA Y NO UNOS `if`
 * ═══════════════════════════════════════════════════════════════════
 *  Porque la pregunta que hay que poder contestar es «¿desde donde se llega
 *  a `activa`?», y con `if` dispersos por el servicio eso se contesta
 *  leyendo el servicio entero. Aqui se contesta mirando una tabla.
 *
 *  Lo que la tabla dice y un enum no diria:
 *    · `retirada` no vuelve. Es la unica sin salidas, y es a proposito:
 *      una organizacion que se fue y «vuelve» tiene que afiliarse de nuevo,
 *      con su propio rastro de auditoria.
 *    · `activa` ↔ `suspendida` va en los dos sentidos. Una habilitacion
 *      vencida se suspende y se levanta; no se re-aprueba.
 *    · De `observada` se vuelve a `borrador` para corregir, no se salta a
 *      `aprobada`. Si se pudiera saltar, «observada» no significaria nada.
 *
 * ⚠️ NINGUNA transicion ocurre sola. Quien la pide queda en el evento — es
 *    la regla 6 del repo: PULSO propone, el humano decide.
 */

import type { EstadoAfiliacion } from '../contracts/types';
import { PulsoError } from '../common/pulso-error.filter';

/**
 * A donde se puede ir desde cada estado (§3.2).
 *
 * `Record` completo y no parcial: agregar un estado al contrato sin decidir
 * sus salidas deja de compilar aqui, que es donde tiene que doler.
 */
export const TRANSICIONES: Record<
  EstadoAfiliacion,
  readonly EstadoAfiliacion[]
> = {
  borrador: ['enviada', 'retirada'],
  enviada: ['en_verificacion', 'observada', 'retirada'],
  // La verificacion automatica (§3.3) puede saltar directo a `aprobada`;
  // la manual pasa por aqui.
  en_verificacion: ['aprobada', 'observada', 'retirada'],
  // Se corrige y se vuelve a enviar. No hay atajo a `aprobada`.
  observada: ['borrador', 'enviada', 'retirada'],
  aprobada: ['activa', 'observada', 'retirada'],
  activa: ['suspendida', 'retirada'],
  suspendida: ['activa', 'retirada'],
  // Fin. Los datos historicos quedan; el contacto se anonimiza.
  retirada: [],
};

/**
 * El unico estado despachable (§3.2).
 *
 * Es una funcion y no una comparacion suelta porque la responde el ranking,
 * el handshake y el panel, y los tres tienen que responderla igual.
 */
export const esDespachable = (estado: EstadoAfiliacion): boolean =>
  estado === 'activa';

/** Estados en los que la organizacion todavia puede editar sus datos. */
export const esEditable = (estado: EstadoAfiliacion): boolean =>
  estado === 'borrador' || estado === 'observada';

export const puedeTransicionar = (
  desde: EstadoAfiliacion,
  hacia: EstadoAfiliacion,
): boolean => TRANSICIONES[desde].includes(hacia);

/**
 * Valida la transicion o revienta con `PULSO_ILLEGAL_TRANSITION`.
 *
 * El mensaje dice a donde SI se puede ir. Un «transicion ilegal» a secas
 * obliga a quien integra a leer este archivo para saber que intentar.
 */
export function exigirTransicion(
  desde: EstadoAfiliacion,
  hacia: EstadoAfiliacion,
): void {
  if (desde === hacia) {
    // No es un error: pedir el estado que ya tiene es idempotente. Quien
    // llama decide si hace algo; aqui no se rechaza un reintento de red.
    return;
  }
  if (puedeTransicionar(desde, hacia)) return;

  const salidas = TRANSICIONES[desde];
  throw new PulsoError(
    'PULSO_ILLEGAL_TRANSITION',
    salidas.length
      ? `No se puede pasar de '${desde}' a '${hacia}'. Desde '${desde}' solo se puede ir a: ${salidas.join(', ')}.`
      : `'${desde}' es un estado final: no admite ninguna transicion.`,
    { desde, hacia, permitidas: salidas },
  );
}

/**
 * Los estados que exigen decir POR QUE.
 *
 * Observar sin motivo es el «solicitud rechazada» que §3.2 prohibe: el
 * afiliado tiene que saber QUE le falta. Suspender sin motivo es peor —
 * saca una sede del ranking sin dejar rastro de quien lo decidio ni por que.
 */
export const EXIGEN_MOTIVO: readonly EstadoAfiliacion[] = [
  'observada',
  'suspendida',
];

export const exigeMotivo = (estado: EstadoAfiliacion): boolean =>
  EXIGEN_MOTIVO.includes(estado);
