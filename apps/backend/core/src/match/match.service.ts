/**
 * Caso → ranking de sedes. CARRIL DE ZAID (candidatos) + NEID (score).
 *
 * Los tres pasos, en este orden:
 *   1. Zaid — sedes en el radio (PostGIS ST_DWithin, o semillas)
 *   2. Zaid — ETA real con tráfico (Mapbox Matrix, pre-filtrado a MAX_DESTINOS)
 *   3. Neid — filtro duro + score en minutos (ScoringService)
 */

import { Injectable } from '@nestjs/common';
import type { Caso, MatchResponse } from '../contracts/types';
import { serviciosFaltantes } from '../catalogo/servicios-reps';
import { distanciaKm } from '../common/geo';
import { AlmacenService } from '../almacen/almacen.service';
import { SedesService } from '../sedes/sedes.service';
import { EtaService } from '../eta/eta.service';
import { ScoringService } from '../scoring/scoring.service';

/** Incompatibles más cercanas que igual mandamos a calcular ETA. Ver abajo. */
const VITRINA_DESCARTADAS = 3;

@Injectable()
export class MatchService {
  constructor(
    private readonly sedes: SedesService,
    private readonly eta: EtaService,
    private readonly scoring: ScoringService,
    private readonly almacen: AlmacenService,
  ) {}

  async rankear(
    caso: Caso,
    limite = 5,
    radioKm = 25,
  ): Promise<MatchResponse> {
    const t0 = Date.now();

    // 1. Universo de sedes en el radio.
    const todas = await this.sedes.cercanas(
      caso.origen.lat,
      caso.origen.lng,
      radioKm,
    );

    // Una sede que YA rechazó a ESTE paciente sale del ranking. No se le
    // pregunta dos veces al mismo hospital por el mismo caso: eso es
    // exactamente el "paseo de la muerte" que venimos a eliminar.
    // (El rechazo igual quedó registrado y sigue moviendo su congestión para
    // los casos siguientes — ver HandshakeService.)
    const yaRechazaron = new Set(
      this.almacen
        .listarHandshakes(caso.id)
        .filter((h) => h.estado === 'rechazado' || h.estado === 'timeout')
        .map((h) => h.sedeCodigo),
    );
    const sedes = todas.filter((s) => !yaRechazaron.has(s.codigo));

    // 2. ETA con tráfico.
    //
    //    ⚠️ NO mandamos SOLO las compatibles. A propósito incluimos las 3
    //    incompatibles más cercanas, porque el momento más fuerte del demo es
    //    ver una clínica a 4 minutos TACHADA por no tener hemodinamia. Esa
    //    tarjeta en gris explica el producto entero sin decir una palabra. Si
    //    solo mandáramos las compatibles, nadie vería lo que se descartó.
    const compatibles = sedes.filter(
      (s) =>
        serviciosFaltantes(s.servicios, caso.serviciosRequeridos).length === 0,
    );
    const setCompatibles = new Set(compatibles.map((s) => s.codigo));
    const incompatibles = sedes
      .filter((s) => !setCompatibles.has(s.codigo))
      .map((s) => ({
        s,
        d: distanciaKm(caso.origen.lat, caso.origen.lng, s.coord.lat, s.coord.lng),
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, VITRINA_DESCARTADAS)
      .map((x) => x.s);

    const paraEta = [...compatibles, ...incompatibles];

    const etas = await this.eta.matriz(
      caso.origen,
      paraEta.map((s) => ({ codigo: s.codigo, coord: s.coord })),
    );

    // 3. Filtro duro + score.
    const candidatos = this.scoring.rankear(
      caso,
      paraEta,
      etas.map((e) => ({
        codigo: e.codigo,
        etaMin: e.etaMin,
        distKm: e.distKm,
      })),
      { limite },
    );

    return {
      candidatos,
      evaluadas: sedes.length,
      compatibles: compatibles.length,
      latenciaMs: Date.now() - t0,
    };
  }
}
