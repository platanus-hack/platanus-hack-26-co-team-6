/**
 * Tarea 2.1, paso 3 — la maquina de estados de la afiliacion.
 *
 * El criterio de la tarea dice «test de todas las transiciones ilegales», y
 * eso se toma literal: se enumeran los 8 × 8 pares y se comprueba uno por
 * uno. Escribir a mano las 44 ilegales seria la forma mas segura de olvidar
 * justo la que importa el dia que alguien agregue un estado.
 */

import type { EstadoAfiliacion } from '../contracts/types';
import { PulsoError } from '../common/pulso-error.filter';
import {
  EXIGEN_MOTIVO,
  TRANSICIONES,
  esDespachable,
  esEditable,
  exigeMotivo,
  exigirTransicion,
  puedeTransicionar,
} from './estados';

const ESTADOS = Object.keys(TRANSICIONES) as EstadoAfiliacion[];

/** Las que §3.2 dibuja. Escritas aparte para que el test no copie la tabla. */
const LEGALES: ReadonlyArray<[EstadoAfiliacion, EstadoAfiliacion]> = [
  ['borrador', 'enviada'],
  ['enviada', 'en_verificacion'],
  ['enviada', 'observada'],
  ['en_verificacion', 'aprobada'],
  ['en_verificacion', 'observada'],
  ['observada', 'borrador'],
  ['observada', 'enviada'],
  ['aprobada', 'activa'],
  ['aprobada', 'observada'],
  ['activa', 'suspendida'],
  ['suspendida', 'activa'],
  // «* → retirada»: la organizacion se va cuando quiere.
  ...ESTADOS.filter((e) => e !== 'retirada').map(
    (e) => [e, 'retirada'] as [EstadoAfiliacion, EstadoAfiliacion],
  ),
];

const esLegal = (desde: EstadoAfiliacion, hacia: EstadoAfiliacion): boolean =>
  LEGALES.some(([a, b]) => a === desde && b === hacia);

describe('la maquina de estados de la afiliacion', () => {
  it('cubre los 8 estados del contrato', () => {
    // Si alguien agrega un estado a `EstadoAfiliacion` sin decidir sus
    // salidas, `TRANSICIONES` deja de compilar. Esto ademas lo cuenta.
    expect(ESTADOS).toHaveLength(8);
  });

  describe('las legales pasan', () => {
    it.each(LEGALES)('%s → %s', (desde, hacia) => {
      expect(puedeTransicionar(desde, hacia)).toBe(true);
      expect(() => exigirTransicion(desde, hacia)).not.toThrow();
    });
  });

  describe('las ilegales revientan con PULSO_ILLEGAL_TRANSITION', () => {
    const ilegales = ESTADOS.flatMap((desde) =>
      ESTADOS.filter((hacia) => hacia !== desde && !esLegal(desde, hacia)).map(
        (hacia) => [desde, hacia] as const,
      ),
    );

    it('hay 38 pares ilegales entre los 56 posibles', () => {
      // 8 × 8 = 64, menos las 8 identidades = 56 pares dirigidos.
      // Legales: 11 del diagrama + 7 de «* → retirada» = 18. Quedan 38.
      //
      // El numero esta clavado a proposito: si alguien agrega una salida a
      // TRANSICIONES sin agregarla a LEGALES, este test se cae antes de que
      // el `it.each` de abajo la de por buena en silencio.
      expect(LEGALES).toHaveLength(18);
      expect(ilegales).toHaveLength(38);
    });

    it.each(ilegales)('%s ✗ %s', (desde, hacia) => {
      expect(puedeTransicionar(desde, hacia)).toBe(false);
      expect(() => exigirTransicion(desde, hacia)).toThrow(PulsoError);
      try {
        exigirTransicion(desde, hacia);
      } catch (e) {
        expect((e as PulsoError).code).toBe('PULSO_ILLEGAL_TRANSITION');
      }
    });
  });

  it('pedir el estado que ya tiene es idempotente, no un error', () => {
    // Un reintento de red no puede parecer una transicion ilegal: quien
    // llama volveria a intentar creyendo que hizo algo mal.
    for (const estado of ESTADOS) {
      expect(() => exigirTransicion(estado, estado)).not.toThrow();
    }
  });

  it('el mensaje dice a donde SI se puede ir', () => {
    // «Transicion ilegal» a secas obliga a leer el codigo para saber que
    // intentar. El criterio de la tarea 0.7 aplica igual aqui.
    try {
      exigirTransicion('borrador', 'activa');
      fail('deberia haber reventado');
    } catch (e) {
      const error = e as PulsoError;
      expect(error.message).toContain('enviada');
      expect(error.message).toContain('retirada');
      expect(error.details).toMatchObject({
        desde: 'borrador',
        hacia: 'activa',
      });
    }
  });

  it('retirada es final y lo dice con otras palabras', () => {
    expect(TRANSICIONES.retirada).toEqual([]);
    try {
      exigirTransicion('retirada', 'activa');
      fail('deberia haber reventado');
    } catch (e) {
      expect((e as PulsoError).message).toContain('estado final');
    }
  });

  it('activa y suspendida van y vuelven', () => {
    // Una habilitacion vencida se suspende y se levanta. No se re-aprueba:
    // eso obligaria a pasar de nuevo por verificacion sin que nada cambie.
    expect(puedeTransicionar('activa', 'suspendida')).toBe(true);
    expect(puedeTransicionar('suspendida', 'activa')).toBe(true);
    expect(puedeTransicionar('suspendida', 'aprobada')).toBe(false);
  });

  it('de observada NO hay atajo a aprobada', () => {
    // Si lo hubiera, «observada» no significaria nada: se podria aprobar
    // sin que el afiliado corrigiera lo que se le observo.
    expect(puedeTransicionar('observada', 'aprobada')).toBe(false);
    expect(puedeTransicionar('observada', 'activa')).toBe(false);
  });
});

describe('esDespachable', () => {
  it('solo activa', () => {
    // La regla que sostiene el paso 4 de la tarea. Si algun dia otro estado
    // devuelve true, este test es el que lo cuenta.
    for (const estado of ESTADOS) {
      expect(esDespachable(estado)).toBe(estado === 'activa');
    }
  });
});

describe('esEditable', () => {
  it('solo borrador y observada', () => {
    for (const estado of ESTADOS) {
      expect(esEditable(estado)).toBe(
        estado === 'borrador' || estado === 'observada',
      );
    }
  });
});

describe('exigeMotivo', () => {
  it('observar y suspender exigen decir por que', () => {
    // Observar sin motivo es el «solicitud rechazada» que §3.2 prohibe.
    // Suspender sin motivo saca una sede del ranking sin dejar rastro.
    expect(EXIGEN_MOTIVO).toEqual(['observada', 'suspendida']);
    for (const estado of ESTADOS) {
      expect(exigeMotivo(estado)).toBe(
        estado === 'observada' || estado === 'suspendida',
      );
    }
  });
});
