/**
 * El override del CRUE — tarea 3.11.
 *
 * Antes de esto, la justificación de forzar un destino vivía en el
 * `localStorage` del navegador del regulador. Estos tests fijan lo que el
 * servidor exige ahora, que es justo lo que el navegador no podía garantizar:
 * que haya motivo, que quien firma tenga la potestad, y que quede escrito.
 */

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Caso, DispatchResponse, Handshake } from '../contracts/types';
import { AlmacenService } from '../almacen/almacen.service';
import type { DispatchService } from '../dispatch/dispatch.service';
import type { ActorSolicitante } from '../eventos/actor.service';
import { MemoriaAlmacenEventos } from '../eventos/almacen-eventos';
import { RegistroService } from '../eventos/registro.service';
import { EscalamientoService } from './escalamiento.service';

const CASO: Caso = {
  id: 'caso-1',
  resumen: 'IAM con elevación del ST',
  triage: 2,
  dxCie10: 'I21.1',
  dxDescripcion: 'Infarto agudo',
  serviciosRequeridos: [743],
  complejidadRequerida: 'alta',
  edad: 54,
  sexo: 'M',
  signosAlarma: [],
  requiereMedicoABordo: true,
  confianza: 0.9,
  textoCrudo: 'masculino de 54 años con dolor torácico',
  origen: { lat: 4.6, lng: -74.08 },
  tipoMovil: 'TAM',
  unidad: { id: 'AMB-014' },
  creadoEn: '2026-08-22T22:00:00.000Z',
};

const HANDSHAKE: Handshake = {
  id: 'hs-1',
  casoId: CASO.id,
  sedeCodigo: 'S-9',
  canal: 'consola',
  estado: 'enviado',
  motivoRechazo: null,
  enviadoEn: '2026-08-22T22:05:00.000Z',
  expiraEn: '2026-08-22T22:05:45.000Z',
  respondidoEn: null,
  latenciaS: null,
};

const REGULADOR: ActorSolicitante = {
  id: 'turno:operador',
  nombre: null,
  tipo: 'humano',
  organizacionId: 'org-crue',
  roles: ['regulador_crue'],
  provisional: true,
};

const JUSTIFICACION =
  'Única sede con hemodinamia disponible, confirmada por teléfono a las 21:40.';

function montar() {
  const almacen = new AlmacenService();
  almacen.guardarCaso(CASO);

  const despachar = jest.fn(
    async (): Promise<DispatchResponse> => ({ handshake: { ...HANDSHAKE } }),
  );
  const despacho = { despachar } as unknown as DispatchService;
  const registro = new RegistroService(new MemoriaAlmacenEventos());

  return {
    servicio: new EscalamientoService(almacen, despacho, registro),
    registro,
    despachar,
  };
}

