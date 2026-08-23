/**
 * Tarea 2.11 — idempotencia.
 *
 * El comportamiento que importa: la misma accion reintentada tiene UN solo
 * efecto, y la misma clave con otro cuerpo no se responde en silencio.
 */

import { IdempotenciaMemoria, VENTANA_MS, huellaDe } from './idempotencia';

const RESULTADO = { estado: 201, cuerpo: { handshakeId: 'hs-1' } };

describe('huellaDe', () => {
  it('no depende del orden de las claves del cuerpo', () => {
    // `{a,b}` y `{b,a}` son la misma peticion: un cliente que serializa en
    // otro orden no puede recibir un 409 por eso.
    expect(huellaDe('POST', '/dispatch', { a: 1, b: 2 })).toBe(
      huellaDe('POST', '/dispatch', { b: 2, a: 1 }),
    );
  });

  it('cambia si cambia el cuerpo, la ruta o el metodo', () => {
    const base = huellaDe('POST', '/dispatch', { sedeCodigo: 'A' });
    expect(huellaDe('POST', '/dispatch', { sedeCodigo: 'B' })).not.toBe(base);
    expect(huellaDe('POST', '/escalamiento', { sedeCodigo: 'A' })).not.toBe(
      base,
    );
    expect(huellaDe('PATCH', '/dispatch', { sedeCodigo: 'A' })).not.toBe(base);
  });
});

describe('IdempotenciaMemoria', () => {
  it('la primera vez reserva; la segunda, ya completada, devuelve lo guardado', async () => {
    const almacen = new IdempotenciaMemoria();
    const huella = huellaDe('POST', '/dispatch', { casoId: 'c1' });

    expect(await almacen.reservar('k1', huella)).toEqual({ tipo: 'nuevo' });
    await almacen.completar('k1', RESULTADO);

    expect(await almacen.reservar('k1', huella)).toEqual({
      tipo: 'repetido',
      resultado: RESULTADO,
    });
  });

  it('la misma clave con otro cuerpo es conflicto, no un resultado viejo', async () => {
    // Devolver el resultado anterior aqui seria contestar a una pregunta que
    // nadie hizo: el cliente pidio otra cosa.
    const almacen = new IdempotenciaMemoria();
    await almacen.reservar(
      'k1',
      huellaDe('POST', '/dispatch', { casoId: 'c1' }),
    );
    await almacen.completar('k1', RESULTADO);

    expect(
      await almacen.reservar(
        'k1',
        huellaDe('POST', '/dispatch', { casoId: 'c2' }),
      ),
    ).toEqual({ tipo: 'conflicto' });
  });

  it('un reintento que llega MIENTRAS corre la primera espera su resultado', async () => {
    // Es el doble toque del paramedico con mala señal. Merece la respuesta
    // de la primera, no un error.
    const almacen = new IdempotenciaMemoria();
    const huella = huellaDe('POST', '/dispatch', { casoId: 'c1' });

    await almacen.reservar('k1', huella);
    const enCurso = await almacen.reservar('k1', huella);

    expect(enCurso.tipo).toBe('en_curso');

    const esperando = enCurso.tipo === 'en_curso' ? enCurso.espera : undefined;
    await almacen.completar('k1', RESULTADO);

    await expect(esperando).resolves.toEqual(RESULTADO);
  });

  it('liberar deja la clave utilizable otra vez', async () => {
    // Un 500 no se cachea: si core falló por un timeout de Mapbox, el
    // reintento tiene que ejecutarse de verdad.
    const almacen = new IdempotenciaMemoria();
    const huella = huellaDe('POST', '/dispatch', { casoId: 'c1' });

    await almacen.reservar('k1', huella);
    await almacen.liberar('k1');

    expect(await almacen.reservar('k1', huella)).toEqual({ tipo: 'nuevo' });
  });

  it('quien esperaba una peticion que fallo no se queda colgado', async () => {
    const almacen = new IdempotenciaMemoria();
    const huella = huellaDe('POST', '/dispatch', { casoId: 'c1' });

    await almacen.reservar('k1', huella);
    const enCurso = await almacen.reservar('k1', huella);
    const esperando = enCurso.tipo === 'en_curso' ? enCurso.espera : undefined;

    await almacen.liberar('k1');

    await expect(esperando).resolves.toBeUndefined();
  });

  it('a las 24 horas la clave se olvida', async () => {
    // Un reintento honesto no llega al dia siguiente; guardarlo para siempre
    // solo hace crecer la tabla.
    jest.useFakeTimers();
    try {
      const almacen = new IdempotenciaMemoria();
      const huella = huellaDe('POST', '/dispatch', { casoId: 'c1' });

      await almacen.reservar('k1', huella);
      await almacen.completar('k1', RESULTADO);

      jest.advanceTimersByTime(VENTANA_MS + 1000);

      expect(await almacen.reservar('k1', huella)).toEqual({ tipo: 'nuevo' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('claves distintas no se pisan', async () => {
    const almacen = new IdempotenciaMemoria();
    const huella = huellaDe('POST', '/dispatch', { casoId: 'c1' });

    expect(await almacen.reservar('k1', huella)).toEqual({ tipo: 'nuevo' });
    expect(await almacen.reservar('k2', huella)).toEqual({ tipo: 'nuevo' });
  });
});
