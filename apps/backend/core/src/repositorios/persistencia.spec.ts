/**
 * Tarea 1.2 · persistir `caso` y `handshake`.
 *
 * Era "el hallazgo más grave de todo el análisis": al reiniciar core se
 * perdían los casos, los handshakes, el historial de aceptación por sede, la
 * ventana de rechazos de 6 h y las latencias. El "dataset que se auto-etiqueta"
 * vivía en la RAM de un proceso y un Ctrl+C lo borraba.
 */

import { Test } from '@nestjs/testing';
import { AlmacenService } from '../almacen/almacen.service';
import type { Caso, Handshake } from '../contracts/types';
import { MemoriaRepositorio } from './memoria.repositorio';
import { REPOSITORIO, type RepositorioPulso } from './repositorio';

const AHORA = '2026-08-22T20:00:00.000Z';

function caso(id = 'caso-1'): Caso {
  return {
    id,
    resumen: 'IAM con supra ST',
    triage: 2,
    dxCie10: 'I21.1',
    dxDescripcion: 'Infarto',
    serviciosRequeridos: [743, 110],
    complejidadRequerida: 'alta',
    edad: 54,
    sexo: 'M',
    signosAlarma: [],
    requiereMedicoABordo: true,
    confianza: 0.9,
    textoCrudo: 'dictado',
    telefonoReporta: '573001',
    origen: { lat: 4.6, lng: -74.08 },
    tipoMovil: 'TAM',
    unidad: null,
    creadoEn: AHORA,
  };
}

function handshake(over: Partial<Handshake> = {}): Handshake {
  return {
    id: 'h1',
    casoId: 'caso-1',
    sedeCodigo: 'S1',
    canal: 'telegram',
    estado: 'enviado',
    motivoRechazo: null,
    enviadoEn: AHORA,
    expiraEn: AHORA,
    respondidoEn: null,
    latenciaS: null,
    ...over,
  };
}

/** Levanta un AlmacenService contra un repositorio dado, como lo hace Nest. */
async function almacenCon(repo: RepositorioPulso): Promise<AlmacenService> {
  const modulo = await Test.createTestingModule({
    providers: [AlmacenService, { provide: REPOSITORIO, useValue: repo }],
  }).compile();
  await modulo.init(); // dispara onModuleInit → hidratación
  return modulo.get(AlmacenService);
}

