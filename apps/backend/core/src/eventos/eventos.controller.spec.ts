/**
 * Tarea 3.2 — la puerta por la que un cliente escribe eventos.
 *
 * Es la parte más delicada del cableado: si esta puerta acepta cualquier
 * tipo, el registro de auditoría vale lo que vale un campo de texto.
 */

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ActorSesion } from '../auth/carga';
import { EventosMemoria } from './almacen-eventos';
import { EventosController } from './eventos.controller';
import { RegistroService } from './registro.service';

const REGULADOR: ActorSesion = {
  id: 'actor-crue',
  organizacionId: 'org-crue',
  roles: ['regulador_crue'],
  sedes: [],
  tipo: 'humano',
  sesionId: 'sid-1',
  legado: false,
};

function montar(): {
  controlador: EventosController;
  registro: RegistroService;
} {
  const registro = new RegistroService(new EventosMemoria());
  return { controlador: new EventosController(registro), registro };
}

describe('EventosController', () => {
  it('⭐ un cliente NO puede escribir un evento que decide el servidor', async () => {
    // `aceptado` lo escribe `HandshakeService` cuando alguien acepta de
    // verdad. Si una consola pudiera mandarlo, el acta diría que un hospital
    // aceptó a un paciente que nunca le preguntaron.
    const { controlador } = montar();

    for (const tipo of [
      'aceptado',
      'rechazado',
      'match_calculado',
      'timeout',
    ]) {
      await expect(
        controlador.crear('caso-1', { tipo }, REGULADOR),
      ).rejects.toThrow(BadRequestException);
    }
  });

  it('un tipo inventado tampoco entra', async () => {
    const { controlador } = montar();
    await expect(
      controlador.crear('caso-1', { tipo: 'me_lo_invente' }, REGULADOR),
    ).rejects.toThrow(BadRequestException);
  });

  it('⭐ un override sin justificación es un salto de regla sin firma', async () => {
    // Invariante 2 de §5.3. La justificación es lo único que separa un
    // override de saltarse una regla dura porque sí.
    const { controlador } = montar();

    await expect(
      controlador.crear('caso-1', { tipo: 'override_crue' }, REGULADOR),
    ).rejects.toThrow(BadRequestException);

    await expect(
      controlador.crear(
        'caso-1',
        { tipo: 'override_crue', detalle: { justificacion: '   ' } },
        REGULADOR,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('con justificación, el override queda registrado', async () => {
    const { controlador, registro } = montar();

    const { evento } = await controlador.crear(
      'caso-1',
      {
        tipo: 'override_crue',
        detalle: { justificacion: 'La sede confirmó cama por radio' },
        codigoSede: 'SEDE-NORTE',
      },
      REGULADOR,
    );

    expect(evento!.tipo).toBe('override_crue');
    expect(evento!.codigoSede).toBe('SEDE-NORTE');
    expect(await registro.deCaso('caso-1')).toHaveLength(1);
  });

  it('⭐ la firma es el actor de la sesión, no lo que diga el cuerpo', async () => {
    // Si el cliente pudiera mandar el `actorId`, la firma de quien decidió
    // sería un campo editable — lo contrario de una auditoría.
    const { controlador } = montar();

    const { evento } = await controlador.crear(
      'caso-1',
      {
        tipo: 'override_crue',
        detalle: {
          justificacion: 'x',
          actorId: 'otro-cualquiera',
          reguladorDeclarado: 'Quien Sea',
        },
      },
      REGULADOR,
    );

    expect(evento!.actorId).toBe('actor-crue');
  });

  it('⭐ un jefe de urgencias no puede hacer un override del CRUE', async () => {
    // La ley le atribuye la regulacion al CRUE. Un jefe de urgencias
    // saltandose el filtro duro "porque igual va a llegar" es justo lo que
    // esto impide. (Parte de la 3.11 de Juan; se cierra aqui porque el
    // endpoint es de esta tarea.)
    const { controlador } = montar();
    const jefe: ActorSesion = {
      ...REGULADOR,
      id: 'actor-hospital',
      roles: ['jefe_urgencias'],
    };

    await expect(
      controlador.crear(
        'caso-1',
        { tipo: 'override_crue', detalle: { justificacion: 'me parece' } },
        jefe,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('los demas tipos no exigen rol de regulador', async () => {
    // Una llegada la reporta el paramedico, no el CRUE.
    const { controlador } = montar();
    const paramedico: ActorSesion = {
      ...REGULADOR,
      id: 'actor-movil',
      roles: ['paramedico'],
    };

    const { evento } = await controlador.crear(
      'caso-1',
      { tipo: 'llegada_puerta' },
      paramedico,
    );
    expect(evento!.tipo).toBe('llegada_puerta');
  });

  it('el mismo toque dos veces es un solo evento', async () => {
    const { controlador, registro } = montar();
    const cuerpo = {
      tipo: 'llegada_puerta',
      claveIdempotencia: 'llegada-1',
    };

    await controlador.crear('caso-1', cuerpo, REGULADOR);
    await controlador.crear('caso-1', cuerpo, REGULADOR);

    expect(await registro.deCaso('caso-1')).toHaveLength(1);
  });

  it('devuelve la línea de tiempo del caso', async () => {
    const { controlador, registro } = montar();
    await registro.registrar({ casoId: 'caso-1', tipo: 'caso_creado' });
    await registro.registrar({ casoId: 'caso-1', tipo: 'despachado' });

    const { eventos } = await controlador.deCaso('caso-1');
    expect(eventos.map((e) => e.tipo)).toEqual(['caso_creado', 'despachado']);
  });
});
