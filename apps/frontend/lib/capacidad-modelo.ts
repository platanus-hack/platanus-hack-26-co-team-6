/**
 * El modelo de la declaración de capacidad, sin React.
 *
 * Vive separado de la vista por el mismo motivo que `sesion-modelo.ts`: aquí
 * está lo que hay que poder probar —cuánto falta para que una declaración
 * caduque, si un estado exige motivo, de dónde salió el número que se está
 * pintando y qué pasa cuando core rechaza una escritura optimista— y el
 * frontend no tiene runner de tests. `node --test` corre este archivo tal cual
 * porque su única dependencia es zod. Los tests están al lado, en
 * `capacidad-modelo.test.mts`.
 *
 * Dos reglas atraviesan todo el archivo:
 *
 *   1. **Un número sin procedencia es una mentira.** Un "12 camas UCI" que
 *      salió del snapshot REPS de 2022 no se puede pintar igual que uno que
 *      alguien declaró hace diez minutos. Por eso `Declaracion` lleva
 *      `procedencia` y no hay forma de construir una vista sin rotularla.
 *
 *   2. **Lo que no se confirmó no está guardado.** El optimismo aquí es de la
 *      pantalla, no de los datos: `base` es lo que core confirmó y ninguna
 *      escritura lo toca. Lo que el humano acaba de tocar vive en `enVuelo`
 *      hasta que core responde, y si falla se revierte **y se dice**.
 */

import { z } from "zod";

// ── Estado operativo ─────────────────────────────────────────────

/**
 * Los cuatro de `sede_estado.operativo` (Parte II §1 bloque C). El orden es el
 * de la pantalla: de "puedo recibir" a "no puedo", que es como se lee.
 */
export const ESTADOS_OPERATIVOS = [
  "recibiendo",
  "saturado",
  "contingencia",
  "cerrado",
] as const;

export type EstadoOperativo = (typeof ESTADOS_OPERATIVOS)[number];

export function esEstadoOperativo(valor: string): valor is EstadoOperativo {
  return (ESTADOS_OPERATIVOS as readonly string[]).includes(valor);
}

export const ETIQUETA_ESTADO: Record<EstadoOperativo, string> = {
  recibiendo: "Recibiendo",
  saturado: "Saturado",
  contingencia: "Contingencia",
  cerrado: "Cerrado",
};

/**
 * Qué significa cada estado para el ranking. Va en pantalla debajo del botón:
 * "saturado" y "cerrado" suenan parecido y hacen cosas muy distintas.
 */
export const CONSECUENCIA_ESTADO: Record<EstadoOperativo, string> = {
  recibiendo: "PULSO puede enviarte pacientes",
  saturado: "Sales del ranking hasta que caduque",
  contingencia: "Sales del ranking hasta que caduque",
  cerrado: "Sales del ranking hasta que caduque",
};

/**
 * Color y glifo por estado.
 *
 * El glifo no es decoración: el color solo no se lee con el brillo al mínimo
 * ni lo distingue quien no separa rojo de verde. Cada estado tiene forma
 * propia además de color, igual que la barra de `/campo`.
 */
export const PINTA_ESTADO: Record<
  EstadoOperativo,
  { color: string; glifo: string }
> = {
  recibiendo: { color: "var(--color-estable)", glifo: "●" },
  saturado: { color: "var(--color-alerta)", glifo: "▲" },
  contingencia: { color: "var(--color-critico)", glifo: "■" },
  // El blanco es a propósito: "cerrado" es el más grave y tiene que ser el más
  // legible de los cuatro a las 3 a.m., no otro rojo al lado del rojo.
  cerrado: { color: "var(--color-texto)", glifo: "✕" },
};

/**
 * Todo lo que no sea "recibiendo" exige motivo.
 *
 * No es burocracia: el motivo es lo que `/campo` va a leer en la tarjeta gris
 * ("Declaró contingencia hace 12 min") y lo que hace que la declaración sea
 * defendible después. Una sede fuera del ranking sin motivo es una sede que
 * nadie puede auditar.
 */
