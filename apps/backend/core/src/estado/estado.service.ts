/**
 * Estado vivo del sistema.
 *
 * Lo consumen la consola del hospital (/hospital) y el tablero del CRUE
 * (/crue) haciendo polling cada 2s.
 *
 * Sí, polling. Es deliberado: Supabase Realtime es mejor, pero exige que la DB
 * esté configurada. Esto funciona desde el minuto 0 sin nada. Si sobra tiempo
 * después de H20, cámbienlo a Realtime; si no sobra, se ve idéntico en el demo.
 */

import { Injectable } from '@nestjs/common';
import type { Caso, Handshake } from '../contracts/types';
import { AlmacenService } from '../almacen/almacen.service';
import { SedesService } from '../sedes/sedes.service';
import { CongestionService } from '../scoring/congestion.service';

export interface CongestionSede {
  codigo: string;
  nombre: string;
  indice: number;
  etiqueta: 'baja' | 'media' | 'alta' | 'crítica';
  aceptados: number;
  rechazados: number;
}

export interface EstadoResponse {
  casos: Caso[];
  handshakes: Handshake[];
  congestion: CongestionSede[];
  ts: string;
}

@Injectable()
export class EstadoService {
  constructor(
    private readonly almacen: AlmacenService,
    private readonly sedes: SedesService,
    private readonly congestion: CongestionService,
  ) {}

  async instantanea(casoId?: string): Promise<EstadoResponse> {
    const casos = this.almacen.listarCasos();
    const handshakes = this.almacen.listarHandshakes(casoId);
    const sedes = await this.sedes.todas();

    // Estado de congestión por sede, para pintar el mapa de calor.
    const congestion = sedes.map((s) => {
      const c = this.congestion.indice(s);
      const hist = this.almacen.historialSede(s.codigo);
      return {
        codigo: s.codigo,
        nombre: s.nombre,
        indice: c,
        etiqueta: this.congestion.etiqueta(c),
        aceptados: hist.aceptados,
        rechazados: hist.rechazados,
      };
    });

    return {
      casos: casoId ? casos.filter((c) => c.id === casoId) : casos,
      handshakes,
      congestion,
      ts: new Date().toISOString(),
    };
  }
}
