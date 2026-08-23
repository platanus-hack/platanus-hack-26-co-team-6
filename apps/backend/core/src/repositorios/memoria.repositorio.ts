/**
 * Repositorio en memoria. El modo por defecto, sin credenciales.
 *
 * No es un stub: es el modo en que corre el demo y en que trabaja quien no
 * tiene Postgres. Guarda de verdad — lo único que no hace es sobrevivir al
 * reinicio, que es exactamente lo que se espera de él.
 */

import { Injectable } from '@nestjs/common';
import type { Caso, Handshake } from '../contracts/types';
import type { Instantanea, RepositorioPulso } from './repositorio';

@Injectable()
export class MemoriaRepositorio implements RepositorioPulso {
  readonly clase = 'memoria' as const;

  private readonly casos = new Map<string, Caso>();
  private readonly handshakes = new Map<string, Handshake>();

  cargar(): Promise<Instantanea> {
    return Promise.resolve({
      casos: [...this.casos.values()],
      handshakes: [...this.handshakes.values()],
    });
  }

  guardarCaso(caso: Caso): Promise<void> {
    this.casos.set(caso.id, caso);
    return Promise.resolve();
  }

  guardarHandshake(h: Handshake): Promise<void> {
    this.handshakes.set(h.id, h);
    return Promise.resolve();
  }

  limpiar(): Promise<void> {
    this.casos.clear();
    this.handshakes.clear();
    return Promise.resolve();
  }
}