export function exigeMotivo(estado: EstadoOperativo): boolean {
  return estado !== "recibiendo";
}

/** Se ofrece siempre al final de la lista. Ver `MOTIVOS`. */
export const MOTIVO_OTRO = "Otro";

/**
 * Listas cortas a propósito.
 *
 * Cuatro o cinco opciones caben sin hacer scroll y se eligen sin leer. Un
 * campo abierto a las 3 a.m. produce "sat", "SATURADOS!!" y "n/a", y ninguno
 * de los tres agrega nada. `MOTIVO_OTRO` es la válvula de escape: declara
 * igual, en el mismo toque, y el detalle se puede añadir después sin bloquear.
 */
export const MOTIVOS: Record<Exclude<EstadoOperativo, "recibiendo">, readonly string[]> = {
  saturado: [
    "Urgencias en capacidad máxima",
    "Sin camas de observación",
    "Espera de puerta mayor a 4 horas",
    "Sin especialista de turno",
  ],
  contingencia: [
    "Emergencia interna",
    "Falla de servicios públicos",
    "Caída de red o sistemas",
    "Brote intrahospitalario",
  ],
  cerrado: [
    "Cierre ordenado por autoridad sanitaria",
    "Obra o mantenimiento mayor",
    "Sin personal para operar urgencias",
  ],
};

/** Los motivos que se ofrecen para un estado, con "Otro" al final. */
export function motivosDe(estado: EstadoOperativo): readonly string[] {
  if (!exigeMotivo(estado)) return [];
  return [...MOTIVOS[estado as Exclude<EstadoOperativo, "recibiendo">], MOTIVO_OTRO];
}

// ── La declaración ───────────────────────────────────────────────

/**
 * De dónde salió lo que se está pintando.
 *
 *   declarada      alguien de la sede lo declaró, y core lo tiene
 *   snapshot-reps  nadie declaró nada: es el corte REPS de 2022
 *
 * Lo manda core. La pantalla NO lo infiere, porque inferirlo sería exactamente
 * el error que este campo existe para impedir.
 */
export type Procedencia = "declarada" | "snapshot-reps";

/** Por qué no hay ninguna declaración que mostrar. */
export type MotivoAusencia =
  /** Core no tiene todavía el endpoint de capacidad (tarea 3.3 de Zaid). */
  | "sin-endpoint"
  /** Core no respondió. Es distinto de "no existe": esto se reintenta. */
  | "sin-core"
  /** No se sabe de qué sede se está hablando. */
  | "sin-sede";

export interface CamaDeclarada {
  /** Nombre REPS del tipo: "CAMAS-UCI Adultos", "CAMAS-Adultos"… */
  tipo: string;
  disponibles: number;
  /** Camas habilitadas de ese tipo. null si core no lo sabe. */
  total: number | null;
}

export interface Declaracion {
  sedeCodigo: string;
  operativo: EstadoOperativo;
  motivo: string | null;
  camas: CamaDeclarada[];
  /**
   * Cuándo deja de valer. ISO 8601, lo sella el servidor.
   *
   * null solo puede venir de un snapshot: una declaración humana SIN caducidad
   * es la que deja media red en contingencia permanente. El servidor pone 4 h
   * por defecto; el front no la inventa (misma regla que `expiraEn`).
   */
  venceEn: string | null;
  declaradoEn: string;
  /** Quién. null en el snapshot: no lo declaró nadie. */
  declaradoPor: { id: string; nombre?: string } | null;
  procedencia: Procedencia;
}

/**
 * Lo que core manda, leído a la defensiva.
 *
 * Todo lo que pueda faltar, falta sin romper. Lo único que no se perdona es
 * `procedencia`: un cuerpo sin procedencia se descarta entero, porque pintar
 * números sin saber de cuándo son es el bug que esta pantalla existe para
 * cerrar.
 */
const esquemaCama = z.object({
  tipo: z.string(),
  disponibles: z.number().int().min(0),
  total: z.number().int().min(0).nullable().optional(),
});

