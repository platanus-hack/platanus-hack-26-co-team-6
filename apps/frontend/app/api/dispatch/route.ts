/**
 * POST /api/dispatch — CARRIL DE SEBAS
 *
 * Crea el handshake y dispara la notificacion al jefe de urgencias.
 * El reloj de latencia arranca aqui: es el numero del pitch.
 */

import { NextResponse } from "next/server";
import type { DispatchRequest, DispatchResponse, Handshake } from "@/lib/types";
import { obtenerCaso, guardarHandshake } from "@/lib/almacen";
import { sedePorCodigo } from "@/lib/db";
import { notificar } from "@/lib/canales";
import { matrizEta } from "@/lib/mapbox";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let cuerpo: DispatchRequest;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const caso = obtenerCaso(cuerpo.casoId);
  if (!caso) {
    return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
  }

  const sede = await sedePorCodigo(cuerpo.sedeCodigo);
  if (!sede) {
    return NextResponse.json({ error: "Sede no encontrada" }, { status: 404 });
  }

  const handshake: Handshake = {
    id: crypto.randomUUID(),
    casoId: caso.id,
    sedeCodigo: sede.codigo,
    canal: cuerpo.canal ?? "telegram",
    estado: "enviado",
    motivoRechazo: null,
    enviadoEn: new Date().toISOString(),
    respondidoEn: null,
    latenciaS: null,
  };

  guardarHandshake(handshake);

  const [eta] = await matrizEta(caso.origen, [
    { codigo: sede.codigo, coord: sede.coord },
  ]);
  const envio = await notificar(handshake, caso, sede, eta?.etaMin);
  console.log(`[pulso] handshake ${handshake.id} → ${envio.canal}`, envio.detalle ?? "");

  const respuesta: DispatchResponse = { handshake };
  return NextResponse.json(respuesta);
}
