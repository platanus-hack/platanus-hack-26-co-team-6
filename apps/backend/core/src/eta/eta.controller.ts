/**
 * POST /ruta — cómo llegar al destino aceptado.
 *
 * Existe para que /campo pueda conducir: geometría para el mapa y maniobras
 * en español para el que va al volante.
 *
 * ── POR QUÉ PASA POR CORE Y NO VA DIRECTO A MAPBOX ────────────────
 * El navegador ya tiene un token público de Mapbox para pintar el mapa, así
 * que técnicamente podría llamar a Directions por su cuenta. Se hace aquí por
 * dos razones: el token del servidor es el que tiene cuota de Directions y no
 * está expuesto a que alguien lo saque del bundle y lo gaste, y el destino se
 * resuelve contra el catálogo REPS — el cliente manda un código de sede, no
 * unas coordenadas que podría inventarse.
 */

import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Coordenada } from '../contracts/types';
import { SedesService } from '../sedes/sedes.service';
import { EtaService, type RutaNavegable } from './eta.service';

interface RutaRequest {
  origen: Coordenada;
  sedeCodigo: string;
}

export interface RutaResponse extends RutaNavegable {
  destino: {
    codigo: string;
    nombre: string;
    direccion: string;
    telefono: string | null;
    coord: Coordenada;
  };
}

@Controller('ruta')
export class EtaController {
  constructor(
    private readonly eta: EtaService,
    private readonly sedes: SedesService,
  ) {}

  @Post()
  async calcular(@Body() cuerpo: RutaRequest): Promise<RutaResponse> {
    const { origen, sedeCodigo } = cuerpo ?? {};
    if (
      typeof origen?.lat !== 'number' ||
      typeof origen?.lng !== 'number' ||
      !sedeCodigo
    ) {
      throw new BadRequestException('Faltan origen { lat, lng } o sedeCodigo');
    }

    const sede = await this.sedes.porCodigo(sedeCodigo);
    if (!sede) throw new NotFoundException('Sede no encontrada');

    const ruta = await this.eta.navegacion(origen, sede.coord);
    if (!ruta) {
      // 503 y no 500: sin MAPBOX_TOKEN no hay ruta que calcular, y eso no es
      // un bug — es una capacidad ausente. La UI lo lee así y ofrece abrir la
      // navegación del teléfono en vez de mostrar un error rojo.
      throw new ServiceUnavailableException(
        'Ruteo no disponible: falta MAPBOX_TOKEN o Directions no respondió',
      );
    }

    return {
      ...ruta,
      destino: {
        codigo: sede.codigo,
        nombre: sede.nombre,
        direccion: sede.direccion,
        telefono: sede.telefono,
        coord: sede.coord,
      },
    };
  }
}
