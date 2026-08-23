/**
 * Posición del móvil y cobertura de la flota, sin React.
 *
 * Tarea 3.7. Vive separado por la misma razón que `sesion-modelo.ts`: aquí
 * está la lógica que decide **cuándo se rastrea a alguien** y **cómo de vieja
 * es una posición**, y eso hay que poder probarlo. El frontend no tiene runner
 * de tests; `node --test` corre esto tal cual porque no importa React, ni
 * `api.ts`, ni nada del DOM. Los tests están al lado, en
 * `posicion-modelo.test.mts`.
 *
 * ── EL LÍMITE ─────────────────────────────────────────────────────
 * PULSO le MUESTRA la cobertura al CRUE; no asigna móviles. Reposicionar
 * ambulancias es función legal del CRUE (Res. 1220/2010). En este archivo no
 * hay —ni debe haber— nada que recomiende mover una unidad.
 */

// ─────────────────────────────────────────────────────────────────
// Cuándo se rastrea, y cuándo no
// ─────────────────────────────────────────────────────────────────

/**
 * Cada cuánto se manda la posición al servidor.
 *
 * `watchPosition` entrega un arreglo del GPS cada uno o dos segundos. Mandarlos
 * todos son ~2.000 peticiones por turno y por móvil, y la radio del teléfono
 * encendida sin descanso: la batería del tablet no llega al final del turno y
 * el servidor recibe una tormenta que no aporta un metro de precisión.
 *
 * 15 s es lo que la tarea fija: a 60 km/h son 250 m entre reportes, suficiente
 * para ver moverse el pin y para un ETA que se corrige solo.
 */
export const INTERVALO_REPORTE_MS = 15_000;

/**
 * Copia local de los estados de `useGeolocalizacion`.
 *
 * No se importa el tipo de allá a propósito: ese módulo es "use client" e
 * importa React, y este archivo tiene que poder cargarse en `node --test` sin
 * arrastrar medio frontend. Si allá se añade un estado nuevo, aquí falla el
 * `switch` en compilación, que es exactamente el aviso que se quiere.
 */
export type EstadoGeoLike =
  | "pidiendo"
  | "ok"
  | "denegado"
  | "no-soportado"
  | "fuera-de-bogota"
  | "error";

export type MotivoSinRastreo =
  /** No hay caso abierto: fuera de servicio no se rastrea a nadie. */
  | "sin-caso"
  /** No se sabe qué móvil es este dispositivo. */
  | "sin-unidad"
  /** El GPS todavía no engancha. */
  | "buscando"
  /** El navegador dijo que no. */
  | "sin-permiso"
  /** Este navegador no da ubicación. */
  | "sin-soporte"
  /** La posición cae fuera de Bogotá: casi siempre es geolocalización por IP. */
  | "fuera-de-cobertura";

export type EstadoRastreo =
  | { rastreando: true }
  | { rastreando: false; motivo: MotivoSinRastreo };

/**
 * Lo que la consola de campo tiene que DECIR cuando no está rastreando.
 *
 * "La degradación se dice" (regla 2 del repo). Un mapa quieto sin explicación
 * es peor que no tener mapa: el paramédico no sabe si el sistema lo ve o no.
 */
export const MENSAJE_SIN_RASTREO: Record<MotivoSinRastreo, string> = {
  "sin-caso": "Sin caso abierto — no se reporta posición",
  "sin-unidad": "Declara el móvil para reportar posición",
  buscando: "Buscando señal del GPS…",
  "sin-permiso": "Sin permiso de ubicación — el CRUE no ve este móvil",
  "sin-soporte": "Este navegador no da ubicación — el CRUE no ve este móvil",
  "fuera-de-cobertura": "La ubicación cae fuera de Bogotá — no se reporta",
};

