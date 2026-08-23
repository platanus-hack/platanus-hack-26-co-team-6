/**
 * Tarea 3.1 — el único punto de escritura de eventos.
 *
 * Lo que se prueba es lo que hace útil un registro de auditoría: que el mismo
 * evento no se cuente dos veces, que una corrección no borre el error, y que
 * un fallo al escribir el acta **no tumbe el traslado**.
 */

import { EventosMemoria, type AlmacenEventos } from './almacen-eventos';
import { RegistroService } from './registro.service';

const CASO = 'caso-1';

describe('RegistroService', () => {
  it('registra el evento y lo devuelve con su id', async () => {
    const registro = new RegistroService(new EventosMemoria());

    const evento = await registro.registrar({
      casoId: CASO,
      tipo: 'despachado',
      actorId: 'actor-1',
      codigoSede: 'SEDE-SUR',
      detalle: { rank: 1 },
    });

    expect(evento).not.toBeNull();
    expect(evento!.tipo).toBe('despachado');
    expect(evento!.codigoSede).toBe('SEDE-SUR');
    expect(evento!.detalle.rank).toBe(1);
    expect(evento!.corrigeA).toBeNull();
  });

  it('⭐ el mismo evento con la misma clave dos veces → una sola fila', async () => {
    // El paramédico toca "ya llegué" dos veces con mala señal. Eso es UNA
    // llegada, y contarla dos veces arruina el tiempo de traslado del reporte.
    const registro = new RegistroService(new EventosMemoria());

    const uno = await registro.registrar({
      casoId: CASO,
      tipo: 'llegada_puerta',
      claveIdempotencia: 'llegada-1',
    });
    const dos = await registro.registrar({
      casoId: CASO,
      tipo: 'llegada_puerta',
      claveIdempotencia: 'llegada-1',
    });

    expect(dos!.id).toBe(uno!.id);
    expect(await registro.deCaso(CASO)).toHaveLength(1);
  });

  it('la misma clave en otro tipo de evento SÍ es otro evento', async () => {
    const registro = new RegistroService(new EventosMemoria());

    await registro.registrar({
      casoId: CASO,
      tipo: 'llegada_escena',
      claveIdempotencia: 'toque-1',
    });
    await registro.registrar({
      casoId: CASO,
      tipo: 'llegada_puerta',
      claveIdempotencia: 'toque-1',
    });

    expect(await registro.deCaso(CASO)).toHaveLength(2);
  });

  it('la misma clave en otro caso SÍ es otro evento', async () => {
    const registro = new RegistroService(new EventosMemoria());

    await registro.registrar({
      casoId: CASO,
      tipo: 'llegada_puerta',
      claveIdempotencia: 'llegada-1',
    });
    await registro.registrar({
      casoId: 'caso-2',
      tipo: 'llegada_puerta',
      claveIdempotencia: 'llegada-1',
    });

    expect(await registro.deCaso(CASO)).toHaveLength(1);
    expect(await registro.deCaso('caso-2')).toHaveLength(1);
  });

  it('sin clave, dos eventos iguales son dos eventos', async () => {
    // Dos rechazos de sedes distintas, dos re-ruteos: repetir el tipo es
    // normal. La idempotencia se pide a propósito, no se impone.
    const registro = new RegistroService(new EventosMemoria());

    await registro.registrar({ casoId: CASO, tipo: 'rechazado' });
    await registro.registrar({ casoId: CASO, tipo: 'rechazado' });

    expect(await registro.deCaso(CASO)).toHaveLength(2);
  });

  it('⭐ una corrección se lee como corrección: el original sigue ahí', async () => {
    // Es lo forense. Un UPDATE habría borrado el error, que es justo lo que
    // un auditor necesita ver.
    const registro = new RegistroService(new EventosMemoria());

    const original = await registro.registrar({
      casoId: CASO,
      tipo: 'llegada_puerta',
      actorId: 'actor-1',
      detalle: { hora: '22:14' },
    });

    const correccion = await registro.corregir(original!.id, {
      casoId: CASO,
      tipo: 'llegada_puerta',
      actorId: 'actor-1',
      detalle: { hora: '22:11', porque: 'el reloj del tablet iba adelantado' },
    });

    const linea = await registro.deCaso(CASO);
    expect(linea).toHaveLength(2);
    expect(correccion!.corrigeA).toBe(original!.id);
    expect(linea.find((e) => e.id === original!.id)!.detalle.hora).toBe(
      '22:14',
    );
  });

  it('⭐ si el almacén falla, NO lanza: el traslado sigue', async () => {
    // Un paciente no se queda sin hospital porque no se pudo escribir su
    // línea de tiempo. Se grita en el log y se devuelve null.
    const roto: AlmacenEventos = {
      agregar: () => Promise.reject(new Error('base caida')),
      deCaso: () => Promise.reject(new Error('base caida')),
    };
    const registro = new RegistroService(roto);

    await expect(
      registro.registrar({ casoId: CASO, tipo: 'aceptado' }),
    ).resolves.toBeNull();
    await expect(registro.deCaso(CASO)).resolves.toEqual([]);
  });

  it('la línea de tiempo de un caso no trae la de otro', async () => {
    const registro = new RegistroService(new EventosMemoria());

    await registro.registrar({ casoId: CASO, tipo: 'caso_creado' });
    await registro.registrar({ casoId: 'caso-2', tipo: 'caso_creado' });

    const linea = await registro.deCaso(CASO);
    expect(linea).toHaveLength(1);
    expect(linea[0].casoId).toBe(CASO);
  });

  it('quien lee la línea de tiempo no puede modificar la guardada', async () => {
    // Append-only también hacia adentro: si `deCaso` devolviera referencias,
    // un llamador distraído editaría el acta sin querer.
    const registro = new RegistroService(new EventosMemoria());
    await registro.registrar({
      casoId: CASO,
      tipo: 'aceptado',
      detalle: { sede: 'SEDE-SUR' },
    });

    const copia = await registro.deCaso(CASO);
    copia[0].detalle.sede = 'OTRA';

    expect((await registro.deCaso(CASO))[0].detalle.sede).toBe('SEDE-SUR');
  });
});
