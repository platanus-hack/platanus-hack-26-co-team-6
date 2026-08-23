/**
 * Lo único que este módulo tiene que garantizar es el interruptor: apagado
 * por defecto. Un demo vacío se arregla en diez segundos; producción con 120
 * pacientes inventados en el tablero, no.
 */

import { ConfigService } from '@nestjs/config';
import { AlmacenService } from '../almacen/almacen.service';
import { SemillasDemoService } from './semillas-demo.service';
import { CASOS_DEMO, HANDSHAKES_DEMO, ESCALAMIENTOS_DEMO } from './catalogo-demo.generado';

const config = (valor?: string) =>
  ({ get: () => valor }) as unknown as ConfigService;

describe('SemillasDemoService', () => {
  it('sin la bandera no carga nada', () => {
    const almacen = new AlmacenService();
    new SemillasDemoService(config(undefined), almacen).onModuleInit();
    expect(almacen.listarCasos()).toHaveLength(0);
    expect(almacen.listarHandshakes()).toHaveLength(0);
  });

  it("'1', 'si' o 'TRUE' no encienden el demo: solo el literal 'true'", () => {
    for (const valor of ['1', 'si', 'TRUE', 'yes']) {
      const almacen = new AlmacenService();
      new SemillasDemoService(config(valor), almacen).onModuleInit();
      expect(almacen.listarCasos()).toHaveLength(0);
    }
  });

  it('con la bandera carga el turno completo', () => {
    const almacen = new AlmacenService();
    new SemillasDemoService(config('true'), almacen).onModuleInit();
    expect(almacen.listarCasos()).toHaveLength(CASOS_DEMO.length);
    expect(almacen.listarHandshakes()).toHaveLength(HANDSHAKES_DEMO.length);
    expect(almacen.listarEscalamientos()).toHaveLength(ESCALAMIENTOS_DEMO.length);
  });

  it('rehidrata el historial de aceptación: sin eso el ranking no aprendió nada', () => {
    const almacen = new AlmacenService();
    new SemillasDemoService(config('true'), almacen).onModuleInit();
    const respondidos = HANDSHAKES_DEMO.filter(
      (h) => h.estado === 'aceptado' || h.estado === 'rechazado',
    );
    const total = new Set(respondidos.map((h) => h.sedeCodigo));
    const sumado = [...total].reduce((acc, codigo) => {
      const h = almacen.historialSede(codigo);
      return acc + h.aceptados + h.rechazados;
    }, 0);
    expect(sumado).toBe(respondidos.length);
  });

  it('cargar dos veces no duplica el turno', () => {
    const almacen = new AlmacenService();
    const svc = new SemillasDemoService(config('true'), almacen);
    svc.onModuleInit();
    svc.cargar();
    expect(almacen.listarCasos()).toHaveLength(CASOS_DEMO.length);
  });

  it('el resumen dice que son sintéticos y no filtra ni un caso', () => {
    const almacen = new AlmacenService();
    const svc = new SemillasDemoService(config('true'), almacen);
    svc.onModuleInit();
    const r = svc.resumen();
    expect(r.activo).toBe(true);
    expect(r.advertencia).toMatch(/sinteticos/i);
    expect(JSON.stringify(r)).not.toContain('CAS-0001');
  });

  it('los datos generados cumplen el contrato que el demo promete', () => {
    // Rebotes y escalamiento no son adorno: son las dos pantallas que cuentan
    // la historia. Si el generador deja de producirlos, el demo se cae y esto
    // tiene que avisarlo antes que el escenario.
    const conRebote = new Set(
      HANDSHAKES_DEMO.filter((h) => h.estado !== 'aceptado').map((h) => h.casoId),
    );
    expect(conRebote.size / CASOS_DEMO.length).toBeGreaterThanOrEqual(0.25);
    expect(ESCALAMIENTOS_DEMO.length / CASOS_DEMO.length).toBeGreaterThanOrEqual(0.08);

    // Un IAM sin hemodinamia (743, NO 408 que es radioterapia) es un caso que
    // el ranking resuelve mal y nadie lo nota mirando la pantalla.
    for (const c of CASOS_DEMO.filter((c) => c.dxCie10?.startsWith('I21'))) {
      expect(c.serviciosRequeridos).toContain(743);
      expect(c.serviciosRequeridos).not.toContain(408);
      expect(c.triage).toBe(1);
    }

    // Coordenadas dentro de la caja de Bogotá: un origen en el Atlántico se ve
    // en el mapa del CRUE y arruina el demo en vivo.
    for (const c of CASOS_DEMO) {
      expect(c.origen.lat).toBeGreaterThan(3.9);
      expect(c.origen.lat).toBeLessThan(5.1);
      expect(c.origen.lng).toBeGreaterThan(-75);
      expect(c.origen.lng).toBeLessThan(-73.5);
    }

    // Un TAB no traslada a quien necesita médico a bordo (filtro duro).
    for (const c of CASOS_DEMO) {
      if (c.requiereMedicoABordo) expect(c.tipoMovil).toBe('TAM');
    }
  });
});