export const esquemaDeclaracion = z.object({
  sedeCodigo: z.string(),
  operativo: z.enum(ESTADOS_OPERATIVOS),
  motivo: z.string().nullable().optional(),
  camas: z.array(esquemaCama).optional(),
  venceEn: z.string().nullable().optional(),
  declaradoEn: z.string(),
  declaradoPor: z
    .object({ id: z.string(), nombre: z.string().optional() })
    .nullable()
    .optional(),
  procedencia: z.enum(["declarada", "snapshot-reps"]),
});

/** Devuelve null si el cuerpo no se entiende. Nunca inventa una declaración. */
export function normalizarDeclaracion(crudo: unknown): Declaracion | null {
  const leido = esquemaDeclaracion.safeParse(crudo);
  if (!leido.success) return null;

  const d = leido.data;
  return {
    sedeCodigo: d.sedeCodigo,
    operativo: d.operativo,
    motivo: d.motivo ?? null,
    camas: (d.camas ?? []).map((c) => ({
      tipo: c.tipo,
      disponibles: c.disponibles,
      total: c.total ?? null,
    })),
    venceEn: d.venceEn ?? null,
    declaradoEn: d.declaradoEn,
    declaradoPor: d.declaradoPor ?? null,
    procedencia: d.procedencia,
  };
}

// ── Tiempo: caducidad y antigüedad ───────────────────────────────

const MINUTO = 60_000;

/**
 * "3 h 12 min". Sin decimales y sin segundos: nadie toma una decisión con la
 * diferencia entre 3 h 12 min y 3 h 12 min 40 s, y el segundero obliga a
 * repintar cada segundo una pantalla que se mira de reojo.
 */
export function formatearDuracion(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MINUTO));
  if (total < 1) return "menos de 1 min";

  const dias = Math.floor(total / (24 * 60));
  if (dias >= 1) {
    const horas = Math.floor((total - dias * 24 * 60) / 60);
    return horas > 0 ? `${dias} d ${horas} h` : `${dias} d`;
  }

  const horas = Math.floor(total / 60);
  const minutos = total % 60;
  if (horas < 1) return `${minutos} min`;
  return minutos > 0 ? `${horas} h ${minutos} min` : `${horas} h`;
}

/** "hace 12 min". Devuelve null si la fecha no se entiende. */
export function hace(iso: string, ahora: number): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  // Un reloj de cliente adelantado no puede producir "hace -3 min".
  return `hace ${formatearDuracion(Math.max(0, ahora - t))}`;
}

export interface Caducidad {
  vencida: boolean;
  restanteMs: number;
  /** "3 h 12 min" — lo que falta, o lo que hace que venció. */
  texto: string;
  /** Menos de 30 min. La pantalla lo levanta de tono. */
  cerca: boolean;
}

/** null = no hay caducidad que calcular (no hay declaración, o no la trae). */
export function caducidad(
  venceEn: string | null | undefined,
  ahora: number,
): Caducidad | null {
  if (!venceEn) return null;
  const t = Date.parse(venceEn);
  if (Number.isNaN(t)) return null;

  const restanteMs = t - ahora;
  return {
    vencida: restanteMs <= 0,
    restanteMs,
    texto: formatearDuracion(Math.abs(restanteMs)),
    cerca: restanteMs > 0 && restanteMs < 30 * MINUTO,
  };
}

/**
 * La frase completa, tal cual va en pantalla.
 *
 * Una declaración que no caduca queda para siempre y nadie la revierte: por
 * eso el caso "sin caducidad" tiene texto propio y en tono de alerta, en vez
 * de no decir nada.
 */
export function rotuloCaducidad(c: Caducidad | null): string {
  if (!c) return "Esta declaración no tiene caducidad registrada.";
  if (c.vencida) return `Esta declaración caducó hace ${c.texto}.`;
  return `Esta declaración caduca en ${c.texto}.`;
}

// ── Procedencia: de dónde salió el número ────────────────────────