describe('EscalamientoService.override', () => {
  it('sin justificación no hay override', async () => {
    const { servicio, despachar } = montar();
    await expect(
      servicio.override(
        { casoId: CASO.id, sedeCodigo: 'S-9', justificacion: '   ' },
        REGULADOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Y sobre todo: no despachó una ambulancia sin motivo escrito.
    expect(despachar).not.toHaveBeenCalled();
  });

  it('una justificación de dos palabras tampoco es una justificación', async () => {
    const { servicio } = montar();
    await expect(
      servicio.override(
        { casoId: CASO.id, sedeCodigo: 'S-9', justificacion: 'porque sí' },
        REGULADOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('solo el regulador del CRUE puede forzar un destino', async () => {
    const { servicio, despachar } = montar();
    for (const roles of [[], ['paramedico'], ['jefe_urgencias'], ['auditor']] as const) {
      await expect(
        servicio.override(
          { casoId: CASO.id, sedeCodigo: 'S-9', justificacion: JUSTIFICACION },
          { ...REGULADOR, roles: [...roles] },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(despachar).not.toHaveBeenCalled();
  });

  it('un caso que no existe no se puede forzar', async () => {
    const { servicio } = montar();
    await expect(
      servicio.override(
        { casoId: 'no-existe', sedeCodigo: 'S-9', justificacion: JUSTIFICACION },
        REGULADOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('escribe el evento con actor, hora, sede y la justificación', async () => {
    const { servicio, registro } = montar();
    const { evento, handshake } = await servicio.override(
      {
        casoId: CASO.id,
        sedeCodigo: 'S-9',
        justificacion: JUSTIFICACION,
        firmaDeclarada: 'N. Robledo',
      },
      REGULADOR,
    );

    expect(handshake?.id).toBe('hs-1');
    expect(evento.tipo).toBe('override_crue');
    expect(evento.actor.id).toBe('turno:operador');
    expect(evento.codigoSede).toBe('S-9');
    expect(evento.detalle.justificacion).toBe(JUSTIFICACION);
    expect(evento.detalle.handshakeId).toBe('hs-1');
    expect(Date.parse(evento.ocurridoEn)).not.toBeNaN();
    // Y queda en la línea de tiempo del caso, no en un navegador.
    expect(await registro.listar(CASO.id)).toHaveLength(1);
  });

  it('la firma tecleada se guarda marcada como NO verificada', async () => {
    // Hasta 1.3 la sesión es una contraseña de turno: el nombre lo declara
    // quien escribe, y decir lo contrario sería peor que no guardarlo.
    const { servicio } = montar();
    const { evento } = await servicio.override(
      {
        casoId: CASO.id,
        sedeCodigo: 'S-9',
        justificacion: JUSTIFICACION,
        firmaDeclarada: 'N. Robledo',
      },
      REGULADOR,
    );
    expect(evento.detalle.firmaDeclarada).toBe('N. Robledo');
    expect(evento.detalle.firmaVerificada).toBe(false);
  });

  it('si se salta una regla dura, el evento lo dice', async () => {
    const { servicio } = montar();
    const { evento } = await servicio.override(
      {
        casoId: CASO.id,
        sedeCodigo: 'S-9',
        justificacion: JUSTIFICACION,
        saltaRegla: 'No tiene Hemodinamia e intervencionismo',
        radioKm: 30,
      },
      REGULADOR,
    );
    expect(evento.detalle.saltaReglaDura).toBe(
      'No tiene Hemodinamia e intervencionismo',
    );
    expect(evento.detalle.radioKmBusqueda).toBe(30);
  });

  it('el detalle del override no arrastra PII del caso', async () => {
    const { servicio } = montar();
    const { evento } = await servicio.override(
      { casoId: CASO.id, sedeCodigo: 'S-9', justificacion: JUSTIFICACION },
      REGULADOR,
    );
    const crudo = JSON.stringify(evento);
    expect(crudo).not.toContain('dolor torácico');
    expect(crudo).not.toContain('-74.08');
  });

  it('el doble toque no manda dos ambulancias', async () => {
    const { servicio, despachar, registro } = montar();
    const cuerpo = {
      casoId: CASO.id,
      sedeCodigo: 'S-9',
      justificacion: JUSTIFICACION,
      claveIdempotencia: 'confirmacion-1',
    };

    const uno = await servicio.override(cuerpo, REGULADOR);
    const dos = await servicio.override(cuerpo, REGULADOR);

    expect(dos.repetido).toBe(true);
    expect(dos.evento.id).toBe(uno.evento.id);
    expect(despachar).toHaveBeenCalledTimes(1);
    expect(await registro.listar(CASO.id)).toHaveLength(1);
  });

  it('despacha sin pedirle permiso al guard de evidencia del motor', async () => {
    // Es el punto del override: el motor NO eligió esa sede. Si exigiéramos
    // su evidencia, forzar un destino sería imposible por construcción.
    const { servicio, despachar } = montar();
    await servicio.override(
      { casoId: CASO.id, sedeCodigo: 'S-9', justificacion: JUSTIFICACION },
      REGULADOR,
    );
    expect(despachar).toHaveBeenCalledWith({
      casoId: CASO.id,
      sedeCodigo: 'S-9',
      canal: 'consola',
    });
  });
});
