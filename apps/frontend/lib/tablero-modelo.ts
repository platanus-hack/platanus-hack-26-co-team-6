/**
 * El tablero de casos de /campo, sin React.
 *
 * Aquí vive lo que decide **qué ve el paramédico y en qué orden**: agrupar por
 * lo que exige acción, buscar, filtrar. Separado de la vista para poder
 * probarlo con `node --test`, igual que `sesion-modelo.ts`.
 *
 * ── LA IDEA QUE ORDENA TODO ───────────────────────────────────────
 * Un tablero de ambulancia no es una lista cronológica: es una lista de
 * **deudas**. Lo primero no es lo más nuevo, es lo que nadie ha resuelto.
 * Por eso el primer grupo es "por atender" y no "recientes".
 */

import type { CasoPublico, Handshake, NivelTriage } from "./types";

/**
 * En qué punto está un caso. Se deriva del último handshake, nunca se guarda:
 * dos fuentes de verdad sobre el estado de un traslado es cómo se pinta
 * "aceptado" sobre algo que el hospital ya rechazó.
 */
export type Etapa =
  /** Nadie lo ha despachado todavía. Exige acción. */
  | "por-atender"
  /** Despachado, esperando al jefe de urgencias. */
  | "esperando"
  /** Rechazado o vencido. Exige acción: hay que elegir otra sede. */
  | "rebotado"
  /** Una sede lo aceptó. Cerrado para este tablero. */
  | "aceptado";

export function etapaDe(handshake: Handshake | null): Etapa {
  if (!handshake) return "por-atender";
  if (handshake.estado === "aceptado") return "aceptado";
  if (handshake.estado === "enviado") return "esperando";
  return "rebotado";
}

/** Las dos que sacan a alguien de la silla. */
export function exigeAccion(etapa: Etapa): boolean {
  return etapa === "por-atender" || etapa === "rebotado";
}

export const ETIQUETA_ETAPA: Record<Etapa, string> = {
  "por-atender": "Sin despachar",
  esperando: "Esperando confirmación",
  rebotado: "Rebotado · elegir otra sede",
  aceptado: "Aceptado",
};

export const COLOR_ETAPA: Record<Etapa, string> = {
  "por-atender": "var(--color-info)",
  esperando: "var(--color-alerta)",
  rebotado: "var(--color-critico)",
  aceptado: "var(--color-estable)",
};

export interface CasoTablero {
  caso: CasoPublico;
  handshake: Handshake | null;
  etapa: Etapa;
  /** Segundos desde el dictado. */
  transcurridoS: number;
  /** Segundos hasta la aceptación. null si todavía no la hay. */
  cierreS: number | null;
}

/**
 * Cruza casos con su handshake más reciente y calcula los tiempos.
 *
 * `ahoraMs` entra por parámetro y no se lee de `Date.now()` dentro: así el
 * resultado es determinista y los tests no dependen del reloj.
 */
export function armarTablero(
  casos: CasoPublico[],
  handshakes: Handshake[],
  ahoraMs: number,
): CasoTablero[] {
  return casos.map((caso) => {
    // El más reciente manda: es el que refleja dónde está el caso ahora.
    const handshake =
      handshakes
        .filter((h) => h.casoId === caso.id)
        .sort((a, b) => b.enviadoEn.localeCompare(a.enviadoEn))[0] ?? null;

    const creado = new Date(caso.creadoEn).getTime();

    return {
      caso,
      handshake,
      etapa: etapaDe(handshake),
      transcurridoS: (ahoraMs - creado) / 1000,
      // Con `respondidoEn` del servidor, no con el reloj de este teléfono: un
      // móvil desfasado inventaría minutos que no fueron.
      cierreS:
        handshake?.estado === "aceptado" && handshake.respondidoEn
          ? (new Date(handshake.respondidoEn).getTime() - creado) / 1000
          : null,
    };
  });
}

// ── Búsqueda y filtros ───────────────────────────────────────────

export interface Filtro {
  /** Texto libre: diagnóstico, CIE-10, móvil o resumen. */
  texto: string;
  /** Vacío = todos. */
  triages: NivelTriage[];
  /** Vacío = todas. */
  etapas: Etapa[];
}

export const FILTRO_VACIO: Filtro = { texto: "", triages: [], etapas: [] };

