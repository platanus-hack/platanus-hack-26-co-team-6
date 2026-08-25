/**
 * Tarea 2.9 — autoverificacion de operadores de ambulancia.
 *
 * Los tres criterios de la tarea, y uno mas que salio al escribirla:
 *   · un prestador real del CSV se autoverifica
 *   · la marca TAB/TAM llega precargada
 *   · sin cruce, el mensaje dice que falta
 *   · el CSV no trae NIT — el paso «cruce por NIT» de la tarea no corre
 */

import {
  AMBULANCIAS_CATALOGO,
  type PrestadorAmbulancia,
} from './ambulancias.generado';
import {
  buscarOperador,
  cruceSuficiente,
  precargaDe,
  tiposMovilDe,
} from './ambulancias';

describe('el catalogo generado', () => {
  it('trae los 225 prestadores del corte oficial', () => {
    expect(AMBULANCIAS_CATALOGO).toHaveLength(225);
  });

  it('mantiene el reparto TAB/TAM que declara la fuente', () => {
    // 112 basicos y 53 medicalizados, corte 01/07/2026. Si el pipeline se
    // corre contra otro CSV y estos numeros cambian, hay que enterarse:
    // `movil.tipo` es un filtro DURO del ruteo.
    expect(AMBULANCIAS_CATALOGO.filter((p) => p.basico)).toHaveLength(112);
    expect(AMBULANCIAS_CATALOGO.filter((p) => p.medicalizado)).toHaveLength(53);
  });

  it('NO trae NIT en ninguna fila', () => {
    // Este test existe para que el dia que la fuente publique el NIT, se
    // caiga y alguien encienda el cruce por NIT de `buscarOperador`. Hasta
    // entonces documenta que el paso 2 de la tarea no puede correr.
    expect(AMBULANCIAS_CATALOGO.every((p) => p.nit === null)).toBe(true);
  });
});

describe('tiposMovilDe', () => {
  it('traduce las dos marcas del CSV a TAB y TAM', () => {
    expect(tiposMovilDe(fila({ basico: true, medicalizado: false }))).toEqual([
      'TAB',
    ]);
    expect(tiposMovilDe(fila({ basico: false, medicalizado: true }))).toEqual([
      'TAM',
    ]);
    expect(tiposMovilDe(fila({ basico: true, medicalizado: true }))).toEqual([
      'TAB',
      'TAM',
    ]);
  });

  it('devuelve vacio si el corte no le reconoce ninguna', () => {
    // No se inventa un TAB por defecto. Un tipo inventado aqui termina
    // mandando un basico a un paciente que necesita ventilacion.
    expect(tiposMovilDe(fila({ basico: false, medicalizado: false }))).toEqual(
      [],
    );
  });
});

describe('buscarOperador', () => {
  /** Un prestador real del catalogo, no uno inventado. */
  const real = AMBULANCIAS_CATALOGO.find((p) => p.medicalizado)!;

  it('un prestador real del CSV se autoverifica', () => {
    const cruce = buscarOperador(real.prestador);
    expect(cruce?.prestador.prestador).toBe(real.prestador);
    expect(cruce?.como).toBe('nombre');
    expect(cruceSuficiente(cruce!)).toBe(true);
  });

  it('cruza aunque el afiliado escriba con tildes y en minusculas', () => {
    // El CSV viene en MAYUSCULAS SIN TILDES y con utf-8-sig. Quien afilia
    // escribe como escribe la gente.
    const cruce = buscarOperador(real.prestador.toLowerCase());
    expect(cruce?.prestador.prestador).toBe(real.prestador);
    expect(cruceSuficiente(cruce!)).toBe(true);
  });

  it('la marca TAB/TAM llega precargada desde el corte oficial', () => {
    const cruce = buscarOperador(real.prestador)!;
    const precarga = precargaDe(cruce.prestador);
    expect(precarga.tiposMovil).toContain('TAM');
    expect(precarga.tiposMovil).toEqual(tiposMovilDe(real));
    // Y el resto de lo que el operador no tiene que tipear.
    expect(precarga.direccion).toBe(real.direccion);
    expect(precarga.telefono).toBe(real.telefono);
    expect(precarga.correo).toBe(real.correo);
  });

  it('sin cruce suficiente devuelve igual el mejor, con su puntaje', () => {
    // Devolver `undefined` obligaria a responder «no encontrado» a secas.
    // Con el mejor candidato y su puntaje se puede decir QUE falta.
    const cruce = buscarOperador('TRANSPORTES EL DORADO DE LA SABANA LTDA');
    expect(cruce).toBeDefined();
    expect(cruceSuficiente(cruce!)).toBe(false);
    expect(cruce!.puntaje).toBeLessThan(0.85);
  });

  it('no cruza nada con una razon social vacia', () => {
    expect(buscarOperador('')).toBeUndefined();
    expect(buscarOperador('   ')).toBeUndefined();
  });

  it('el camino por NIT existe y funciona, aunque hoy no lo alimente nadie', () => {
    // Escrito para el dia que la fuente publique el NIT. Se prueba contra un
    // catalogo de mentira porque el real no tiene con que probarlo.
    const conNit = [fila({ prestador: 'AMBULANCIAS X', nit: '900123456-1' })];
    const cruce = buscarOperador(
      'nombre que no se parece',
      '900.123.456',
      conNit,
    );
    expect(cruce?.como).toBe('nit');
    expect(cruce?.puntaje).toBe(1);
    expect(cruceSuficiente(cruce!)).toBe(true);
  });
});

const fila = (parcial: Partial<PrestadorAmbulancia>): PrestadorAmbulancia => ({
  prestador: 'AMBULANCIAS DE PRUEBA SAS',
  sede: 'AMBULANCIAS DE PRUEBA SAS',
  direccion: 'CALLE 1 2 3',
  telefono: '3000000000',
  correo: 'prueba@example.com',
  nit: null,
  basico: true,
  medicalizado: false,
  urgencias: false,
  ...parcial,
});