/**
 * ¿Se debe reportar la posición ahora mismo?
 *
 * **La regla que manda es `casoAbierto`.** Un turno de 12 h con el GPS
 * encendido de punta a punta es una batería muerta y, peor, el rastreo
 * continuo de una persona que no está atendiendo a nadie. Se rastrea el
 * traslado, no al trabajador.
 *
 * El orden de los motivos importa: se devuelve el que hay que decir en
 * pantalla, y "no hay caso abierto" gana sobre "el GPS no engancha" porque en
 * ese momento el GPS da igual.
 */
export function decidirRastreo(entrada: {
  casoAbierto: boolean;
  movilId: string | null;
  estadoGeo: EstadoGeoLike;
}): EstadoRastreo {
  if (!entrada.casoAbierto) return { rastreando: false, motivo: "sin-caso" };
  if (!entrada.movilId) return { rastreando: false, motivo: "sin-unidad" };

  switch (entrada.estadoGeo) {
    case "ok":
      return { rastreando: true };
    case "pidiendo":
      return { rastreando: false, motivo: "buscando" };
    case "denegado":
      return { rastreando: false, motivo: "sin-permiso" };
    case "no-soportado":
      return { rastreando: false, motivo: "sin-soporte" };
    case "fuera-de-bogota":
      return { rastreando: false, motivo: "fuera-de-cobertura" };
    case "error":
      return { rastreando: false, motivo: "buscando" };
  }
}

/**
 * El throttle. `null` en `ultimoEnvioMs` = todavía no se ha mandado ninguna.
 *
 * Se compara contra un instante y no se descuenta de un contador: si el
 * navegador congela los temporizadores con la pantalla apagada —lo hace—, al
 * volver se manda una y se sigue, en vez de disparar la ráfaga acumulada.
 */
export function debeEnviar(
  ultimoEnvioMs: number | null,
  ahoraMs: number,
  intervaloMs: number = INTERVALO_REPORTE_MS,
): boolean {
  if (ultimoEnvioMs === null) return true;
  return ahoraMs - ultimoEnvioMs >= intervaloMs;
}

// ─────────────────────────────────────────────────────────────────
// Qué tan vieja es una posición
// ─────────────────────────────────────────────────────────────────

/** Tres reportes perdidos seguidos. Por debajo de esto, el pin es de fiar. */
export const UMBRAL_VIVA_S = 45;
/** Cinco minutos. Más allá, ya no es "dónde está": es "dónde estaba". */
export const UMBRAL_REZAGADA_S = 300;

export type Frescura =
  /** Reportando ahora. */
  | "viva"
  /** Se saltó reportes. Sigue siendo útil, pero se marca. */
  | "rezagada"
  /** Última posición conocida. Se pinta distinta y con su antigüedad. */
  | "ultima-conocida"
  /** Registrada y sin un solo reporte. No es lo mismo que "vieja". */
  | "sin-reporte";

export function antiguedadS(
  reportadoEn: string | null | undefined,
  ahoraMs: number,
): number | null {
  if (!reportadoEn) return null;
  const t = Date.parse(reportadoEn);
  if (Number.isNaN(t)) return null;
  // Nunca negativa: un reloj de consola adelantado no puede producir "hace -3 s".
  return Math.max(0, (ahoraMs - t) / 1000);
}

export function frescuraDe(segundos: number | null): Frescura {
  if (segundos === null) return "sin-reporte";
  if (segundos <= UMBRAL_VIVA_S) return "viva";
  if (segundos <= UMBRAL_REZAGADA_S) return "rezagada";
  return "ultima-conocida";
}

/** "hace 12 s" · "hace 4 min" · "hace 2 h 05 min". Para leer de un vistazo. */
export function textoAntiguedad(segundos: number | null): string {
  if (segundos === null) return "sin reporte";
  const s = Math.floor(segundos);
  if (s < 60) return `hace ${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h ${String(min % 60).padStart(2, "0")} min`;
}

/**
 * Cómo se dice la precisión del GPS.
 *
 * ⚠️ La trampa que la tarea nombra: la geolocalización del navegador en
 * interiores se equivoca por cientos de metros. Un pin sin su radio de error
 * se lee como una certeza. Por eso esto nunca devuelve "" — si no hay dato,
 * lo dice.
 */
