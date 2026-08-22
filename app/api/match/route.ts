/**
 * POST /api/match — CARRIL DE ZAID (candidatos) + NEID (score)
 *
 * Caso → ranking de sedes.
 *
 * Los tres pasos, en este orden:
 *   1. Zaid   — sedes en el radio (PostGIS ST_DWithin, o mock)
 *   2. Zaid   — ETA real con trafico (Mapbox Matrix, pre-filtrado a MAX_DESTINOS)
 *   3. Neid   — filtro duro + score en minutos (lib/scoring.ts)
 */

import { NextResponse } from "next/server";
import type { MatchRequest, MatchResponse } from "@/lib/types";
import { sedesCercanas, distanciaKm } from "@/lib/db";
import { matrizEta } from "@/lib/mapbox";
import { rankear } from "@/lib/scoring";
import { serviciosFaltantes } from "@/lib/servicios-reps";
import { listarHandshakes } from "@/lib/almacen";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const t0 = Date.now();

  let cuerpo: MatchRequest;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { caso, limite = 5, radioKm = 25 } = cuerpo;
  if (!caso?.origen) {
    return NextResponse.json(
      { error: "Falta el caso o su origen" },
      { status: 400 }
    );
  }

  // 1. Universo de sedes en el radio.
  const todas = await sedesCercanas(caso.origen.lat, caso.origen.lng, radioKm);

  // Una sede que YA rechazó a ESTE paciente sale del ranking. No se le
  // pregunta dos veces al mismo hospital por el mismo caso: eso es
  // exactamente el "paseo de la muerte" que venimos a eliminar.
  // (El rechazo igual quedó registrado y sigue moviendo su congestión
  // para los casos siguientes — ver lib/handshake.ts.)
  const yaRechazaron = new Set(
    listarHandshakes(caso.id)
      .filter((h) => h.estado === "rechazado" || h.estado === "timeout")
      .map((h) => h.sedeCodigo)
  );
  const sedes = todas.filter((s) => !yaRechazaron.has(s.codigo));

  // 2. ETA con trafico.
  //
  //    ⚠️ NO mandamos SOLO las compatibles. A proposito incluimos las 3
  //    incompatibles mas cercanas, porque el momento mas fuerte del demo
  //    es ver una clinica a 4 minutos TACHADA por no tener hemodinamia.
  //    Esa tarjeta en gris explica el producto entero sin decir una palabra.
  //    Si solo mandaramos las compatibles, nadie veria lo que se descarto.
  const compatibles = sedes.filter(
    (s) => serviciosFaltantes(s.servicios, caso.serviciosRequeridos).length === 0
  );
  const incompatibles = sedes
    .filter((s) => !compatibles.includes(s))
    .map((s) => ({
      s,
      d: distanciaKm(caso.origen.lat, caso.origen.lng, s.coord.lat, s.coord.lng),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => x.s);

  const paraEta = [...compatibles, ...incompatibles];

  const etas = await matrizEta(
    caso.origen,
    paraEta.map((s) => ({ codigo: s.codigo, coord: s.coord }))
  );

  // 3. Filtro duro + score.
  const candidatos = rankear(
    caso,
    paraEta,
    etas.map((e) => ({ codigo: e.codigo, etaMin: e.etaMin, distKm: e.distKm })),
    { limite }
  );

  const respuesta: MatchResponse = {
    candidatos,
    evaluadas: sedes.length,
    compatibles: compatibles.length,
    latenciaMs: Date.now() - t0,
  };
  return NextResponse.json(respuesta);
}
