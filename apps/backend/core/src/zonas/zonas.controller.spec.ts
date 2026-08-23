/**
 * `GET /zonas` — el mapa de calor.
 *
 * El dato no es una estimación: son las 9.206 llamadas del NUSE 123. Si este
 * endpoint devuelve algo distinto, el mapa pinta una ciudad que no existe.
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

  it('devuelve las 19 localidades con demanda', () => {
    // Una localidad que se cae del mapa no da error: simplemente nadie la ve.
    expect(ctrl.demanda().zonas).toHaveLength(19);
  });

  it('la demanda relativa suma 1', () => {
    const total = ctrl.demanda().zonas.reduce((a, z) => a + z.demandaRelativa, 0);
    expect(total).toBeGreaterThan(0.98);
    expect(total).toBeLessThan(1.02);
  });

  it('Kennedy es la de más demanda, con ~15%', () => {
    const top = ctrl
      .demanda()
      .zonas.reduce((a, b) => (a.demandaRelativa > b.demandaRelativa ? a : b));
    expect(top.nombre).toBe('KENNEDY');
    expect(top.demandaRelativa).toBeGreaterThan(0.14);
  });

  it('toda zona trae centroide utilizable', () => {
    for (const z of ctrl.demanda().zonas) {
      // Bogotá cabe holgadamente en este recuadro. Un centroide fuera de él
      // pone una ambulancia en el mar.
      expect(z.centroide.lat).toBeGreaterThan(4.0);
      expect(z.centroide.lat).toBeLessThan(4.9);
      expect(z.centroide.lng).toBeGreaterThan(-74.4);
      expect(z.centroide.lng).toBeLessThan(-73.9);
    }
  });

  it('trae la curva por hora para animar el mapa', () => {
    const z = ctrl.demanda().zonas[0];
    expect(z.porHora).toHaveLength(24);
    expect(z.horaPico).toBeGreaterThanOrEqual(0);
  });

  it('declara que los centroides son aproximados', () => {
    // Pintar un punto aproximado con la misma tipografía que uno exacto
    // miente por omisión. La consola tiene que poder decirlo.
    expect(ctrl.demanda().geometria).toBe('centroide-aproximado');
  });

  it('los nombres van en ASCII, como los normaliza el ETL', () => {
    // El CSV del 123 tiene codificación mixta: una clave con tilde no cruza y
    // esa localidad desaparece del mapa en silencio.
    for (const z of ctrl.demanda().zonas) {
      expect(z.nombre).toMatch(/^[A-Z ]+$/);
    }
  });

  it('cachea: dos lecturas no vuelven a tocar el disco', () => {
    expect(ctrl.demanda().zonas).toBe(ctrl.demanda().zonas);
  });
});
