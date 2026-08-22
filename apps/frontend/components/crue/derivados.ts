/**
 * Derivación de estado operativo del CRUE.
 *
 * Todo lo que la consola muestra sale de GET /estado — estas funciones son
 * puras: (casos, handshakes, congestion, ahora) → lo que el regulador ve.
 * Ninguna llama a la red ni muta nada.
 *
 * Los estados "escalado"/"vencido" son derivados del FRONT (≥2 rechazos o
 * handshake sin respuesta > TIMEOUT_HANDSHAKE_S): core aún no produce el
 * estado `timeout` ni eventos de escalamiento. Cuando lo haga, esta capa
 * es el único lugar que cambia.
 */

import type { Caso, CongestionSede, Handshake } from "@/lib/types";

/** Cuenta regresiva visual del handshake. Core no marca timeout todavía. */
export const TIMEOUT_HANDSHAKE_S = 45;

export type EstadoCaso = "buscando" | "esperando" | "aceptado" | "escalado";

export const ETIQUETA_ESTADO: Record<EstadoCaso, string> = {
  buscando: "buscando destino",
  esperando: "esperando confirmación",
  aceptado: "aceptado",
  escalado: "requiere regulación",
};

export interface CasoDerivado {
  caso: Caso;
  estado: EstadoCaso;
  /** Por qué está escalado; null si no lo está. */
  motivoEscalamiento: string | null;
  /** Handshakes del caso, ordenados por enviadoEn ascendente. */
  handshakes: Handshake[];
  /** El handshake "enviado" en curso, si hay. */
  vivo: Handshake | null;
  aceptado: Handshake | null;
  rechazos: number;
  destinoCodigo: string | null;
  /** Segundos desde creadoEn. */
  transcurridoS: number;
}

export function derivarCasos(
  casos: Caso[],
  handshakes: Handshake[],
  ahoraMs: number,
): CasoDerivado[] {
  return casos.map((caso) => {
    const hs = handshakes
      .filter((h) => h.casoId === caso.id)
      .sort((a, b) => a.enviadoEn.localeCompare(b.enviadoEn));
    const aceptado = hs.find((h) => h.estado === "aceptado") ?? null;
    const vivo = hs.find((h) => h.estado === "enviado") ?? null;
    const rechazos = hs.filter(
      (h) => h.estado === "rechazado" || h.estado === "timeout",
    ).length;

    let estado: EstadoCaso = "buscando";
    let motivoEscalamiento: string | null = null;
    if (aceptado) {
      estado = "aceptado";
    } else if (vivo) {
      const edadS = (ahoraMs - Date.parse(vivo.enviadoEn)) / 1000;
      if (edadS > TIMEOUT_HANDSHAKE_S) {
        estado = "escalado";
        motivoEscalamiento = `sin respuesta hace ${Math.round(edadS)}s`;
      } else {
        estado = "esperando";
      }
    } else if (rechazos >= 2) {
      estado = "escalado";
      motivoEscalamiento = `${rechazos} rechazos consecutivos`;
    }

    return {
      caso,
      estado,
      motivoEscalamiento,
      handshakes: hs,
      vivo,
      aceptado,
      rechazos,
      destinoCodigo: aceptado?.sedeCodigo ?? vivo?.sedeCodigo ?? null,
      transcurridoS: Math.max(0, (ahoraMs - Date.parse(caso.creadoEn)) / 1000),
    };
  });
}

/** Escalados arriba, luego severidad, luego el más viejo sin resolver. */
export function ordenarCola(derivados: CasoDerivado[]): CasoDerivado[] {
  const peso: Record<EstadoCaso, number> = {
    escalado: 0,
    buscando: 1,
    esperando: 2,
    aceptado: 3,
  };
  return [...derivados].sort((a, b) => {
    if (peso[a.estado] !== peso[b.estado]) return peso[a.estado] - peso[b.estado];
    if (a.caso.triage !== b.caso.triage) return a.caso.triage - b.caso.triage;
    return b.transcurridoS - a.transcurridoS;
  });
}

export interface Kpis {
  activos: number;
  esperando: number;
  escalados: number;
  /** Mediana creación→aceptación en segundos; null sin datos. */
  tMedioS: number | null;
  /** 0..1; null si la red no ha respondido nada aún. */
  tasaAceptacion: number | null;
  saturadas: number;
}

export function calcularKpis(
  derivados: CasoDerivado[],
  congestion: CongestionSede[],
): Kpis {
  const duraciones = derivados
    .filter((d) => d.aceptado?.respondidoEn)
    .map(
      (d) =>
        (Date.parse(d.aceptado!.respondidoEn!) - Date.parse(d.caso.creadoEn)) /
        1000,
    )
    .sort((a, b) => a - b);

  const aceptados = congestion.reduce((s, c) => s + c.aceptados, 0);
  const rechazados = congestion.reduce((s, c) => s + c.rechazados, 0);

  return {
    activos: derivados.filter((d) => d.estado !== "aceptado").length,
    esperando: derivados.filter((d) => d.estado === "esperando").length,
    escalados: derivados.filter((d) => d.estado === "escalado").length,
    tMedioS:
      duraciones.length === 0
        ? null
        : duraciones[Math.floor(duraciones.length / 2)],
    tasaAceptacion:
      aceptados + rechazados === 0 ? null : aceptados / (aceptados + rechazados),
    saturadas: congestion.filter((c) => c.indice > 0.85).length,
  };
}

/** mm:ss para cronómetros de consola. */
export function formatoCrono(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
