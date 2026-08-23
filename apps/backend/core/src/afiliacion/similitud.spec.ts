/**
 * La normalización es la trampa documentada de la tarea 2.9: el CSV de
 * transporte asistencial viene en `utf-8-sig` y con los nombres en MAYÚSCULAS
 * SIN TILDES, y el afiliado escribe con tildes, minúsculas y puntos. Sin
 * normalizar antes de comparar NO CRUZA NADA, y el módulo entero es inútil.
 *
 * Estos tests fijan ese comportamiento por fuera: qué pares se consideran la
 * misma empresa, no cómo se calculan los trigramas.
 */

import {
  UMBRAL_COINCIDENCIA,
  masParecido,
  normalizar,
  similitud,
} from './similitud';

describe('normalizar · la trampa del CSV', () => {
  it('la misma empresa escrita de cuatro formas colapsa en una sola', () => {
    const formas = [
      'CLINICA DEL COUNTRY S.A.S',
      'Clínica del Country S.A.S.',
      'clinica del country sas',
      '  Clínica  Del  Country   S A S  ',
    ];
    const canonicas = new Set(formas.map(normalizar));
    expect([...canonicas]).toEqual(['CLINICA DEL COUNTRY SAS']);
  });

  it('las siglas sueltas se pegan pero la conjunción "y" sobrevive', () => {
    // Si "Y" se pegara al vecino, "AMBULANCIAS Y SERVICIOS" dejaría de cruzar
    // consigo misma escrita sin la Y — y son 225 nombres llenos de "Y".
    expect(normalizar('AMBULANCIAS Y SERVICIOS MEDICOS S A')).toBe(
      'AMBULANCIAS Y SERVICIOS MEDICOS SA',
    );
    expect(normalizar('E.S.E. Hospital de Usme')).toBe('ESE HOSPITAL DE USME');
  });

  it('la ñ y los dígitos sobreviven', () => {
    expect(normalizar('Fundación Santa Fe de Bogotá')).toBe(
      'FUNDACION SANTA FE DE BOGOTA',
    );
    expect(normalizar('333 Asistencias Médicas')).toBe(
      '333 ASISTENCIAS MEDICAS',
    );
  });
});

describe('similitud · umbral de §3.3', () => {
  it('lo que normaliza igual vale exactamente 1', () => {
    expect(
      similitud('Clínica del Country S.A.S.', 'CLINICA DEL COUNTRY SAS'),
    ).toBe(1);
  });

  it('supera el umbral pese a tildes, mayúsculas y puntuación', () => {
    expect(
      similitud(
        'Ambulancias Aéreas de Colombia SAS',
        'AMBULANCIAS AEREAS DE COLOMBIA S.A.S.',
      ),
    ).toBeGreaterThan(UMBRAL_COINCIDENCIA);
  });

  it('dos empresas distintas no llegan al umbral', () => {
    expect(
      similitud('Fundación Santa Fe de Bogotá', 'Fundación Abood Shaio'),
    ).toBeLessThan(UMBRAL_COINCIDENCIA);
  });

  it('cadena vacía da 0, no 1', () => {
    // "No hay con qué comparar" jamás puede presentarse como coincidencia
    // perfecta: sería el peor falso positivo de un flujo que decide quién
    // entra al sistema.
    expect(similitud('', 'CUALQUIER COSA')).toBe(0);
    expect(similitud('   ...   ', 'CUALQUIER COSA')).toBe(0);
  });
});

describe('masParecido', () => {
  const candidatos = [
    { nombre: 'AMBULANCIAS PRIMEROS AUXILIOS LTDA' },
    { nombre: 'AMBULANCIAS AEREAS DE COLOMBIA S.A.S.' },
    { nombre: 'AEROMAS SAS' },
  ];

  it('encuentra al de mayor puntaje', () => {
    const mejor = masParecido('Aeromas S.A.S.', candidatos, (c) => [c.nombre]);
    expect(mejor?.candidato.nombre).toBe('AEROMAS SAS');
    expect(mejor?.puntaje).toBe(1);
  });

  it('con lista vacía devuelve null en vez de inventar un match', () => {
    expect(
      masParecido('lo que sea', [], (c: { nombre: string }) => [c.nombre]),
    ).toBeNull();
  });
});
