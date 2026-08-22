/**
 * Capa de acceso a sedes.
 *
 * REGLA DE ORO DEL SCAFFOLD: si Supabase no esta configurado, esto NO
 * revienta — cae a las sedes mock y el resto del equipo sigue trabajando.
 * Cuando Zaid termine el ETL, se llena .env.local y esto empieza a leer
 * de la DB real sin que nadie mas toque una linea.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Sede } from "./types";
import { SEDES_MOCK } from "./mock";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function haySupabase(): boolean {
  return Boolean(URL && ANON);
}

let clienteServidor: SupabaseClient | null = null;

/** Cliente de servidor (service role). Solo usar en route handlers. */
export function supabaseServidor(): SupabaseClient | null {
  if (!URL || !(SERVICE || ANON)) return null;
  if (!clienteServidor) {
    clienteServidor = createClient(URL, SERVICE ?? ANON!, {
      auth: { persistSession: false },
    });
  }
  return clienteServidor;
}

/** Cliente de navegador (anon). Lo usa Juan para Realtime. */
export function supabaseNavegador(): SupabaseClient | null {
  if (!URL || !ANON) return null;
  return createClient(URL, ANON);
}

/**
 * Devuelve las sedes candidatas dentro de un radio.
 *
 * Zaid: cuando la DB este lista, esta funcion debe llamar a la RPC
 * `sedes_cercanas(lat, lng, radio_m)` que hace el ST_DWithin en PostGIS.
 * La firma de salida NO cambia — por eso nadie mas se entera del cambio.
 */
export async function sedesCercanas(
  lat: number,
  lng: number,
  radioKm = 25
): Promise<Sede[]> {
  const sb = supabaseServidor();

  if (sb) {
    const { data, error } = await sb.rpc("sedes_cercanas", {
      p_lat: lat,
      p_lng: lng,
      p_radio_m: radioKm * 1000,
    });
    if (!error && Array.isArray(data) && data.length > 0) {
      return data as Sede[];
    }
    // Si la RPC todavia no existe, seguimos con mock en vez de reventar.
    if (error) {
      console.warn("[pulso] sedes_cercanas falló, usando mock:", error.message);
    }
  }

  return SEDES_MOCK.filter(
    (s) => distanciaKm(lat, lng, s.coord.lat, s.coord.lng) <= radioKm
  );
}

export async function todasLasSedes(): Promise<Sede[]> {
  const sb = supabaseServidor();
  if (sb) {
    const { data, error } = await sb.from("sede").select("*");
    if (!error && Array.isArray(data) && data.length > 0) return data as Sede[];
  }
  return SEDES_MOCK;
}

export async function sedePorCodigo(codigo: string): Promise<Sede | undefined> {
  const sedes = await todasLasSedes();
  return sedes.find((s) => s.codigo === codigo);
}

/** Haversine. Se usa como fallback y para pre-filtrar antes de llamar a Mapbox. */
export function distanciaKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
