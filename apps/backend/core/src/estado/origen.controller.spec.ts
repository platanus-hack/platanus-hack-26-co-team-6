/**
 * GET /casos/:id/origen — el contrato de privacidad, probado.
 *
 * Lo que importa no es que devuelva coordenadas: es que las devuelva SOLO por
 * caso nombrado, y que el "no existe" no cuente historias.
 */

import { NotFoundException } from '@nestjs/common';
import { OrigenController } from './origen.controller';
import type { AlmacenService } from '../almacen/almacen.service';
import type { Caso } from '../contracts/types';

const CASO = {
  id: 'CAS-1',
  origen: { lat: 4.61, lng: -74.08 },
  textoCrudo: 'dictado literal que jamas debe salir por aqui',
} as unknown as Caso;

function controlador(caso: Caso | undefined): OrigenController {
  const almacen = { obtenerCaso: () => caso } as unknown as AlmacenService;
  return new OrigenController(almacen);
}

describe('OrigenController', () => {
  it('devuelve el origen del caso nombrado, y nada mas', () => {
    const r = controlador(CASO).origen('CAS-1');
    expect(r).toEqual({ casoId: 'CAS-1', origen: { lat: 4.61, lng: -74.08 } });
    // La respuesta es un objeto nuevo con dos campos: si alguien devolviera el
    // caso entero "por comodidad", textoCrudo saldria con el. Este assert es
    // la version barata del patron de despojar(): la fuga no compila... aqui,
    // no se serializa.
    expect(JSON.stringify(r)).not.toContain('dictado');
  });

  it('un caso desconocido es 404 sin distinguir "no existe" de "se reinicio"', () => {
    expect(() => controlador(undefined).origen('CAS-9')).toThrow(
      NotFoundException,
    );
  });
});
