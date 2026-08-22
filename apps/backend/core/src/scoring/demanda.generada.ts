/**
 * ARCHIVO GENERADO — no editar a mano.
 *
 * Lo produce `python scripts/datos/construir.py` a partir de data/.
 * Cualquier cambio aqui se pierde en la siguiente corrida. Si necesitas
 * cambiar el contenido, cambia la fuente o su transformador.
 *
 * Generado: 2026-08-22
 * Fuente:   llamadas123.csv — 9206 incidentes, 2026-06-01 a 2026-07-01
 */

/**
 * Curva de demanda MEDIDA, no supuesta.
 *
 * 9206 incidentes reales del 123 entre 2026-06-01 y 2026-07-01.
 * Normalizada 0..1 sobre la hora pico (9:00). Valle a las 5:00.
 */
export const CURVA_HORA: Record<number, number> = {
  "0": 0.4729,
  "1": 0.3514,
  "2": 0.2533,
  "3": 0.2738,
  "4": 0.2621,
  "5": 0.2123,
  "6": 0.388,
  "7": 0.6779,
  "8": 0.6999,
  "9": 1.0,
  "10": 0.9151,
  "11": 0.8463,
  "12": 0.5813,
  "13": 0.716,
  "14": 0.7262,
  "15": 0.8565,
  "16": 0.5505,
  "17": 0.6486,
  "18": 0.6223,
  "19": 0.7335,
  "20": 0.6486,
  "21": 0.6223,
  "22": 0.5798,
  "23": 0.5227
};

/**
 * Factor por dia de semana, RELATIVO AL PROMEDIO (no al pico).
 *
 * Orbita 1.0: un dia flojo baja de 1, uno cargado sube. Se multiplica por la
 * curva horaria. Si aqui hubiera valores 0..1 normalizados al pico, multiplicar
 * encogeria la curva entera — que es un error facil de cometer y dificil de ver.
 */
export const CURVA_DIA: Record<string, number> = {
  "lunes": 1.1086,
  "martes": 1.1216,
  "miercoles": 0.9718,
  "jueves": 0.9725,
  "viernes": 0.993,
  "sabado": 0.9223,
  "domingo": 0.9102
};

/** Domingo=0, para calzar con Date.getDay(). */
export const CURVA_DIA_POR_INDICE: Record<number, number> = {
  0: CURVA_DIA['domingo'],
  1: CURVA_DIA['lunes'],
  2: CURVA_DIA['martes'],
  3: CURVA_DIA['miercoles'],
  4: CURVA_DIA['jueves'],
  5: CURVA_DIA['viernes'],
  6: CURVA_DIA['sabado'],
};

export const DEMANDA_META = {
  incidentes: 9206,
  desde: '2026-06-01',
  hasta: '2026-07-01',
  horaPico: 9,
  horaValle: 5,
} as const;
