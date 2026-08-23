/**
 * Tipos del modulo de administracion de catalogos versionados (tarea 5.11).
 *
 * VIVEN AQUI Y NO EN `contracts/types.ts` A PROPOSITO. Ese archivo es el
 * protocolo entre los cuatro carriles y tiene un espejo manual en el frontend
 * (`lib/types.ts`) verificado por `scripts/verificar-tipos.mts`: meter aqui
 * treinta tipos que solo usa una consola de plataforma lo convertiria en un
 * cuello de botella de merge para todo el equipo. El espejo de estos tipos es
 * `apps/frontend/lib/catalogos-modelo.ts`, que los reconstruye con zod al
 * parsear la respuesta — si core cambia un campo, el front lo descarta en vez
 * de romperse.
 *
 * ── LA IDEA CENTRAL ───────────────────────────────────────────────
 * Todo lo que hay aqui es LOGICA CLINICA, no configuracion. Un motivo de
 * rechazo, un protocolo, la tabla que traduce un diagnostico a servicios REPS
 * y la version del prompt con la que se leyo un dictado son las variables
 * respecto de las cuales se interpreta el dataset historico. Si cambian sin
 * dejar version, dos casos de meses distintos dejan de ser comparables y el
 * activo del producto —el dataset de aceptacion/rechazo— se vuelve ruido.
 *
 * De ahi la unica regla que decide el diseno entero:
 *
 *   **El CODIGO es inmutable. La ETIQUETA es editable. Editarla no modifica
 *   nada: agrega una version nueva.**
 *
 * El codigo es la clave estable con la que se compara el historico; la
 * etiqueta es lo que lee un humano y puede cambiar mil veces sin que el
 * dataset se entere.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────
// Colecciones
// ─────────────────────────────────────────────────────────────────

/**
 * Lo que administra `/admin/catalogos`.
 *
 *   motivo_rechazo  el enum cerrado de §7.4 — hoy son cuatro strings sueltos
 *                   dentro de `components/hospital/MotivosCapacidad.tsx`, sin
 *                   codigo ni version: cambiar el texto de uno rompe la serie
 *                   historica en silencio. Esto es lo que arregla.
 *   protocolo       protocolos clinicos (codigo infarto, codigo ACV...).
 *   mapa_dx         la tabla de §7.2: diagnostico CIE-10 → servicios REPS
 *                   obligatorios. "El LLM propone, la tabla decide."
 */
export const CATALOGOS = ['motivo_rechazo', 'protocolo', 'mapa_dx'] as const;
export type Catalogo = (typeof CATALOGOS)[number];

/**
 * Lo que administra `/admin/modelos`: los artefactos con los que se PROCESO
 * un caso. Sin esto no se puede responder "¿con que prompt se leyo el dictado
 * de hace una semana?", y sin esa respuesta no hay forma de saber si el
 * modelo mejoro o si solo cambiaron los datos.
 */
export const MODELOS = ['prompt_clinico', 'config_scoring'] as const;
export type Modelo = (typeof MODELOS)[number];

/** Todo lo versionado, junto. La maquina de versionado es una sola. */
export const COLECCIONES = [...CATALOGOS, ...MODELOS] as const;
export type Coleccion = (typeof COLECCIONES)[number];

export function esCatalogo(valor: unknown): valor is Catalogo {
  return typeof valor === 'string' && (CATALOGOS as readonly string[]).includes(valor);
}

export function esModelo(valor: unknown): valor is Modelo {
  return typeof valor === 'string' && (MODELOS as readonly string[]).includes(valor);
}

export function esColeccion(valor: unknown): valor is Coleccion {
  return typeof valor === 'string' && (COLECCIONES as readonly string[]).includes(valor);
}

// ─────────────────────────────────────────────────────────────────
// El cuerpo de cada coleccion
// ─────────────────────────────────────────────────────────────────

export const CATEGORIAS_MOTIVO = [
  'capacidad',
  'talento_humano',
  'infraestructura',
  'otro',
] as const;
export type CategoriaMotivo = (typeof CATEGORIAS_MOTIVO)[number];

export const COMPLEJIDADES = ['baja', 'media', 'alta'] as const;

/**
 * Un motivo de rechazo. Ojo con el vocabulario: la Ley 1751/2015 obliga a la
 * atencion inicial de urgencias, asi que esto NO es "negar atencion" — es una
 * declaracion de capacidad con fecha y hora. La UI lo dice; el dato tambien.
 */
export const datosMotivoRechazo = z.object({
  categoria: z.enum(CATEGORIAS_MOTIVO),
  /** true si al elegirlo hay que escribir algo mas. Casi siempre false. */
  requiereDetalle: z.boolean().default(false),
});

export const datosProtocolo = z.object({
  pasos: z.array(z.string().min(1)).min(1),
  /** Ventana clinica en minutos (door-to-balloon = 90). null si no aplica. */
  ventanaMin: z.number().int().positive().nullable().default(null),
  /** De donde sale. Una guia sin fuente no es una guia. */
  referencia: z.string().nullable().default(null),
});

/**
 * Una fila del mapa Dx→servicios. El `codigo` de la entrada ES el prefijo
 * CIE-10 normalizado (`I21`, `S06`), asi que aqui no se repite.
 */
export const datosMapaDx = z.object({
  /**
   * Codigos REPS que la sede receptora DEBE tener habilitados. Se validan
   * contra `catalogo/servicios-reps.ts` — el CodeSystem oficial de MinSalud.
   * No se inventan codigos: un numero que no este ahi es un 400.
   */
  serviciosRequeridos: z.array(z.number().int()).min(1),
  complejidadMinima: z.enum(COMPLEJIDADES),
  requiereMedicoABordo: z.boolean().default(false),
  /** Codigo de un protocolo de este mismo admin, si lo hay. */
  protocolo: z.string().nullable().default(null),
});

