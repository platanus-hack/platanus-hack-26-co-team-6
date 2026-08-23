/**
 * La traza de posiciones.
 *
 * Antes de esto, `movil_posicion` existía en la migración `0006` con su
 * índice espacial y **nadie escribía en ella**. El almacén guardaba sólo la
 * última posición, así que el mapa sólo podía pintar un punto que salta — no
 * un recorrido.
 */

import { TrazaRepositorio, type PuntoTraza } from './traza.repositorio';

function punto(over: Partial<PuntoTraza> = {}): PuntoTraza {
  return {
    lat: 4.61,
    lng: -74.08,
    precisionM: 12,
    velocidadKmh: 40,
    disponible: true,
    reportadoEn: new Date().toISOString(),
    ...over,
  };
}

describe('TrazaRepositorio sin base', () => {
  let traza: TrazaRepositorio;

  beforeEach(() => {
    traza = new TrazaRepositorio(); // sin ConfigService → memoria
  });

  it('sin DATABASE_URL avisa que no es persistente', () => {
    // La consola lo pinta: un recorrido en memoria empieza en el último
    // reinicio y no se puede mostrar como si fuera el turno completo.
    expect(traza.persistente).toBe(false);
  });

  it('guarda y devuelve el recorrido en orden cronológico', async () => {
    // Una polilínea se dibuja en el orden en que se recorrió; devolverla al
    // revés pinta la ruta hacia atrás.
    await traza.anotar('AMB-014', null, punto({ lat: 4.60 }));
    await traza.anotar('AMB-014', null, punto({ lat: 4.61 }));
    await traza.anotar('AMB-014', null, punto({ lat: 4.62 }));

    const r = await traza.recorrido('AMB-014');
    expect(r.map((p) => p.lat)).toEqual([4.6, 4.61, 4.62]);
  });

  it('no mezcla móviles', async () => {
    await traza.anotar('AMB-014', null, punto());
    await traza.anotar('AMB-027', null, punto());
    expect(await traza.recorrido('AMB-014')).toHaveLength(1);
  });

  it('un móvil sin reportes devuelve vacío, no error', async () => {
    expect(await traza.recorrido('AMB-999')).toEqual([]);
  });

  it('respeta el límite pedido', async () => {
    for (let i = 0; i < 20; i++) await traza.anotar('AMB-014', null, punto());
    expect(await traza.recorrido('AMB-014', 5)).toHaveLength(5);
  });

  it('el límite devuelve los MÁS RECIENTES', async () => {
    for (let i = 0; i < 10; i++) {
      await traza.anotar('AMB-014', null, punto({ lat: 4 + i / 100 }));
    }
    const r = await traza.recorrido('AMB-014', 3);
    expect(r.map((p) => p.lat)).toEqual([4.07, 4.08, 4.09]);
  });

  it('acota la memoria: no crece sin fin', async () => {
    // Un móvil reportando cada 15 s durante un turno de 12 h deja 2.880
    // puntos. Sin cota, eso vive en RAM por cada ambulancia.
    for (let i = 0; i < 600; i++) await traza.anotar('AMB-014', null, punto());
    expect((await traza.recorrido('AMB-014', 1000)).length).toBeLessThanOrEqual(500);
  });

  it('conserva la precisión del GPS', async () => {
    // No es decorativa: en interiores el error es de cientos de metros y una
    // posición sin su radio se lee como una certeza que no existe.
    await traza.anotar('AMB-014', null, punto({ precisionM: 350 }));
    expect((await traza.recorrido('AMB-014'))[0].precisionM).toBe(350);
  });

  it('anotar nunca lanza', async () => {
    // Perder un punto de telemetría no puede tumbar el reporte de posición,
    // que es lo que mantiene viva la flota.
    await expect(
      traza.anotar('AMB-014', null, punto({ lat: NaN })),
    ).resolves.toBeUndefined();
  });
});
