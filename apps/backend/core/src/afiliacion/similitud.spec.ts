/**
 * Tareas 2.1 y 2.9 — el cruce de nombres.
 *
 * Lo que se prueba es el comportamiento que decide una afiliacion: que dos
 * escrituras distintas de la misma entidad crucen, y que dos entidades
 * distintas NO crucen. Los numeros exactos del trigrama son implementacion.
 */

import {
  UMBRAL_SIMILITUD,
  masParecido,
  normalizar,
  similitud,
  trigramas,
} from './similitud';

describe('normalizar', () => {
  it('quita el BOM de utf-8-sig, que es lo que trae el CSV de ambulancias', () => {
    // Un solo caracter invisible al frente cambia los trigramas de la
    // primera palabra: ese prestador no cruzaria nunca, y como es UNO,
    // pasaria por "ese no estaba en la lista" en vez de por bug.
    expect(normalizar('﻿333 ASISTENCIAS MEDICAS')).toBe(
      normalizar('333 ASISTENCIAS MEDICAS'),
    );
  });

  it('iguala mayusculas con tildes y minusculas sin ellas', () => {
    expect(normalizar('CLINICA DEL COUNTRY')).toBe(
      normalizar('Clínica del Country'),
    );
  });

  it('trata la ñ como n: el mismo apellido escrito por dos funcionarios', () => {
    expect(normalizar('MUÑOZ')).toBe(normalizar('MUNOZ'));
  });

  it('convierte la puntuacion en separador', () => {
    expect(normalizar('SERVICIOS S.A.S.')).toBe('servicios s a s');
    expect(normalizar('  CLINICA   DEL   COUNTRY  ')).toBe(
      'clinica del country',
    );
  });
});

describe('trigramas', () => {
  it('acolcha cada palabra como pg_trgm: dos espacios delante, uno detras', () => {
    // pg_trgm: show_trgm('abc') = {"  a"," ab","abc","bc "}
    expect([...trigramas('abc')].sort()).toEqual(
      ['  a', ' ab', 'abc', 'bc '].sort(),
    );
  });

  it('no mezcla trigramas entre palabras', () => {
    // Si no acolchara, 'ab cd' produciria 'b c' y ' cd' pegados.
    expect(trigramas('ab cd').has('b c')).toBe(false);
  });
});

describe('similitud', () => {
  it('da 1 a la misma cadena escrita de dos formas', () => {
    expect(similitud('CLINICA DEL COUNTRY', 'Clínica del Country')).toBe(1);
  });

  it('pasa el umbral con una sigla de mas', () => {
    const puntaje = similitud(
      'CLINICA DEL COUNTRY S.A.',
      'Clínica del Country',
    );
    expect(puntaje).toBeGreaterThan(0.5);
    expect(puntaje).toBeLessThan(1);
  });

  it('devuelve 0 —y no 1— cuando falta uno de los dos nombres', () => {
    // Un 1 aqui aprobaria una afiliacion sin razon social.
    expect(similitud('', '')).toBe(0);
    expect(similitud('', 'Clínica La Inmaculada')).toBe(0);
  });

  describe('el umbral de 0.85 frente a nombres reales del catalogo', () => {
    // Estos casos NO son ilustrativos: son los que deciden si la afiliacion
    // se autoverifica o pasa por un humano. Si alguien mueve el umbral,
    // aqui se ve exactamente que empieza a pasar sin revisar.

    it('autoverifica el mismo nombre con otra caja y otras tildes', () => {
      expect(
        similitud('CLINICA LA INMACULADA', 'Clínica La Inmaculada'),
      ).toBeGreaterThanOrEqual(UMBRAL_SIMILITUD);
    });

    it('manda a revision cuando se agrega la forma juridica', () => {
      // 0.83: por debajo por poco. Es el caso mas comun del mundo real y
      // por eso la respuesta de /verificar trae el nombre del REPS para
      // que el afiliado lo confirme (§3.4 paso 2).
      expect(
        similitud('CLINICA DEL COUNTRY SAS', 'Clínica del Country'),
      ).toBeLessThan(UMBRAL_SIMILITUD);
    });

    it('manda a revision el nombre comercial corto contra el largo del REPS', () => {
      expect(
        similitud(
          'CAFAM FLORESTA',
          'Centro de Atención En Salud Cafam Floresta',
        ),
      ).toBeLessThan(UMBRAL_SIMILITUD);
    });

    it('deja bien lejos del umbral a dos hospitales que solo comparten plantilla', () => {
      // El error caro: aprobar sola una IPS contra el codigo REPS de otra.
      // Cualquier umbral que dejara pasar «Cafam Floresta» dejaria pasar
      // esto tambien, y por eso 0.85 se queda donde esta.
      expect(similitud('Hospital de Usme', 'Hospital de Suba')).toBeLessThan(
        0.6,
      );
    });
  });

  it('es simetrica', () => {
    const a = 'Centro de Atención En Salud Cafam Floresta';
    const b = 'CAFAM FLORESTA';
    expect(similitud(a, b)).toBeCloseTo(similitud(b, a), 10);
  });
});

describe('masParecido', () => {
  const catalogo = [
    { nombre: 'Hospital de Usme' },
    { nombre: 'Clínica del Country' },
    { nombre: 'Hospital de Suba' },
  ];

  it('devuelve el mejor con su puntaje', () => {
    const mejor = masParecido('CLINICA DEL COUNTRY', catalogo, (c) => c.nombre);
    expect(mejor?.candidato.nombre).toBe('Clínica del Country');
    expect(mejor?.puntaje).toBe(1);
  });

  it('devuelve undefined con la lista vacia', () => {
    expect(
      masParecido('lo que sea', [], (c: { nombre: string }) => c.nombre),
    ).toBeUndefined();
  });
});