describe('AlmacenService con repositorio', () => {
  // ── Lo que la tarea pide demostrar ─────────────────────────────

  it('reiniciar core NO pierde casos ni handshakes', async () => {
    const repo = new MemoriaRepositorio();

    const antes = await almacenCon(repo);
    antes.guardarCaso(caso());
    antes.guardarHandshake(handshake());

    // "Reiniciar" = un AlmacenService nuevo contra el MISMO repositorio.
    const despues = await almacenCon(repo);

    expect(despues.obtenerCaso('caso-1')).toBeDefined();
    expect(despues.obtenerHandshake('h1')).toBeDefined();
  });

  it('pAceptación sobrevive al reinicio', async () => {
    // Es el corazón de la tesis del producto: el rechazo es el sensor. Si el
    // historial no sobrevive, el sistema vuelve a no saber nada en cada deploy.
    const repo = new MemoriaRepositorio();

    const antes = await almacenCon(repo);
    antes.guardarHandshake(
      handshake({ estado: 'rechazado', respondidoEn: AHORA, latenciaS: 42 }),
    );

    const despues = await almacenCon(repo);

    expect(despues.historialSede('S1')).toEqual({ aceptados: 0, rechazados: 1 });
    expect(despues.latenciasRespuestaMin('S1')).toEqual([0.7]);
  });

  it('la ventana de rechazos se reconstruye, no se pierde', async () => {
    const repo = new MemoriaRepositorio();
    const reciente = new Date().toISOString();

    const antes = await almacenCon(repo);
    antes.guardarHandshake(
      handshake({ estado: 'rechazado', respondidoEn: reciente }),
    );

    const despues = await almacenCon(repo);
    expect(despues.rechazosEnVentana('S1', 6)).toBe(1);
  });

  it('un handshake sin responder no cuenta como aceptado ni rechazado', async () => {
    const repo = new MemoriaRepositorio();
    const antes = await almacenCon(repo);
    antes.guardarHandshake(handshake({ estado: 'enviado' }));

    const despues = await almacenCon(repo);
    expect(despues.historialSede('S1')).toEqual({ aceptados: 0, rechazados: 0 });
  });

  it('sin repositorio inyectado sigue funcionando en memoria', async () => {
    // La regla del repo: nada revienta por falta de credenciales.
    const solo = new AlmacenService();
    solo.guardarCaso(caso());
    expect(solo.obtenerCaso('caso-1')).toBeDefined();
  });

  // ── La superficie no cambió ────────────────────────────────────

  it('las lecturas siguen siendo síncronas', async () => {
    // Dieciséis archivos dependen de esto. Si alguna devuelve una promesa,
    // todos empiezan a comparar objetos Promise contra undefined y NO fallan
    // ruidosamente: fallan raro.
    const a = await almacenCon(new MemoriaRepositorio());
    a.guardarCaso(caso());
    for (const v of [
      a.obtenerCaso('caso-1'),
      a.listarCasos(),
      a.listarHandshakes(),
      a.historialSede('S1'),
      a.rechazosEnVentana('S1'),
      a.latenciasRespuestaMin('S1'),
    ]) {
      expect(v).not.toBeInstanceOf(Promise);
    }
  });

  // ── Robustez ───────────────────────────────────────────────────

  it('si el repositorio no carga, arranca igual con la caché vacía', async () => {
    // Un core que no levanta es peor que uno sin historia.
    const roto: RepositorioPulso = {
      clase: 'postgres',
      cargar: () => Promise.reject(new Error('base caída')),
      guardarCaso: () => Promise.resolve(),
      guardarHandshake: () => Promise.resolve(),
      limpiar: () => Promise.resolve(),
    };

    const a = await almacenCon(roto);
    expect(a.listarCasos()).toEqual([]);
    a.guardarCaso(caso());
    expect(a.obtenerCaso('caso-1')).toBeDefined();
  });

  it('si una escritura falla, el turno sigue', async () => {
    // La caché ya tiene el dato: lo que se pierde es la durabilidad de ESA
    // fila, y queda en el log. Tumbar el despacho sería peor.
    const roto: RepositorioPulso = {
      clase: 'postgres',
      cargar: () => Promise.resolve({ casos: [], handshakes: [] }),
      guardarCaso: () => Promise.reject(new Error('sin conexión')),
      guardarHandshake: () => Promise.resolve(),
      limpiar: () => Promise.resolve(),
    };

    const a = await almacenCon(roto);
    expect(() => a.guardarCaso(caso())).not.toThrow();
    expect(a.obtenerCaso('caso-1')).toBeDefined();
  });

  it('guardar dos veces el mismo caso no lo duplica', async () => {
    const repo = new MemoriaRepositorio();
    const a = await almacenCon(repo);
    a.guardarCaso(caso());
    a.guardarCaso(caso());

    const { casos } = await repo.cargar();
    expect(casos).toHaveLength(1);
  });

  it('reiniciarTodo también limpia el repositorio', async () => {
    // Si no, "estado limpio antes de subir al escenario" no limpia nada y en
    // el pitch reaparecen los casos de las pruebas.
    const repo = new MemoriaRepositorio();
    const a = await almacenCon(repo);
    a.guardarCaso(caso());
    a.reiniciarTodo();

    await new Promise((r) => setImmediate(r)); // el borrado no bloquea
    const { casos } = await repo.cargar();
    expect(casos).toEqual([]);
  });
});
