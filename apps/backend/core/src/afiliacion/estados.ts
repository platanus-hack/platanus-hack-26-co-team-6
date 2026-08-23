/**
 * La máquina de estados de la afiliación (§3.2 del plan de plataforma).
 *
 *   borrador ──enviar──→ enviada ──→ en_verificacion ──┬──→ aprobada ──activar──→ activa
 *      ↑                                               │                           │ │
 *      └──────── corregir ──── observada ←──observar───┘             suspender ─────┘ │
 *                                                                                     │
 *                                             retirada ←──── retirar (desde cualquiera)
 *
 * ── POR QUÉ LAS TRANSICIONES SON UNA TABLA Y NO UN `switch` ───────
 * Porque la tabla se puede recorrer entera en un test: el spec prueba las
 * 8 × 8 = 64 combinaciones y exige que las que no están aquí revienten. Un
 * `switch` solo prueba los caminos que a alguien se le ocurrieron.
 *
 * ── LO QUE ESTA MÁQUINA PROTEGE ───────────────────────────────────
 * `activa` es el único estado despachable: es el permiso para que una sede
 * reciba un paciente crítico. Que se llegue ahí solo por
 * `aprobada → activa` — y nunca desde `borrador`, `observada` o `suspendida`
 * de un salto — es la única barrera entre "alguien llenó un formulario" y
 * "el motor le manda una ambulancia".
 */

import { PulsoError } from '../common/pulso-error.filter';
import type { EstadoAfiliacion } from './tipos';

export const ESTADOS_AFILIACION: readonly EstadoAfiliacion[] = [
  'borrador',
  'enviada',
  'en_verificacion',
  'observada',
  'aprobada',
  'activa',
  'suspendida',
  'retirada',
];

/**
 * De dónde a dónde se puede ir. Lo que no está listado, no se puede.
 *
 * `retirada` no lleva a ningún lado, ni siquiera a sí misma: es terminal por
 * la regla de auditoría append-only. Una organización que se fue y vuelve es
 * una afiliación NUEVA, con su propio expediente; reabrir la vieja borraría
 * la frontera entre lo que decidió una organización y lo que decidió la otra.
 */
export const TRANSICIONES: Readonly<
  Record<EstadoAfiliacion, readonly EstadoAfiliacion[]>
> = {
  borrador: ['enviada', 'retirada'],
  enviada: ['en_verificacion', 'retirada'],
  // La verificación (automática o humana) desemboca en una de dos.
  en_verificacion: ['aprobada', 'observada', 'retirada'],
  // "Observada" no es rechazo: se le dijo qué falta y vuelve a editar.
  observada: ['borrador', 'retirada'],
  // Aprobada NO es activa. Activar es un acto humano — regla 6 de AGENTS.md.
  aprobada: ['activa', 'retirada'],
  activa: ['suspendida', 'retirada'],
  // Suspendida vuelve a activa sin repetir la verificación: la habilitación
  // no se perdió, se puso en pausa.
  suspendida: ['activa', 'retirada'],
  retirada: [],
};

export function transicionesValidas(
  desde: EstadoAfiliacion,
): readonly EstadoAfiliacion[] {
  return TRANSICIONES[desde] ?? [];
}

export function puedeTransicionar(
  desde: EstadoAfiliacion,
  hacia: EstadoAfiliacion,
): boolean {
  return transicionesValidas(desde).includes(hacia);
}

/**
 * Lanza `PULSO_ILLEGAL_TRANSITION` si el salto no está en la tabla.
 *
 * El código ya existe en `contracts/types.ts` y `PulsoErrorFilter` lo saca
 * como 400 con el sobre estándar. `details` lleva a dónde SÍ se podía ir:
 * un error que solo dice "no" obliga al cliente a adivinar.
 */
export function exigirTransicion(
  desde: EstadoAfiliacion,
  hacia: EstadoAfiliacion,
): void {
  if (puedeTransicionar(desde, hacia)) return;

  const permitidas = transicionesValidas(desde);
  throw new PulsoError(
    'PULSO_ILLEGAL_TRANSITION',
    permitidas.length === 0
      ? `"${desde}" es un estado final: no se puede pasar a "${hacia}".`
      : `No se puede pasar de "${desde}" a "${hacia}". Desde "${desde}" solo se ` +
          `puede ir a: ${permitidas.join(', ')}.`,
    { desde, hacia, permitidas },
    false,
  );
}

/**
 * El predicado que el ranking usará para filtrar destinos.
 *
 * **Solo `activa` es despachable.** Ni `aprobada` (le falta el acto humano de
 * activarse), ni `suspendida` (le vencieron la habilitación), ni `borrador`.
 *
 * ⚠️ TODAVÍA NADIE LO LLAMA, Y ES A PROPÓSITO. Hoy el motor rankea las 84
 *    sedes del catálogo REPS y cero de ellas tienen organización afiliada:
 *    enchufar este filtro ahora vaciaría el ranking de la ciudad entera. Se
 *    enchufa cuando haya organizaciones activas de verdad, y entonces el
 *    conjunto vacío tiene que escalar al CRUE (regla 3), no responder mudo.
 */
export function esDespachable(organizacion: {
  estado: EstadoAfiliacion;
}): boolean {
  return organizacion.estado === 'activa';
}