export interface RotuloProcedencia {
  /** Línea principal. "Declarado por ti hace 12 min". */
  texto: string;
  /** Por qué se puede o no confiar. Una frase. */
  detalle: string;
  /**
   * declarada  dato de hoy, de una persona con nombre
   * vieja      snapshot REPS 2022: sirve de prior, no de verdad
   * ausente    no hay dato, y hay que decir por qué
   */
  tono: "declarada" | "vieja" | "ausente";
}

const AUSENCIA: Record<MotivoAusencia, RotuloProcedencia> = {
  "sin-endpoint": {
    texto: "Core todavía no tiene la declaración de capacidad",
    detalle:
      "GET /capacidad responde 404: la tarea 3.3 no está desplegada. Nada de lo que declares aquí llega al ranking, y el ranking sigue puntuando esta sede con el snapshot REPS 2022.",
    tono: "ausente",
  },
  "sin-core": {
    texto: "Core no responde",
    detalle:
      "No sabemos qué tiene declarado esta sede. No se pinta un número que no vino de ninguna parte.",
    tono: "ausente",
  },
  "sin-sede": {
    texto: "Falta saber de qué sede se está hablando",
    detalle:
      "Tu sesión no trae sede asignada. Elige una para declarar por ella.",
    tono: "ausente",
  },
};

/**
 * El rótulo que nunca se puede omitir.
 *
 * "Declarado por ti hace 12 min" y "Snapshot REPS 2022" **no se pintan igual**
 * — es la misma honestidad de `GET /capacidades`, aplicada a las camas.
 */
export function rotularProcedencia(args: {
  declaracion: Declaracion | null;
  ausencia: MotivoAusencia | null;
  ahora: number;
  /** Actor de la sesión, para poder decir "por ti". */
  actorId?: string | null;
}): RotuloProcedencia {
  const { declaracion, ausencia, ahora, actorId } = args;

  if (!declaracion) return AUSENCIA[ausencia ?? "sin-core"];

  if (declaracion.procedencia === "snapshot-reps") {
    return {
      texto: "Snapshot REPS 2022",
      detalle:
        "Nadie de esta sede ha declarado hoy. Estas son las camas del corte REPS del 2022-11-30: sirven de punto de partida, no dicen qué hay ahora.",
      tono: "vieja",
    };
  }

  const cuando = hace(declaracion.declaradoEn, ahora) ?? "en un momento sin fecha";
  const quien =
    declaracion.declaradoPor && actorId && declaracion.declaradoPor.id === actorId
      ? "por ti"
      : declaracion.declaradoPor?.nombre
        ? `por ${declaracion.declaradoPor.nombre}`
        : "en esta sede";

  return {
    texto: `Declarado ${quien} ${cuando}`,
    detalle: "Es el dato que el ranking está usando ahora mismo.",
    tono: "declarada",
  };
}

// ── Escritura optimista, con reversión visible ───────────────────

/**
 * Qué control escribe.
 *
 * Cada fila de camas es su propio control porque **cada control guarda solo**:
 * no hay botón de "Guardar" al final. Si el `+` de UCI falla, se revierte el
 * `+` de UCI y no se toca lo demás.
 */
export type Clave = "operativo" | `cama:${string}`;

export function claveCama(tipo: string): Clave {
  return `cama:${tipo}`;
}

export type ValorEnVuelo =
  | { control: "operativo"; operativo: EstadoOperativo; motivo: string | null }
  | { control: "cama"; tipo: string; disponibles: number };

export function claveDe(valor: ValorEnVuelo): Clave {
  return valor.control === "operativo" ? "operativo" : claveCama(valor.tipo);
}

export interface Revertido {
  /** Lo que se quiso declarar. Se conserva para poder reintentar. */
  intento: ValorEnVuelo;
  mensaje: string;
}

export interface EstadoCapacidad {
  /** Lo que core confirmó. Ninguna escritura optimista lo toca. */
  base: Declaracion | null;
  /** Por qué no hay base. null cuando sí la hay. */
  ausencia: MotivoAusencia | null;
  /** Lo que el humano tocó y core todavía no confirmó. Clave → valor. */
  enVuelo: Record<string, ValorEnVuelo>;
  /** Reversiones ya aplicadas que la pantalla tiene que mostrar. Clave → fallo. */
  revertidos: Record<string, Revertido>;
  cargando: boolean;
}

