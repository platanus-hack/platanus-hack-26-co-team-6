/**
 * El registro de eventos.
 *
 * Prueban comportamiento, no implementación: qué queda escrito y qué NO se
 * puede escribir. La regla que gobierna todo el archivo es que la auditoría
 * es append-only — no hay forma de editar, así que los tests comprueban que
 * corregir sea escribir otra vez.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MemoriaAlmacenEventos } from './almacen-eventos';
import type { ActorEvento } from './evento.tipos';
import { RegistroService } from './registro.service';

const REGULADOR: ActorEvento = {
  id: 'turno:operador',
  nombre: 'N. Robledo',
  tipo: 'humano',
};

const VOZ: ActorEvento = { id: 'svc:voz', nombre: null, tipo: 'servicio' };

function nuevo(): RegistroService {
  return new RegistroService(new MemoriaAlmacenEventos());
}

describe('RegistroService', () => {
  it('escribe el evento con actor, hora y detalle', async () => {
    const registro = nuevo();
    const evento = await registro.registrar({
      casoId: 'caso-1',
      tipo: 'override_crue',
      actor: REGULADOR,
      codigoSede: 'S-1',
      detalle: { justificacion: 'única sede con hemodinamia confirmada' },
    });

    expect(evento.id).toBeGreaterThan(0);
    expect(evento.actor.id).toBe('turno:operador');
    expect(evento.codigoSede).toBe('S-1');
    expect(Date.parse(evento.ocurridoEn)).not.toBeNaN();
    expect(evento.detalle.justificacion).toContain('hemodinamia');
  });

  it('distingue al humano del servicio', async () => {
    const registro = nuevo();
    await registro.registrar({ casoId: 'c', tipo: 'override_crue', actor: REGULADOR });
    await registro.registrar({ casoId: 'c', tipo: 'llegada_escena', actor: VOZ });

    const tipos = (await registro.listar('c')).map((e) => e.actor.tipo);
    expect(tipos).toEqual(['humano', 'servicio']);
  });

  it('la misma clave de idempotencia no duplica historia', async () => {
    const registro = nuevo();
    const uno = await registro.registrar({
      casoId: 'caso-1',
      tipo: 'override_crue',
      actor: REGULADOR,
      claveIdempotencia: 'toque-1',
    });
    const dos = await registro.registrar({
      casoId: 'caso-1',
      tipo: 'override_crue',
      actor: REGULADOR,
      claveIdempotencia: 'toque-1',
    });

    expect(dos.id).toBe(uno.id);
    expect(await registro.listar('caso-1')).toHaveLength(1);
  });

  it('una corrección es un evento NUEVO que apunta al viejo', async () => {
    const registro = nuevo();
    const original = await registro.registrar({
      casoId: 'caso-1',
      tipo: 'llegada_puerta',
      actor: REGULADOR,
      detalle: { hora: '22:14' },
    });
    const correccion = await registro.registrar({
      casoId: 'caso-1',
      tipo: 'llegada_puerta',
      actor: REGULADOR,
      corrigeA: original.id,
      detalle: { hora: '22:11' },
    });

    const linea = await registro.listar('caso-1');
    // Los dos siguen ahí. El error se ve, no se esconde.
    expect(linea).toHaveLength(2);
    expect(linea[0].detalle.hora).toBe('22:14');
    expect(correccion.corrigeA).toBe(original.id);
  });

  it('no se puede corregir un evento que no existe', async () => {
    const registro = nuevo();
    await expect(
      registro.registrar({
        casoId: 'caso-1',
        tipo: 'llegada_puerta',
        actor: REGULADOR,
        corrigeA: 9999,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('una corrección no cruza de caso', async () => {
    const registro = nuevo();
    const ajeno = await registro.registrar({
      casoId: 'caso-1',
      tipo: 'llegada_puerta',
      actor: REGULADOR,
    });
    await expect(
      registro.registrar({
        casoId: 'caso-2',
        tipo: 'llegada_puerta',
        actor: REGULADOR,
        corrigeA: ajeno.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el dictado crudo no entra al detalle de un evento', async () => {
    const registro = nuevo();
    await expect(
      registro.registrar({
        casoId: 'caso-1',
        tipo: 'caso_creado',
        actor: VOZ,
        // El error típico: pasar el `Caso` entero por comodidad.
        detalle: { textoCrudo: 'masculino de 54 años con dolor torácico…' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await registro.listar('caso-1')).toHaveLength(0);
  });

  it('el teléfono de quien reporta tampoco', async () => {
    const registro = nuevo();
    await expect(
      registro.registrar({
        casoId: 'caso-1',
        tipo: 'caso_creado',
        actor: VOZ,
        detalle: { telefonoReporta: '573001234567' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un tipo que no está en el vocabulario se rechaza', async () => {
    const registro = nuevo();
    await expect(
      registro.registrar({
        casoId: 'caso-1',
        // @ts-expect-error — es justo lo que se prueba
        tipo: 'lo_que_se_me_ocurrio',
        actor: REGULADOR,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('la línea de tiempo sale en orden y es estable entre lecturas', async () => {
    const registro = nuevo();
    // Misma hora exacta: sin desempate, el orden cambiaría entre lecturas y
    // una auditoría que no es reproducible no sirve.
    const misma = '2026-08-22T22:14:00.000Z';
    for (const tipo of ['despachado', 'aceptado', 'llegada_puerta'] as const) {
      await registro.registrar({
        casoId: 'caso-1',
        tipo,
        actor: REGULADOR,
        ocurridoEn: misma,
      });
    }
    const primera = (await registro.listar('caso-1')).map((e) => e.tipo);
    const segunda = (await registro.listar('caso-1')).map((e) => e.tipo);
    expect(primera).toEqual(['despachado', 'aceptado', 'llegada_puerta']);
    expect(segunda).toEqual(primera);
  });

  it('quien escribió un evento no puede mutarlo después por referencia', async () => {
    const registro = nuevo();
    const detalle: Record<string, unknown> = { justificacion: 'la de verdad' };
    await registro.registrar({
      casoId: 'caso-1',
      tipo: 'override_crue',
      actor: REGULADOR,
      detalle,
    });
    detalle.justificacion = 'otra cosa';

    const [guardado] = await registro.listar('caso-1');
    expect(guardado.detalle.justificacion).toBe('la de verdad');
  });

  it('separa las líneas de tiempo por caso', async () => {
    const registro = nuevo();
    await registro.registrar({ casoId: 'a', tipo: 'escalado', actor: REGULADOR });
    await registro.registrar({ casoId: 'b', tipo: 'escalado', actor: REGULADOR });

    expect(await registro.listar('a')).toHaveLength(1);
    expect((await registro.recientes(10)).map((e) => e.casoId)).toEqual(['b', 'a']);
  });

  it('dice en qué modo corre, porque se pierde al reiniciar', () => {
    expect(nuevo().modo()).toBe('memoria');
  });
});
