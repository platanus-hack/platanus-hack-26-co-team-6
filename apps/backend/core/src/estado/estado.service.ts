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
import type {
  Caso,
  CasoPublico,
  Coordenada,
  Escalamiento,
  Handshake,
} from '../contracts/types';
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
  /** Opcional (regla de contrato: campos nuevos siempre opcionales).
   *  La consume el mapa de red de /crue. */
  coord?: Coordenada;
}

export interface EstadoResponse {
  casos: CasoPublico[];
  handshakes: Handshake[];
  congestion: CongestionSede[];
  /** Casos que el ruteo automatico no cerro y esperan a un regulador. */
  escalamientos: Escalamiento[];
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
        coord: s.coord,
      };
    });

    const visibles = casoId ? casos.filter((c) => c.id === casoId) : casos;

    return {
      casos: visibles.map(despojar),
      handshakes,
      congestion,
      escalamientos: this.almacen.listarEscalamientos(casoId),
      ts: new Date().toISOString(),
    };
  }
}

/**
 * Lo que sale del caso hacia las consolas.
 *
 * Es una LISTA BLANCA, no un `delete` de lo sensible: se nombra lo que sale,
 * no lo que se esconde. Quedan fuera `textoCrudo` (el dictado literal del
 * paramédico) y `origen` (las coordenadas de recogida del paciente).
 *
 * Escrito así a propósito, y no con `...resto`: si alguien agrega un campo a
 * `Caso`, `CasoPublico` lo exige y **esta función deja de compilar**. Obliga a
 * decidir, campo por campo, si ese dato puede salir del servidor. Con rest
 * spread entraría solo y en silencio, que es exactamente cómo se filtró antes.
 */
function despojar(caso: Caso): CasoPublico {
  return {
    id: caso.id,
    resumen: caso.resumen,
    triage: caso.triage,
    dxCie10: caso.dxCie10,
    dxDescripcion: caso.dxDescripcion,
    serviciosRequeridos: caso.serviciosRequeridos,
    complejidadRequerida: caso.complejidadRequerida,
    edad: caso.edad,
    sexo: caso.sexo,
    signosAlarma: caso.signosAlarma,
    requiereMedicoABordo: caso.requiereMedicoABordo,
    confianza: caso.confianza,
    tipoMovil: caso.tipoMovil,
    // SÍ sale, y es el punto: el regulador del CRUE tiene que saber QUÉ móvil
    // está preguntando para poder llamarlo por radio. No identifica al
    // paciente ni dice dónde está — dice quién pregunta, que es justo lo que
    // hoy se resuelve gritando por la frecuencia.
    unidad: caso.unidad,
    creadoEn: caso.creadoEn,
  };
}