export const CAPACIDAD_INICIAL: EstadoCapacidad = {
  base: null,
  ausencia: null,
  enVuelo: {},
  revertidos: {},
  cargando: true,
};

export type AccionCapacidad =
  | { tipo: "cargando" }
  | { tipo: "cargada"; declaracion: Declaracion }
  | { tipo: "sin-declaracion"; ausencia: MotivoAusencia }
  /** El humano tocó. Se pinta ya, antes de que core conteste. */
  | { tipo: "escribir"; valor: ValorEnVuelo }
  /** Core confirmó y devolvió la declaración resultante. */
  | { tipo: "confirmada"; clave: Clave; declaracion: Declaracion | null }
  /** Core dijo que no. Se revierte y se muestra. */
  | { tipo: "revertida"; clave: Clave; mensaje: string }
  /** El humano cerró el aviso de reversión (o reintentó). */
  | { tipo: "descartar-reversion"; clave: Clave };

function sin<T>(mapa: Record<string, T>, clave: string): Record<string, T> {
  if (!(clave in mapa)) return mapa;
  const copia = { ...mapa };
  delete copia[clave];
  return copia;
}

/**
 * El reductor.
 *
 * Lo importante está en lo que NO hace:
 *
 *  - `cargada` no borra `enVuelo`. El polling puede aterrizar en medio de una
 *    escritura, y borrar lo que el humano acaba de tocar haría que el número
 *    saltara atrás y volviera solo — el peor bug posible en una pantalla que
 *    se usa con prisa.
 *  - `revertida` no deja el valor puesto "por si acaso". Lo quita y guarda el
 *    intento aparte: la pantalla vuelve a lo último que core confirmó, y el
 *    aviso dice qué no se guardó. Un optimismo que no revierte es una mentira
 *    con retardo.
 */
export function reducirCapacidad(
  estado: EstadoCapacidad,
  accion: AccionCapacidad,
): EstadoCapacidad {
  switch (accion.tipo) {
    case "cargando":
      return { ...estado, cargando: true };

    case "cargada":
      return {
        ...estado,
        base: accion.declaracion,
        ausencia: null,
        cargando: false,
      };

    case "sin-declaracion":
      return {
        ...estado,
        base: null,
        ausencia: accion.ausencia,
        cargando: false,
      };

    case "escribir": {
      const clave = claveDe(accion.valor);
      return {
        ...estado,
        enVuelo: { ...estado.enVuelo, [clave]: accion.valor },
        // Reintentar borra el aviso del intento anterior: si vuelve a fallar,
        // vuelve a aparecer con el mensaje nuevo.
        revertidos: sin(estado.revertidos, clave),
      };
    }

    case "confirmada":
      return {
        ...estado,
        base: accion.declaracion ?? estado.base,
        ausencia: accion.declaracion ? null : estado.ausencia,
        enVuelo: sin(estado.enVuelo, accion.clave),
        revertidos: sin(estado.revertidos, accion.clave),
      };

    case "revertida": {
      const intento = estado.enVuelo[accion.clave];
      return {
        ...estado,
        enVuelo: sin(estado.enVuelo, accion.clave),
        revertidos: intento
          ? { ...estado.revertidos, [accion.clave]: { intento, mensaje: accion.mensaje } }
          : estado.revertidos,
      };
    }

    case "descartar-reversion":
      return { ...estado, revertidos: sin(estado.revertidos, accion.clave) };
  }
}

// ── Proyección: lo que la pantalla pinta ─────────────────────────

export interface FilaCama {
  tipo: string;
  disponibles: number;
  total: number | null;
  /** Se tocó y core no ha contestado. Se pinta distinto, no igual. */
  pendiente: boolean;
  revertido: Revertido | null;
}

