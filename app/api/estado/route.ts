/**
 * GET /api/estado — estado vivo del sistema.
 *
 * Lo consumen la consola del hospital (/hospital) y el tablero del CRUE
 * (/crue) haciendo polling cada 2s.
 *
 * Sí, polling. Es deliberado: Supabase Realtime es mejor, pero exige que
 * la DB este configurada. Esto funciona desde el minuto 0 sin nada.
 * Juan/Zaid: si les sobra tiempo despues de H20, cambien a Realtime.
 * Si no les sobra, esto se ve identico en el demo.
 *
 * GET /api/estado?casoId=xxx  → filtra a un solo caso
 */

import { NextResponse } from "next/server";
import { listarCasos, listarHandshakes, historialSede } from "@/lib/almacen";
import { todasLasSedes } from "@/lib/db";
import { indiceCongestion, etiquetaCongestion } from "@/lib/congestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const casoId = searchParams.get("casoId") ?? undefined;

  const casos = listarCasos();
  const handshakes = listarHandshakes(casoId);
  const sedes = await todasLasSedes();

  // Estado de congestion por sede, para pintar el mapa de calor.
  const congestion = sedes.map((s) => {
    const c = indiceCongestion(s);
    const hist = historialSede(s.codigo);
    return {
      codigo: s.codigo,
      nombre: s.nombre,
      indice: c,
      etiqueta: etiquetaCongestion(c),
      aceptados: hist.aceptados,
      rechazados: hist.rechazados,
    };
  });

  return NextResponse.json({
    casos: casoId ? casos.filter((c) => c.id === casoId) : casos,
    handshakes,
    congestion,
    ts: new Date().toISOString(),
  });
}
