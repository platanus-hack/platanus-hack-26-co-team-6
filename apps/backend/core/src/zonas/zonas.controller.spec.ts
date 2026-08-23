/**
 * `GET /zonas` — la grilla H3.
 *
 * No son las localidades: son hexágonos parametrizables, del tamaño que una
 * ambulancia cubre en minutos. Si este endpoint devuelve otra cosa, el mapa
 * pinta una ciudad que no existe y el reparto manda unidades a un páramo.
 */

import { Test } from '@nestjs/testing';
import { ZonasController } from './zonas.controller';

describe('ZonasController', () => {
  let ctrl: ZonasController;

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [ZonasController],
    }).compile();
    ctrl = m.get(ZonasController);
  });

  it('devuelve la grilla de hexágonos', () => {
    const r = ctrl.zonas();
    expect(r.total).toBeGreaterThan(1000);
    expect(r.resolucion).toBe(8);
  });

  it('ningún hexágono tiene demanda cero', () => {
    // Sumapaz son 780 km² rurales sin una sola llamada del 123 en el mes:
    // 1.008 hexágonos, el 47% de la grilla. Una zona sin demanda no es una
    // zona de cobertura, e incluirla le daría cupo a un páramo.
    for (const z of ctrl.zonas().zonas) {
      expect(z.demandaRelativa).toBeGreaterThan(0);
    }
  });

  it('la demanda relativa suma 1', () => {
    const total = ctrl.zonas().zonas.reduce((a, z) => a + z.demandaRelativa, 0);
    expect(total).toBeGreaterThan(0.98);
    expect(total).toBeLessThan(1.02);
  });

  it('la densidad ordena distinto que el conteo', () => {
    // Los Mártires tiene MENOS llamadas que Kennedy y MÁS por km². Estacionar
    // por conteo en vez de por densidad te ubica mal.
    const porLocalidad = new Map<string, number>();
    for (const z of ctrl.zonas().zonas) porLocalidad.set(z.localidad, z.densidad);
    const top = [...porLocalidad.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(top[0]).toBe('LOS MARTIRES');
  });

  it('todo hexágono cae dentro de Bogotá', () => {
    // Un centroide fuera del recuadro manda una ambulancia al mar.
    for (const z of ctrl.zonas().zonas) {
      expect(z.centroide.lat).toBeGreaterThan(4.0);
      expect(z.centroide.lat).toBeLessThan(4.9);
      expect(z.centroide.lng).toBeGreaterThan(-74.4);
      expect(z.centroide.lng).toBeLessThan(-73.9);
    }
  });

  it('se puede filtrar por localidad', () => {
    const r = ctrl.zonas('kennedy');
    expect(r.total).toBeGreaterThan(0);
    expect(r.zonas.every((z) => z.localidad === 'KENNEDY')).toBe(true);
  });

  it('una localidad que no existe devuelve vacío, no error', () => {
    expect(ctrl.zonas('MEDELLIN').total).toBe(0);
  });

  it('los polígonos oficiales traen las 20 localidades', () => {
    const g = ctrl.localidades() as { features: unknown[] };
    expect(g.features).toHaveLength(20);
  });

  it('declara que la demanda se reparte uniforme dentro de la localidad', () => {
    // Presentar el mapa como medido cuando es interpolado es lo que un
    // jurado técnico caza.
    expect(String(ctrl.zonas()._advertencia)).toContain('UNIFORME');
  });

  it('cachea: dos lecturas no vuelven a tocar el disco', () => {
    expect(ctrl.zonas().zonas).toBe(ctrl.zonas().zonas);
  });
});
