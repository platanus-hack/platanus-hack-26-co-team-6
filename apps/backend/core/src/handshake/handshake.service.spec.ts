/**
 * Tarea 0.6 — lo que el handshake GUARDA cuando una sede no puede recibir.
 *
 * El comportamiento que se prueba no es "llama al catalogo": es que el dato
 * que queda sirva para agregar el trimestre que viene aunque alguien
 * reescriba las etiquetas mañana.
 */

import { AlmacenService } from '../almacen/almacen.service';
import { CongestionService } from '../scoring/congestion.service';
import { SedesService } from '../sedes/sedes.service';
import { VozClient } from '../voz/voz.client';
import { HandshakeService } from './handshake.service';
import type { Handshake } from '../contracts/types';

const HANDSHAKE_BASE: Handshake = {
  id: 'hs-1',
  casoId: 'caso-1',
  sedeCodigo: 'SEDE-A',
  canal: 'consola',
  estado: 'enviado',
  motivoRechazo: null,
  enviadoEn: new Date(Date.now() - 12_000).toISOString(),
  expiraEn: new Date(Date.now() + 33_000).toISOString(),
  respondidoEn: null,
  latenciaS: null,
};

function montar(): { servicio: HandshakeService; almacen: AlmacenService } {
  const almacen = new AlmacenService();
  almacen.guardarHandshake({ ...HANDSHAKE_BASE });

  // Sin sede ni voz configuradas: el handshake tiene que funcionar igual.
  // Es la regla del repo — todo degrada, y aqui degradar no puede cambiar
  // lo que se guarda.
  const sedes = { porCodigo: async () => undefined } as unknown as SedesService;
  const congestion = { indice: () => 0.4 } as unknown as CongestionService;
  const voz = { configurado: () => false } as unknown as VozClient;

  return {
    servicio: new HandshakeService(almacen, sedes, congestion, voz),
    almacen,
  };
}

describe('HandshakeService · motivo de rechazo (0.6)', () => {
  it('guarda el codigo del catalogo, no solo el texto', async () => {
    const { servicio } = montar();

    const r = await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'rechazado',
      motivoCodigo: 'SIN_CLARIDAD_PAGADOR',
    });

    expect(r.aplicada).toBe(true);
    expect(r.handshake.motivoCodigo).toBe('SIN_CLARIDAD_PAGADOR');
    // La etiqueta queda congelada para el acta, pero NO es lo que se agrupa.
    expect(r.handshake.motivoRechazo).toBe('Sin claridad del pagador');
  });

  it('congela la etiqueta que vio quien respondio, aunque el catalogo cambie', async () => {
    const { servicio } = montar();

    const r = await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'rechazado',
      motivoCodigo: 'SIN_CAMAS_UCI',
      motivo: 'Sin camas UCI disponibles (turno noche)',
    });

    expect(r.handshake.motivoCodigo).toBe('SIN_CAMAS_UCI');
    expect(r.handshake.motivoRechazo).toBe(
      'Sin camas UCI disponibles (turno noche)',
    );
  });

  it('recupera el codigo de un cliente viejo que manda solo texto', async () => {
    const { servicio } = montar();

    const r = await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'rechazado',
      motivo: 'Urgencias en capacidad máxima',
    });

    expect(r.handshake.motivoCodigo).toBe('URGENCIAS_SATURADAS');
  });

  it('un texto libre que no cruza se conserva y NO se le inventa codigo', async () => {
    const { servicio } = montar();

    const r = await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'rechazado',
      motivo: 'el ascensor de urgencias esta dañado',
    });

    expect(r.handshake.motivoRechazo).toBe('el ascensor de urgencias esta dañado');
    expect(r.handshake.motivoCodigo).toBeNull();
  });

  it('un rechazo sin motivo cae al codigo por defecto, no a un texto suelto', async () => {
    const { servicio } = montar();

    const r = await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'rechazado',
    });

    expect(r.handshake.motivoCodigo).toBe('URGENCIAS_SATURADAS');
    expect(r.handshake.motivoRechazo).toBe('Urgencias en capacidad máxima');
  });

  it('aceptar no deja motivo de ningun tipo', async () => {
    const { servicio } = montar();

    const r = await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'aceptado',
    });

    expect(r.handshake.motivoCodigo).toBeNull();
    expect(r.handshake.motivoRechazo).toBeNull();
  });

  it('el doble toque sigue sin aplicarse y no reescribe el motivo', async () => {
    const { servicio } = montar();

    await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'rechazado',
      motivoCodigo: 'SIN_ESPECIALISTA',
    });
    const segunda = await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'rechazado',
      motivoCodigo: 'SIN_CAMAS_UCI',
    });

    expect(segunda.aplicada).toBe(false);
    expect(segunda.handshake.motivoCodigo).toBe('SIN_ESPECIALISTA');
  });
});
