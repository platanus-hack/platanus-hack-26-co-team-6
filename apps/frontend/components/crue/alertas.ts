/**
 * Bandeja de alertas del CRUE: los eventos que exigen decisión del regulador.
 *
 * Derivación pura sobre lo que ya trae el polling — no inventa eventos:
 *  - caso escalado (≥2 rechazos o handshake sin respuesta > timeout visual)
 *  - sede en saturación crítica (índice > 0.85)
 *  - core sin señal
 *
 * La clave de cada alerta es ESTABLE (no incluye textos con segundos) para
 * que el reconocimiento sobreviva a los ticks del polling. "Reconocer" no
 * borra la alerta: la marca atendida por un regulador, y eso persiste en
 * localStorage hasta que la condición desaparece.
 */

import type { CongestionSede } from "@/lib/types";
import type { CasoDerivado } from "./derivados";

export interface Alerta {
  /** Estable entre ticks: "esc:<casoId>" | "sat:<sedeCodigo>" | "senal". */
  clave: string;
  tipo: "escalado" | "saturacion" | "sin-senal";
  texto: string;
  casoId?: string;
  sedeCodigo?: string;
}

export function derivarAlertas(
  derivados: CasoDerivado[],
  congestion: CongestionSede[],
  sinSenal: boolean,
): Alerta[] {
  const alertas: Alerta[] = [];

  for (const d of derivados) {
    if (d.estado !== "escalado") continue;
    alertas.push({
      clave: `esc:${d.caso.id}`,
      tipo: "escalado",
      texto: `${d.caso.resumen} — ${d.motivoEscalamiento ?? "requiere regulación"}`,
      casoId: d.caso.id,
    });
  }

  for (const s of congestion) {
    if (s.indice <= 0.85) continue;
    alertas.push({
      clave: `sat:${s.codigo}`,
      tipo: "saturacion",
      texto: `${s.nombre} en saturación crítica (${Math.round(s.indice * 100)}%)`,
      sedeCodigo: s.codigo,
    });
  }

  if (sinSenal) {
    alertas.push({
      clave: "senal",
      tipo: "sin-senal",
      texto: "Core no responde: los datos del tablero pueden estar viejos.",
    });
  }

  return alertas;
}

// ── Reconocimiento persistente ─────────────────────────────────────

export interface Reconocimiento {
  por: string;
  ts: string; // ISO 8601
}

const LLAVE = "crue-alertas-reconocidas";

export function leerReconocidas(): Record<string, Reconocimiento> {
  try {
    const crudo = localStorage.getItem(LLAVE);
    return crudo ? (JSON.parse(crudo) as Record<string, Reconocimiento>) : {};
  } catch {
    return {};
  }
}

/**
 * Marca la alerta como atendida y poda las claves de alertas que ya no
 * existen (una sede que salió de saturación no debe dejar basura eterna).
 */
export function reconocer(
  clave: string,
  por: string,
  vigentes: Alerta[],
): Record<string, Reconocimiento> {
  const actual = leerReconocidas();
  const claves = new Set(vigentes.map((a) => a.clave));
  const podado: Record<string, Reconocimiento> = {};
  for (const [k, v] of Object.entries(actual)) {
    if (claves.has(k)) podado[k] = v;
  }
  podado[clave] = { por: por || "(sin nombre)", ts: new Date().toISOString() };
  try {
    localStorage.setItem(LLAVE, JSON.stringify(podado));
  } catch {}
  return podado;
}
