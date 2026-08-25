/**
 * Tarea 2.1 — el NIT y su digito de verificacion.
 *
 * Este archivo nacio de un test que fallo. El cruce por NIT comparaba «todos
 * los digitos», y `900.123.456` contra `900123456-1` daba distinto: son el
 * mismo NIT, uno con digito de verificacion y otro sin el.
 *
 * Donde dolia de verdad no era en el cruce sino en la unicidad: la afiliacion
 * es unica por `(tipo, nit)`, asi que la misma clinica escribiendo el DV una
 * vez y no la otra se afiliaba DOS veces — dos organizaciones, dos admins,
 * dos estados, y suspender una no apagaba a la otra.
 */

import { nitsEquivalentes, normalizarNit } from './nit';

describe('normalizarNit', () => {
  it('deja las cuatro escrituras del mismo NIT en la misma base', () => {
    const base = '900123456';
    expect(normalizarNit('900123456')).toBe(base);
    expect(normalizarNit('900.123.456')).toBe(base);
    expect(normalizarNit('900123456-1')).toBe(base);
    expect(normalizarNit('900.123.456-1')).toBe(base);
    expect(normalizarNit('  900.123.456 - 1 ')).toBe(base);
  });

  it('lee 10 digitos sin guion como 9 + digito de verificacion', () => {
    // Es como lo muestra el RUES: pegado, sin separador.
    expect(normalizarNit('9001234561')).toBe('900123456');
  });

  it('no adivina con largos que no son de persona juridica', () => {
    // Una cedula de 8 digitos no lleva DV. Recortarla inventaria un NIT.
    expect(normalizarNit('79123456')).toBe('79123456');
    expect(normalizarNit('12345')).toBe('12345');
  });

  it('devuelve vacio cuando no hay nada que normalizar', () => {
    expect(normalizarNit(undefined)).toBe('');
    expect(normalizarNit('')).toBe('');
    expect(normalizarNit('   ')).toBe('');
    expect(normalizarNit('sin digitos')).toBe('');
  });
});

describe('nitsEquivalentes', () => {
  it('reconoce el mismo NIT escrito de dos formas', () => {
    expect(nitsEquivalentes('900.123.456-1', '900123456')).toBe(true);
    expect(nitsEquivalentes('9001234561', '900.123.456')).toBe(true);
  });

  it('distingue dos NIT distintos', () => {
    expect(nitsEquivalentes('900123456-1', '900123457-9')).toBe(false);
  });

  it('dos vacios NO son equivalentes', () => {
    // Si lo fueran, dos afiliaciones sin NIT chocarian entre si y la
    // segunda recibiria «ya existe una organizacion con ese NIT».
    expect(nitsEquivalentes('', '')).toBe(false);
    expect(nitsEquivalentes('', '900123456')).toBe(false);
  });
});