export interface VistaCapacidad {
  /** null = no se sabe. La pantalla NO asume "recibiendo". */
  operativo: EstadoOperativo | null;
  motivo: string | null;
  operativoPendiente: boolean;
  operativoRevertido: Revertido | null;
  camas: FilaCama[];
  caducidad: Caducidad | null;
  procedencia: RotuloProcedencia;
  /** Hay algo tocado que core no ha confirmado. */
  hayPendientes: boolean;
  /** Hay algo que se revirtió y todavía no se ha visto. */
  hayRevertidos: boolean;
}

/**
 * Fusiona lo confirmado con lo optimista y rotula todo.
 *
 * Es la única forma de construir lo que se pinta, y por eso `procedencia` no
 * es opcional aquí: no existe un camino que llegue a la pantalla con un número
 * sin decir de dónde salió.
 */
export function proyectar(
  estado: EstadoCapacidad,
  ahora: number,
  actorId?: string | null,
): VistaCapacidad {
  const enVueloOperativo = estado.enVuelo["operativo"];
  const optimista =
    enVueloOperativo?.control === "operativo" ? enVueloOperativo : null;

  const camas: FilaCama[] = (estado.base?.camas ?? []).map((c) => {
    const clave = claveCama(c.tipo);
    const puesto = estado.enVuelo[clave];
    const pendiente = puesto?.control === "cama" ? puesto : null;
    return {
      tipo: c.tipo,
      disponibles: pendiente ? pendiente.disponibles : c.disponibles,
      total: c.total,
      pendiente: pendiente !== null,
      revertido: estado.revertidos[clave] ?? null,
    };
  });

  return {
    operativo: optimista?.operativo ?? estado.base?.operativo ?? null,
    motivo: optimista ? optimista.motivo : (estado.base?.motivo ?? null),
    operativoPendiente: optimista !== null,
    operativoRevertido: estado.revertidos["operativo"] ?? null,
    camas,
    // La caducidad se calcula SOLO sobre lo confirmado. Una declaración en
    // vuelo todavía no tiene `vence_en`: lo sella el servidor al aceptarla, y
    // adivinarlo aquí sería inventar un plazo que nadie va a hacer cumplir.
    caducidad: caducidad(estado.base?.venceEn, ahora),
    procedencia: rotularProcedencia({
      declaracion: estado.base,
      ausencia: estado.ausencia,
      ahora,
      actorId,
    }),
    hayPendientes: Object.keys(estado.enVuelo).length > 0,
    hayRevertidos: Object.keys(estado.revertidos).length > 0,
  };
}

// ── Aritmética de las camas ──────────────────────────────────────

/** Tope de cordura para cuando core no sabe el total. Ninguna sede de Bogotá
 *  tiene 1000 camas de un tipo, y un `+` pegado no puede llegar al infinito. */
const TOPE_SIN_TOTAL = 999;

/**
 * El `−` y el `+`.
 *
 * Se limita abajo en 0 (`capacidad_declarada` tiene `check disponibles >= 0`:
 * un negativo lo rechazaría el servidor) y arriba en el total habilitado
 * cuando se conoce — declarar más camas libres de las que existen no es un
 * dato, es un error de dedo a las 3 a.m.
 */
export function ajustarDisponibles(
  actual: number,
  delta: number,
  total: number | null,
): number {
  const tope = total ?? TOPE_SIN_TOTAL;
  return Math.min(tope, Math.max(0, actual + delta));
}

/** Para saber si el toque hace algo antes de mandar un PUT que no cambia nada. */
export function puedeAjustar(
  actual: number,
  delta: number,
  total: number | null,
): boolean {
  return ajustarDisponibles(actual, delta, total) !== actual;
}

/**
 * Nombre corto del tipo de cama.
 *
 * El catálogo REPS los trae como "CAMAS-UCI Adultos". El prefijo se repite en
 * todas las filas y a las 3 a.m. lo único que se lee es la palabra que las
 * distingue.
 */
export function nombreCama(tipo: string): string {
  return tipo.replace(/^CAMAS[-\s]*/i, "").trim() || tipo;
}
