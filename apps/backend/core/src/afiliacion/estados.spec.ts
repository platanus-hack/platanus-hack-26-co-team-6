/**
 * La máquina de estados de la afiliación.
 *
 * El test recorre las 8 × 8 = 64 combinaciones y exige que TODA la que no
 * está en la tabla reviente con `PULSO_ILLEGAL_TRANSITION`. Es la forma de
 * probar "todas las transiciones ilegales" sin escribirlas a mano: si mañana
 * alguien agrega un estado, este spec lo cubre solo.
 */

import { PulsoError } from '../common/pulso-error.filter';
import {
  ESTADOS_AFILIACION,
  TRANSICIONES,
  esDespachable,
  exigirTransicion,
  puedeTransicionar,
  transicionesValidas,
} from './estados';
import type { EstadoAfiliacion } from './tipos';

describe('máquina de estados · el camino feliz de §3.2', () => {
  const CAMINO: [EstadoAfiliacion, EstadoAfiliacion][] = [
    ['borrador', 'enviada'],
    ['enviada', 'en_verificacion'],
    ['en_verificacion', 'aprobada'],
    ['aprobada', 'activa'],
    ['activa', 'suspendida'],
    ['suspendida', 'activa'],
  ];

  it.each(CAMINO)('%s → %s es legal', (desde, hacia) => {
    expect(() => exigirTransicion(desde, hacia)).not.toThrow();
  });

  it('observar y corregir cierran el ciclo sin rechazar a nadie', () => {
    expect(puedeTransicionar('en_verificacion', 'observada')).toBe(true);
    expect(puedeTransicionar('observada', 'borrador')).toBe(true);
  });

  it('cualquier estado puede retirarse, menos el que ya se retiró', () => {
    for (const estado of ESTADOS_AFILIACION) {
      expect(puedeTransicionar(estado, 'retirada')).toBe(estado !== 'retirada');
    }
  });

  it('retirada es terminal: no sale a ningún lado', () => {
    expect(transicionesValidas('retirada')).toHaveLength(0);
  });
});

describe('máquina de estados · TODAS las transiciones ilegales', () => {
  const ilegales: [EstadoAfiliacion, EstadoAfiliacion][] = [];
  for (const desde of ESTADOS_AFILIACION) {
    for (const hacia of ESTADOS_AFILIACION) {
      if (!TRANSICIONES[desde].includes(hacia)) ilegales.push([desde, hacia]);
    }
  }

  it('son 64 combinaciones y la mayoría están prohibidas', () => {
    const total = ESTADOS_AFILIACION.length ** 2;
    expect(total).toBe(64);
    expect(ilegales.length).toBe(total - contarLegales());
    expect(ilegales.length).toBeGreaterThan(40);
  });

  it.each(ilegales)(
    '%s → %s lanza PULSO_ILLEGAL_TRANSITION',
    (desde, hacia) => {
      let capturado: unknown;
      try {
        exigirTransicion(desde, hacia);
      } catch (error) {
        capturado = error;
      }

      expect(capturado).toBeInstanceOf(PulsoError);
      expect((capturado as PulsoError).code).toBe('PULSO_ILLEGAL_TRANSITION');
      // El error dice a dónde SÍ se podía ir: uno que solo dice "no" obliga al
      // cliente a adivinar.
      expect((capturado as PulsoError).details).toEqual({
        desde,
        hacia,
        permitidas: TRANSICIONES[desde],
      });
    },
  );

  it('los saltos que más duelen están entre los prohibidos', () => {
    // Que una organización recién creada, u observada, o suspendida, llegue a
    // `activa` de un salto es exactamente el permiso para recibir un paciente
    // crítico sin que nadie lo haya mirado.
    for (const desde of [
      'borrador',
      'enviada',
      'en_verificacion',
      'observada',
    ] as const) {
      expect(puedeTransicionar(desde, 'activa')).toBe(false);
    }
    expect(puedeTransicionar('retirada', 'activa')).toBe(false);
    expect(puedeTransicionar('activa', 'aprobada')).toBe(false);
    expect(puedeTransicionar('borrador', 'aprobada')).toBe(false);
  });
});

describe('esDespachable · solo activa', () => {
  it.each(ESTADOS_AFILIACION)('%s', (estado) => {
    expect(esDespachable({ estado })).toBe(estado === 'activa');
  });
});

function contarLegales(): number {
  return ESTADOS_AFILIACION.reduce(
    (total, estado) => total + TRANSICIONES[estado].length,
    0,
  );
}