export function textoPrecision(precisionM: number | null | undefined): string {
  if (precisionM === null || precisionM === undefined) return "precisión desconocida";
  if (precisionM >= 1000) return `±${(precisionM / 1000).toFixed(1)} km`;
  return `±${Math.round(precisionM)} m`;
}

// ─────────────────────────────────────────────────────────────────
// Cobertura: agrupar por localidad y contar
// ─────────────────────────────────────────────────────────────────

export type TipoMovilLike = "TAB" | "TAM";

export interface PosicionMovil {
  lat: number;
  lng: number;
  precisionM: number | null;
  velocidadKmh: number | null;
  reportadoEn: string;
}

export interface MovilCobertura {
  id: string;
  organizacionId: string;
  /** null = tipo sin verificar. No se pinta como TAB ni como TAM. */
  tipo: TipoMovilLike | null;
  tipoVerificado: boolean;
  disponible: boolean;
  posicion: PosicionMovil | null;
  /** Localidad ESTIMADA por el servidor (sede más cercana). */
  localidad: string | null;
}

/** Los que no se pueden ubicar van juntos y al final, nunca escondidos. */
export const SIN_LOCALIDAD = "Sin ubicar";

export interface ConteoFlota {
  total: number;
  tab: number;
  tam: number;
  /** Móviles cuyo tipo todavía no está verificado (tarea 3.6). */
  sinTipo: number;
  libres: number;
  ocupados: number;
  /** Registrados y sin un solo reporte de posición. */
  sinPosicion: number;
  /** Con posición, pero vieja. Es la degradación que hay que ver. */
  ultimaConocida: number;
}

export interface GrupoLocalidad {
  localidad: string;
  conteo: ConteoFlota;
  moviles: MovilCobertura[];
}

export function contar(
  moviles: readonly MovilCobertura[],
  ahoraMs: number,
): ConteoFlota {
  const c: ConteoFlota = {
    total: moviles.length,
    tab: 0,
    tam: 0,
    sinTipo: 0,
    libres: 0,
    ocupados: 0,
    sinPosicion: 0,
    ultimaConocida: 0,
  };

  for (const m of moviles) {
    if (m.tipo === "TAB") c.tab += 1;
    else if (m.tipo === "TAM") c.tam += 1;
    else c.sinTipo += 1;

    if (m.disponible) c.libres += 1;
    else c.ocupados += 1;

    const frescura = frescuraDe(antiguedadS(m.posicion?.reportadoEn, ahoraMs));
    if (frescura === "sin-reporte") c.sinPosicion += 1;
    else if (frescura === "ultima-conocida") c.ultimaConocida += 1;
  }

  return c;
}

/**
 * La flota por zona, que es como el regulador mira la ciudad: no le sirve
 * "hay 40 ambulancias", le sirve "en Ciudad Bolívar hay una y está ocupada".
 *
 * Orden: primero la localidad con más móviles —donde está la capacidad—, y a
 * igualdad, alfabético para que el tablero no baile entre polls. "Sin ubicar"
 * siempre al final: es una carencia de dato, no una zona de la ciudad.
 */
export function agruparPorLocalidad(
  moviles: readonly MovilCobertura[],
  ahoraMs: number,
): GrupoLocalidad[] {
  const porLocalidad = new Map<string, MovilCobertura[]>();

  for (const m of moviles) {
    const clave = m.localidad ?? SIN_LOCALIDAD;
    const lista = porLocalidad.get(clave);
    if (lista) lista.push(m);
    else porLocalidad.set(clave, [m]);
  }

  return [...porLocalidad.entries()]
    .map(([localidad, lista]) => ({
      localidad,
      conteo: contar(lista, ahoraMs),
      moviles: [...lista].sort((a, b) => a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => {
      if (a.localidad === SIN_LOCALIDAD) return 1;
      if (b.localidad === SIN_LOCALIDAD) return -1;
      if (b.conteo.total !== a.conteo.total) return b.conteo.total - a.conteo.total;
      return a.localidad.localeCompare(b.localidad);
    });
}
