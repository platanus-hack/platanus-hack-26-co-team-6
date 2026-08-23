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

  /**
   * `POST /ruta/tramo` — ruta entre dos coordenadas cualesquiera.
   *
   * El `POST /ruta` de arriba exige un código de sede, y con razón: para el
   * traslado B→C el destino es un hospital del catálogo y no unas
   * coordenadas que el cliente podría inventarse.
   *
   * Pero el turno tiene otras dos patas que NO van a una sede: A→B (hacia el
   * paciente) y C→D (hacia la zona a cubrir). Para esas hace falta esto.
   *
   * Sigue pasando por core porque el token con cuota de Directions es el del
   * servidor, no el público del navegador.
   */
  @Post('tramo')
  async tramo(
    @Body() cuerpo: { origen?: Coordenada; destino?: Coordenada },
  ): Promise<RutaNavegable & { direccionDestino: string | null }> {
    const { origen, destino } = cuerpo ?? {};
    if (
      typeof origen?.lat !== 'number' ||
      typeof origen?.lng !== 'number' ||
      typeof destino?.lat !== 'number' ||
      typeof destino?.lng !== 'number'
    ) {
      throw new BadRequestException('Faltan origen y destino { lat, lng }');
    }

    const nav = await this.eta.navegacion(origen, destino);
    if (!nav) {
      throw new ServiceUnavailableException(
        'Sin MAPBOX_TOKEN no hay geometría de ruta',
      );
    }
    // La dirección viaja con la ruta: quien pide el tramo casi siempre la
    // necesita para decirle al paramédico a dónde va, y son dos llamadas a
    // Mapbox que conviene hacer juntas.
    return { ...nav, direccionDestino: await this.eta.direccionDe(destino) };
  }

  /**
   * `POST /ruta/direccion` — coordenadas → dirección legible.
   *
   * Un paramédico al volante no teclea «4.628, -74.155».
   */
  @Post('direccion')
  async direccion(
    @Body() cuerpo: { coord?: Coordenada },
  ): Promise<{ direccion: string | null }> {
    const c = cuerpo?.coord;
    if (typeof c?.lat !== 'number' || typeof c?.lng !== 'number') {
      throw new BadRequestException('Falta coord { lat, lng }');
    }
    return { direccion: await this.eta.direccionDe(c) };
  }

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