/**
 * Una version del prompt clinico.
 *
 * NO GUARDA EL TEXTO DEL PROMPT A PROPOSITO. El prompt ya esta duplicado en
 * Python y en TypeScript y esa duplicacion es la tarea 0.5 de Neid; meter una
 * tercera copia aqui empeoraria exactamente el problema que 0.5 va a cerrar.
 * Lo que se versiona es su IDENTIDAD: donde vive y que huella tiene. Con eso
 * alcanza para responder "¿con que prompt se proceso este caso?", que es lo
 * que pide la tarea.
 */
export const datosPromptClinico = z.object({
  /** Donde vive la fuente de verdad. Ej: 'ai-core:prompts/triage.py'. */
  referencia: z.string().min(1),
  /** sha256 del texto del prompt, para detectar que cambio sin avisar. */
  huella: z.string().nullable().default(null),
  notas: z.string().nullable().default(null),
});

/**
 * Una version de la configuracion de scoring: los parametros calibrables de
 * `scoring/scoring.service.ts`. Todos en MINUTOS salvo los que dicen otra cosa
 * — es el invariante 2 del contrato y no se negocia.
 */
export const datosConfigScoring = z.object({
  parametros: z.record(z.string(), z.number()),
  notas: z.string().nullable().default(null),
});

/** El esquema que le toca a cada coleccion. */
export const ESQUEMA_DATOS = {
  motivo_rechazo: datosMotivoRechazo,
  protocolo: datosProtocolo,
  mapa_dx: datosMapaDx,
  prompt_clinico: datosPromptClinico,
  config_scoring: datosConfigScoring,
} as const satisfies Record<Coleccion, z.ZodType>;

export type DatosMotivoRechazo = z.infer<typeof datosMotivoRechazo>;
export type DatosProtocolo = z.infer<typeof datosProtocolo>;
export type DatosMapaDx = z.infer<typeof datosMapaDx>;
export type DatosPromptClinico = z.infer<typeof datosPromptClinico>;
export type DatosConfigScoring = z.infer<typeof datosConfigScoring>;

export type DatosVersion = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────
// La fila versionada
// ─────────────────────────────────────────────────────────────────

/**
 * UNA VERSION. Nunca se actualiza ni se borra: cada cambio es una fila nueva.
 *
 * Que la version vigente sea "la de numero mas alto" es una DERIVACION, no un
 * campo. Guardar un booleano `vigente` obliga a apagar el anterior en la misma
 * transaccion, y el dia que eso falle habra dos vigentes y nadie sabra cual
 * mando. Derivarlo no puede quedar inconsistente.
 */
export interface VersionEntrada {
  /** Identidad de la FILA, no de la entrada. Cada version tiene la suya. */
  id: string;
  coleccion: Coleccion;
  /** INMUTABLE. La clave estable contra la que se compara el historico. */
  codigo: string;
  /** 1, 2, 3... Monotona por codigo. */
  version: number;
  /** Editable. Editarla es lo que crea una version nueva. */
  etiqueta: string;
  datos: DatosVersion;
  /** false = retirada. No se borra: se versiona con activo=false. */
  activo: boolean;
  /** Por que se cambio. Obligatorio de la v2 en adelante. */
  motivo: string | null;
  creadoEn: string;
  /** Quien lo firmo. Nada con consecuencia clinica ocurre sin actor. */
  creadoPor: string;
}

/** `codigo@version` — como se nombra una version en evidencia y en la UI. */
export function identidadVersion(v: Pick<VersionEntrada, 'codigo' | 'version'>): string {
  return `${v.codigo}@${v.version}`;
}

/** Una diferencia entre dos versiones. Es lo que pinta el historico. */
export interface Diferencia {
  campo: string;
  antes: unknown;
  despues: unknown;
}

// ─────────────────────────────────────────────────────────────────
// Auditoria
// ─────────────────────────────────────────────────────────────────

export const ACCIONES = [
  'entrada.creada',
  'version.creada',
  'entrada.retirada',
  'entrada.restituida',
  'procesamiento.registrado',
] as const;
export type AccionAdmin = (typeof ACCIONES)[number];

/**
 * Evento de administracion. APPEND-ONLY: nadie edita ni borra, una correccion
 * es un evento nuevo (regla 4 del repo).
 *
 * Sin PII por construccion: aqui solo hay logica clinica y nombres de actor.
 * Ni `textoCrudo` ni `origen` pasan por este modulo.
 */
export interface EventoAdmin {
  id: string;
  ocurridoEn: string;
  actor: string;
  /** Como se autorizo: por rol real (1.3) o por token de plataforma. */
  via: string;
  accion: AccionAdmin;
  coleccion: Coleccion;
  codigo: string;
  version: number;
  motivo: string | null;
  cambios: Diferencia[];
}

/**
 * Un caso procesado con una version concreta. APPEND-ONLY.
 *
 * Es la fila que responde la pregunta de la tarea: "¿que version de prompt
 * proceso un caso de hace una semana?". Sin esta tabla, comparar la tasa de
 * aceptacion de marzo con la de abril compara dos motores distintos creyendo
 * que compara dos redes hospitalarias.
 */
export interface RegistroProcesamiento {
  id: string;
  casoId: string;
  coleccion: Modelo;
  codigo: string;
  version: number;
  procesadoEn: string;
}