export function hayFiltro(f: Filtro): boolean {
  return f.texto.trim() !== "" || f.triages.length > 0 || f.etapas.length > 0;
}

/**
 * Normaliza para comparar: sin tildes, sin mayúsculas.
 *
 * Un paramédico escribiendo con una mano en un vehículo en movimiento no pone
 * tildes. Si "cardiaco" no encuentra "Síndrome coronario agudo... cardíaco",
 * el buscador no sirve.
 */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function coincide(item: CasoTablero, filtro: Filtro): boolean {
  if (filtro.triages.length && !filtro.triages.includes(item.caso.triage)) {
    return false;
  }
  if (filtro.etapas.length && !filtro.etapas.includes(item.etapa)) {
    return false;
  }

  const texto = normalizar(filtro.texto);
  if (!texto) return true;

  // Cada palabra por separado: "iam inferior" encuentra un caso cuyo
  // diagnóstico dice "infarto ... cara inferior" aunque no sea literal.
  const heno = normalizar(
    [
      item.caso.dxDescripcion,
      item.caso.dxCie10 ?? "",
      item.caso.resumen,
      item.caso.unidad?.id ?? "",
      item.caso.signosAlarma.join(" "),
    ].join(" "),
  );

  return texto.split(/\s+/).every((palabra) => heno.includes(palabra));
}

export interface Grupos {
  /** Lo que exige acción: sin despachar o rebotado. Va primero, siempre. */
  porAtender: CasoTablero[];
  /** Despachados, esperando respuesta del hospital. */
  enCurso: CasoTablero[];
  /** Aceptados. El historial del turno. */
  cerrados: CasoTablero[];
  /** Cuántos había antes de filtrar. Para poder decir "3 de 12". */
  total: number;
}

/**
 * Agrupa y ordena.
 *
 * Dentro de "por atender" ordena por triage y después por antigüedad: un
 * triage I de hace un minuto va por delante de un triage III de hace veinte.
 * En los otros dos grupos manda el reloj, que es como se lee un historial.
 */
export function agrupar(items: CasoTablero[], filtro: Filtro): Grupos {
  const visibles = items.filter((i) => coincide(i, filtro));

  const porUrgencia = (a: CasoTablero, b: CasoTablero) =>
    a.caso.triage - b.caso.triage || b.transcurridoS - a.transcurridoS;

  const porReciente = (a: CasoTablero, b: CasoTablero) =>
    b.caso.creadoEn.localeCompare(a.caso.creadoEn);

  return {
    porAtender: visibles.filter((i) => exigeAccion(i.etapa)).sort(porUrgencia),
    enCurso: visibles.filter((i) => i.etapa === "esperando").sort(porReciente),
    cerrados: visibles.filter((i) => i.etapa === "aceptado").sort(porReciente),
    total: items.length,
  };
}

// ── Estado de la red de hospitales ───────────────────────────────

/**
 * `GET /estado` ya trae la congestión de las 84 sedes con nombre y coordenada,
 * y hasta ahora ninguna consola de campo la pintaba. Es la respuesta a "¿cómo
 * está el hospital X ahora mismo?" sin preguntarle a nadie.
 */
export interface SedeEstado {
  codigo: string;
  nombre: string;
  indice: number;
  etiqueta: "baja" | "media" | "alta" | "crítica";
  aceptados: number;
  rechazados: number;
}

export const ORDEN_CONGESTION: Record<SedeEstado["etiqueta"], number> = {
  crítica: 0,
  alta: 1,
  media: 2,
  baja: 3,
};

export const COLOR_CONGESTION: Record<SedeEstado["etiqueta"], string> = {
  crítica: "var(--color-critico)",
  alta: "var(--color-alerta)",
  media: "var(--color-info)",
  baja: "var(--color-estable)",
};

/** Las más cargadas primero: es lo que cambia una decisión de traslado. */
export function buscarSedes(
  sedes: SedeEstado[],
  texto: string,
  limite = 8,
): SedeEstado[] {
  const q = normalizar(texto);
  return sedes
    .filter((s) => !q || normalizar(s.nombre).includes(q) || s.codigo.includes(q))
    .sort(
      (a, b) =>
        ORDEN_CONGESTION[a.etiqueta] - ORDEN_CONGESTION[b.etiqueta] ||
        b.indice - a.indice,
    )
    .slice(0, limite);
}
