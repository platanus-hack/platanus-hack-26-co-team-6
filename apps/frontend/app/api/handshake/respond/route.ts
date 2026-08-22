/**
 * POST /api/handshake/respond — CARRIL DE SEBAS
 *
 * La logica real vive en lib/handshake.ts (un route.ts no puede exportar
 * funciones extra sin romper el build de Next). Este archivo solo traduce
 * HTTP ↔ dominio.
 */

import { NextResponse } from "next/server";
import type { RespondRequest } from "@/lib/types";
import { procesarRespuesta } from "@/lib/handshake";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let cuerpo: RespondRequest;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!cuerpo.handshakeId || !cuerpo.decision) {
    return NextResponse.json(
      { error: "Faltan handshakeId o decision" },
      { status: 400 }
    );
  }

  const resultado = await procesarRespuesta(cuerpo);
  if ("error" in resultado) {
    return NextResponse.json(
      { error: resultado.error },
      { status: resultado.status ?? 400 }
    );
  }
  return NextResponse.json(resultado);
}
