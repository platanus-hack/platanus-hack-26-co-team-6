/**
 * Tarea 0.6 — lo que el handshake GUARDA cuando una sede no puede recibir.
 *
 * El comportamiento que se prueba no es "llama al catalogo": es que el dato
 * que queda sirva para agregar el trimestre que viene aunque alguien
 * reescriba las etiquetas mañana.
 */

import { AlmacenService } from '../almacen/almacen.service';
import { CongestionService } from '../scoring/congestion.service';
import { EventosMemoria } from '../eventos/almacen-eventos';
import { RegistroService } from '../eventos/registro.service';
import { MemoryRoutingStore } from '../persistence/memory-routing.store';
import { RoutingService } from '../routing/routing.service';
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

function montar(store = new MemoryRoutingStore()): {
  servicio: HandshakeService;
  almacen: AlmacenService;
} {
  const almacen = new AlmacenService();
  almacen.guardarHandshake({ ...HANDSHAKE_BASE });

  // Sin sede ni voz configuradas: el handshake tiene que funcionar igual.
  // Es la regla del repo — todo degrada, y aqui degradar no puede cambiar
  // lo que se guarda.
  const sedes = {
    porCodigo: () => Promise.resolve(undefined),
  } as unknown as SedesService;
  const congestion = { indice: () => 0.4 } as unknown as CongestionService;
  const voz = { configurado: () => false } as unknown as VozClient;

  return {
    servicio: new HandshakeService(
      almacen,
      sedes,
      congestion,
      new RoutingService(store),
      new RegistroService(new EventosMemoria()),
      voz,
    ),
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

    expect(r.handshake.motivoRechazo).toBe(
      'el ascensor de urgencias esta dañado',
    );
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

/**
 * Tarea 0.1 — el guard de aceptacion unica, ya conectado.
 *
 * Lo que se prueba no es "se llama a RoutingService": es que dos hospitales
 * no puedan preparar cama para el mismo paciente.
 */
describe('HandshakeService · aceptacion unica (0.1)', () => {
  /** Segundo toque a la misma sede, o toque de otra sede sobre el mismo caso. */
  const otroHandshake = (id: string, sedeCodigo: string): Handshake => ({
    ...HANDSHAKE_BASE,
    id,
    sedeCodigo,
  });

  it('la segunda sede que acepta el mismo caso recibe aplicada:false', async () => {
    const { servicio, almacen } = montar();
    almacen.guardarHandshake(otroHandshake('hs-2', 'SEDE-B'));

    const primera = await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'aceptado',
    });
    const segunda = await servicio.procesarRespuesta({
      handshakeId: 'hs-2',
      decision: 'aceptado',
    });

    expect(primera.aplicada).toBe(true);
    expect(segunda.aplicada).toBe(false);
    expect(segunda.codigo).toBe('PULSO_DESTINATION_ALREADY_ACCEPTED');
  });

  it('el handshake perdedor NO queda en aceptado', async () => {
    // Es lo que evita que la consola de SEDE-B pinte "traslado aceptado" y
    // alguien empiece a preparar una cama para un paciente que va a otro lado.
    const { servicio, almacen } = montar();
    almacen.guardarHandshake(otroHandshake('hs-2', 'SEDE-B'));

    await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'aceptado',
    });
    await servicio.procesarRespuesta({
      handshakeId: 'hs-2',
      decision: 'aceptado',
    });

    expect(almacen.obtenerHandshake('hs-2')?.estado).toBe('enviado');
    expect(almacen.obtenerHandshake('hs-2')?.respondidoEn).toBeNull();
  });

  it('la aceptacion que no se aplico NO ensucia el historial de la sede', async () => {
    // El historial alimenta P(aceptacion) y el indice de congestion. Contar
    // una aceptacion que nunca ocurrio le sube el puntaje a una sede por algo
    // que el sistema le impidio hacer.
    const { servicio, almacen } = montar();
    almacen.guardarHandshake(otroHandshake('hs-2', 'SEDE-B'));

    await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'aceptado',
    });
    await servicio.procesarRespuesta({
      handshakeId: 'hs-2',
      decision: 'aceptado',
    });

    expect(almacen.historialSede('SEDE-B').aceptados).toBe(0);
    expect(almacen.historialSede('SEDE-A').aceptados).toBe(1);
  });

  it('dos aceptaciones SIMULTANEAS: exactamente una se aplica', async () => {
    // Concurrencia de verdad, no dos llamadas en fila. El store demora la
    // reserva un turno del event loop, asi que las dos respuestas pasan el
    // chequeo de estado ANTES de que ninguna reserve — que es exactamente la
    // carrera que abre el fan-out paralelo, la optimizacion obvia que
    // cualquiera va a activar.
    class StoreLento extends MemoryRoutingStore {
      override async respond(
        ...args: Parameters<MemoryRoutingStore['respond']>
      ): ReturnType<MemoryRoutingStore['respond']> {
        await new Promise((r) => setTimeout(r, 0));
        return super.respond(...args);
      }
    }

    const { servicio, almacen } = montar(new StoreLento());
    almacen.guardarHandshake(otroHandshake('hs-2', 'SEDE-B'));

    const [a, b] = await Promise.all([
      servicio.procesarRespuesta({ handshakeId: 'hs-1', decision: 'aceptado' }),
      servicio.procesarRespuesta({ handshakeId: 'hs-2', decision: 'aceptado' }),
    ]);

    expect([a.aplicada, b.aplicada].filter(Boolean)).toHaveLength(1);
    const perdedora = a.aplicada ? b : a;
    expect(perdedora.codigo).toBe('PULSO_DESTINATION_ALREADY_ACCEPTED');
  });

  it('el doble toque sobre el MISMO handshake sigue siendo idempotente', async () => {
    // El requestKey lleva handshake + decision: la segunda vez el guard
    // devuelve su resultado guardado en vez de chocar consigo mismo. Y el
    // chequeo de estado, que ya existia, sigue diciendo que no se aplico.
    const { servicio } = montar();

    const primera = await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'aceptado',
    });
    const segunda = await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'aceptado',
    });

    expect(primera.aplicada).toBe(true);
    expect(segunda.aplicada).toBe(false);
    expect(segunda.codigo).toBe('PULSO_ILLEGAL_TRANSITION');
    expect(segunda.handshake.estado).toBe('aceptado');
  });

  it('rechazar no reserva el caso: otra sede todavia puede aceptarlo', async () => {
    const { servicio, almacen } = montar();
    almacen.guardarHandshake(otroHandshake('hs-2', 'SEDE-B'));

    await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'rechazado',
      motivoCodigo: 'SIN_CAMAS_UCI',
    });
    const aceptada = await servicio.procesarRespuesta({
      handshakeId: 'hs-2',
      decision: 'aceptado',
    });

    expect(aceptada.aplicada).toBe(true);
  });

  it('acepta aunque no exista evidencia de ranking guardada', async () => {
    // Degradacion declarada: el estado de ruteo vive en RAM hasta la 1.2, y
    // un reinicio lo borra. Si la falta de evidencia bloqueara la aceptacion,
    // reiniciar core dejaria al paramedico sin poder recibir un si. El guard
    // cierra la carrera igual; lo unico que se pierde es la fila de auditoria,
    // y eso queda dicho en el log en vez de inventarse.
    const { servicio } = montar();

    const r = await servicio.procesarRespuesta({
      handshakeId: 'hs-1',
      decision: 'aceptado',
    });

    expect(r.aplicada).toBe(true);
    expect(r.codigo).toBeUndefined();
  });
});
