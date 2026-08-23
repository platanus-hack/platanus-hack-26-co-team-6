/**
 * El modelo de los catálogos versionados, sin React.
 *
 * Mismo patrón que `sesion-modelo.ts`: aquí vive la lógica que decide qué pasa
 * cuando alguien edita una etiqueta, y eso hay que poder probarlo. El frontend
 * no tiene runner de tests, pero `node --test` corre este archivo tal cual
 * porque su única dependencia es zod. Los tests están al lado, en
 * `catalogos-modelo.test.mts`.
 *
 * ── LA REGLA QUE ATRAVIESA TODO ───────────────────────────────────
 *
 *   El **código** es inmutable. La **etiqueta** es editable. Editarla no
 *   modifica nada: crea una versión nueva.
 *
 * El código es la clave estable con la que se compara el dataset histórico de
 * aceptación y rechazo — el activo del producto. La etiqueta es lo que lee un
 * humano y cambia cada vez que un comité la redacta mejor. Si las dos cosas
 * fueran la misma, dos casos de meses distintos dejarían de ser comparables y
 * nadie se enteraría: el gráfico seguiría dibujando algo.
 *
 * ── POR QUÉ ESTA LÓGICA ESTÁ TAMBIÉN EN EL SERVIDOR ───────────────
 * Porque **el servidor es el que manda**. `core/src/admin/versionado.ts` es la
 * autoridad: rechaza el renombre, exige el motivo y decide el número de
 * versión. Lo de aquí es para que la consola pueda decir *antes* de enviar
 * "esto va a crear la versión 3" o "esto no cambia nada", y para pintar el
 * diff del histórico sin una llamada de red por cada fila. Es el mismo trato
 * que `lib/types.ts`: un espejo manual y declarado, no una fuente paralela.
 */

import { z } from "zod";

// ── Colecciones ──────────────────────────────────────────────────

export const CATALOGOS = ["motivo_rechazo", "protocolo", "mapa_dx"] as const;
export type Catalogo = (typeof CATALOGOS)[number];

export const MODELOS = ["prompt_clinico", "config_scoring"] as const;
export type Modelo = (typeof MODELOS)[number];

export type Coleccion = Catalogo | Modelo;

/** Cómo se llama cada colección en pantalla. Con tildes: esto lo lee alguien. */
export const NOMBRE_COLECCION: Record<Coleccion, string> = {
  motivo_rechazo: "Motivos de rechazo",
  protocolo: "Protocolos clínicos",
  mapa_dx: "Mapa Dx → servicios",
  prompt_clinico: "Prompt clínico",
  config_scoring: "Config de scoring",
};

/** Una línea que explica para qué sirve cada catálogo. */
export const PROPOSITO_COLECCION: Record<Coleccion, string> = {
  motivo_rechazo:
    "Enum cerrado. Es la etiqueta con la que se auto-etiqueta el dataset de aceptación.",
  protocolo: "Códigos clínicos y sus ventanas de tiempo.",
  mapa_dx:
    "Traduce un diagnóstico a los servicios REPS que la sede receptora debe tener. El LLM propone, esta tabla decide.",
  prompt_clinico: "Con qué se leyó el dictado. Se versiona la identidad, no una tercera copia del texto.",
  config_scoring: "Los parámetros calibrables del ranking. Todo en minutos.",
};

// ── La forma de una versión ──────────────────────────────────────

const esquemaVersion = z.object({
  id: z.string(),
  coleccion: z.string(),
  codigo: z.string(),
  version: z.number(),
  etiqueta: z.string(),
  datos: z.record(z.string(), z.unknown()).default({}),
  activo: z.boolean(),
  motivo: z.string().nullable().default(null),
  creadoEn: z.string(),
  creadoPor: z.string(),
});

export type VersionEntrada = z.infer<typeof esquemaVersion>;

export const esquemaDiferencia = z.object({
  campo: z.string(),
  antes: z.unknown(),
  despues: z.unknown(),
});

export type Diferencia = z.infer<typeof esquemaDiferencia>;

export const esquemaHistorial = z.object({
  codigo: z.string(),
  vigente: esquemaVersion,
  versiones: z.array(esquemaVersion),
  cambios: z.array(z.array(esquemaDiferencia)),
});

export type Historial = z.infer<typeof esquemaHistorial>;

export const esquemaCatalogos = z.object({
  catalogos: z.array(
    z.object({ catalogo: z.string(), entradas: z.array(esquemaVersion) }),
  ),
  persistencia: z.string().optional(),
});

export const esquemaEvento = z.object({
  id: z.string(),
  ocurridoEn: z.string(),
  actor: z.string(),
  via: z.string(),
  accion: z.string(),
  coleccion: z.string(),
  codigo: z.string(),
  version: z.number(),
  motivo: z.string().nullable().default(null),
  cambios: z.array(esquemaDiferencia).default([]),
});

export type EventoAdmin = z.infer<typeof esquemaEvento>;

/**
 * Estado de acceso a la consola.
 *
 * `permitido: false` NO es un error: es la respuesta normal mientras core no
 * emita roles (tarea 1.3). La consola tiene que poder contarlo.
 */
export const esquemaAcceso = z.object({
  permitido: z.boolean(),
  actor: z.string().optional(),
  via: z.string().optional(),
  motivo: z.string().optional(),
  mensaje: z.string().optional(),
  identidadReal: z.boolean().default(false),
  persistencia: z.string().default("memoria"),
  degradacion: z.array(z.string()).default([]),
});

export type Acceso = z.infer<typeof esquemaAcceso>;

/**
 * Lo que devuelve el servidor no se cree a ciegas.
 *
 * Un cuerpo que no se entiende se descarta: la consola pinta "no se pudo
 * leer" en vez de romperse a media pantalla. Core más nuevo que este build
 * manda campos de más y `zod` los ignora sin quejarse — que es exactamente lo
 * que queremos.
 */
export function leerVersiones(crudo: unknown): VersionEntrada[] {
  const leido = z.array(esquemaVersion).safeParse(crudo);
  return leido.success ? leido.data : [];
}

// ── El código es inmutable ───────────────────────────────────────

/** Misma forma que exige el servidor y que impone el check de la migración 0008. */
export const FORMA_CODIGO = /^[A-Z0-9][A-Z0-9_.-]{1,63}$/;

export function codigoValido(codigo: string): boolean {
  return FORMA_CODIGO.test(codigo);
}

/** Sube a mayúsculas y recorta. No "arregla" lo que está mal: eso lo rechaza quien llame. */
export function normalizarCodigo(crudo: string): string {
  return (crudo ?? "").trim().toUpperCase();
}

/**
 * Por qué un código no sirve, en palabras que se puedan pintar bajo el campo.
 * null = sirve.
 *
 * Importa más que en otros formularios: el código **no se puede corregir
 * después**. Un mensaje genérico aquí es un error permanente en el dataset.
 */
export function problemaDeCodigo(crudo: string): string | null {
  const codigo = normalizarCodigo(crudo);
  if (!codigo) return "El código es obligatorio y no se puede cambiar después.";
  if (codigo.length < 2) return "Mínimo 2 caracteres.";
  if (codigo.length > 64) return "Máximo 64 caracteres.";
  if (!codigoValido(codigo)) {
    return "Solo mayúsculas, dígitos, guion bajo, punto o guion. Sin espacios ni tildes.";
  }
  return null;
}

// ── Leer el historial ────────────────────────────────────────────

export function historialDe(
  filas: readonly VersionEntrada[],
  codigo: string,
): VersionEntrada[] {
  return filas.filter((f) => f.codigo === codigo).sort((a, b) => a.version - b.version);
}

/** La que manda: la de número más alto. Derivada, nunca un campo. */
export function vigente(
  filas: readonly VersionEntrada[],
): VersionEntrada | undefined {
  return filas.reduce<VersionEntrada | undefined>(
    (mejor, f) => (!mejor || f.version > mejor.version ? f : mejor),
    undefined,
  );
}

export function siguienteVersion(
  filas: readonly VersionEntrada[],
  codigo: string,
): number {
  const ultima = vigente(historialDe(filas, codigo));
  return ultima ? ultima.version + 1 : 1;
}

/** `codigo@version`. Así se nombra una versión en la UI y en la evidencia. */
export function identidad(v: Pick<VersionEntrada, "codigo" | "version">): string {
  return `${v.codigo}@${v.version}`;
}

// ── Comparar dos versiones ───────────────────────────────────────

/**
 * Qué cambió. `datos` se desglosa campo por campo: decir "cambiaron los datos"
 * en una fila del mapa Dx esconde justo lo que importa, que es si se agregó o
 * se quitó un servicio REPS obligatorio.
 */
export function compararVersiones(
  antes: Pick<VersionEntrada, "etiqueta" | "activo" | "datos">,
  despues: Pick<VersionEntrada, "etiqueta" | "activo" | "datos">,
): Diferencia[] {
  const cambios: Diferencia[] = [];

  if (antes.etiqueta !== despues.etiqueta) {
    cambios.push({ campo: "etiqueta", antes: antes.etiqueta, despues: despues.etiqueta });
  }
  if (antes.activo !== despues.activo) {
    cambios.push({ campo: "activo", antes: antes.activo, despues: despues.activo });
  }

  const claves = [
    ...new Set([
      ...Object.keys(antes.datos ?? {}),
      ...Object.keys(despues.datos ?? {}),
    ]),
  ].sort();

  for (const clave of claves) {
    const a = (antes.datos ?? {})[clave];
    const d = (despues.datos ?? {})[clave];
    if (estable(a) !== estable(d)) {
      cambios.push({ campo: `datos.${clave}`, antes: a, despues: d });
    }
  }

  return cambios;
}

/**
 * Serialización con orden de claves estable.
 *
 * Sin esto, `{a:1,b:2}` y `{b:2,a:1}` contarían como un cambio y la consola
 * ofrecería crear una versión donde no hay ninguna. Una versión fantasma
 * ensucia el histórico justo donde alguien va a buscar el cambio real.
 */
function estable(valor: unknown): string {
  return JSON.stringify(ordenar(valor));
}

function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([x], [y]) => x.localeCompare(y));
    return Object.fromEntries(entradas.map(([k, v]) => [k, ordenar(v)]));
  }
  return valor;
}

/** Una diferencia en texto, para la lista del histórico. */
export function describirDiferencia(d: Diferencia): string {
  const campo = d.campo === "activo" ? "estado" : d.campo.replace(/^datos\./, "");
  if (d.campo === "activo") {
    return d.despues === false ? "estado: retirada" : "estado: restituida";
  }
  return `${campo}: ${resumir(d.antes)} → ${resumir(d.despues)}`;
}

function resumir(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "string") return valor.length > 60 ? `${valor.slice(0, 57)}…` : valor;
  return JSON.stringify(valor);
}

// ── Previsualizar el guardado ────────────────────────────────────

export interface Borrador {
  etiqueta: string;
  datos: Record<string, unknown>;
  activo: boolean;
  motivo: string;
}

export type Previsualizacion =
  /** Nada cambió. El botón se deshabilita y se dice por qué. */
  | { accion: "sin-cambios"; version: number }
  /** Falta el motivo, obligatorio de la v2 en adelante. */
  | { accion: "falta-motivo"; version: number; cambios: Diferencia[] }
  /** Listo para enviar: esto va a crear la versión N. */
  | { accion: "nueva-version"; version: number; cambios: Diferencia[] };

/**
 * Qué va a pasar si se toca "guardar", **antes** de tocarlo.
 *
 * Existe para que la consola no mienta en las dos direcciones: ni ofrecer
 * guardar algo que no cambia nada, ni dejar creer que se está editando en
 * sitio cuando lo que va a salir es una versión nueva. La decisión final es
 * del servidor; esto solo la anticipa con las mismas reglas.
 */
export function previsualizar(
  actual: VersionEntrada,
  borrador: Borrador,
): Previsualizacion {
  const cambios = compararVersiones(actual, borrador);
  if (cambios.length === 0) return { accion: "sin-cambios", version: actual.version };

  const version = actual.version + 1;
  if (!borrador.motivo.trim()) return { accion: "falta-motivo", version, cambios };

  return { accion: "nueva-version", version, cambios };
}

// ── El mapa Dx → servicios (§7.2) ────────────────────────────────

const MIN_CATEGORIA = 3;

/** El punto es notación, no dato: `I21.1` e `I211` son el mismo código. */
export function normalizarDx(crudo: string | null | undefined): string {
  return (crudo ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** De más específico a más general: `I211` → `['I211','I21']`. */
export function prefijosDe(dx: string): string[] {
  const salida: string[] = [];
  for (let largo = dx.length; largo >= MIN_CATEGORIA; largo--) {
    salida.push(dx.slice(0, largo));
  }
  return salida;
}

export type MotivoSinMapeo =
  | "sin-diagnostico"
  | "diagnostico-incompleto"
  | "sin-entrada-en-tabla"
  | "entrada-retirada";

export interface DxMapeado {
  estado: "mapeado";
  dx: string;
  codigo: string;
  etiqueta: string;
  version: number;
  exacto: boolean;
  serviciosRequeridos: number[];
  complejidadMinima: string;
  requiereMedicoABordo: boolean;
  protocolo: string | null;
}

export interface DxSinMapeo {
  estado: "sin-mapeo";
  dx: string;
  motivo: MotivoSinMapeo;
  accion: "escala-a-criterio-humano";
  mensaje: string;
}

export type ResolucionDx = DxMapeado | DxSinMapeo;

export const MENSAJE_SIN_MAPEO: Record<MotivoSinMapeo, string> = {
  "sin-diagnostico":
    "El dictado no alcanzó para un diagnóstico CIE-10. Escala a criterio humano.",
  "diagnostico-incompleto":
    "El código CIE-10 es demasiado corto para identificar una categoría. Escala a criterio humano.",
  "sin-entrada-en-tabla":
    "Este diagnóstico no está en el mapa Dx→servicios. Escala a criterio humano: PULSO no inventa qué servicios exigir.",
  "entrada-retirada":
    "La entrada del mapa para este diagnóstico fue retirada. Escala a criterio humano.",
};

/**
 * Resuelve un diagnóstico contra el mapa que la consola ya tiene cargado.
 *
 * Es el mismo algoritmo del servidor, y esa es la gracia: el probador de la
 * consola contesta al instante mientras se teclea, sin una llamada por
 * pulsación, y contesta lo mismo que contestaría core.
 */
export function resolverDx(
  filas: readonly VersionEntrada[],
  dxCrudo: string | null | undefined,
): ResolucionDx {
  const dx = normalizarDx(dxCrudo);
  if (!dx) return sinMapeo("", "sin-diagnostico");
  if (dx.length < MIN_CATEGORIA) return sinMapeo(dx, "diagnostico-incompleto");

  const vigentes = new Map<string, VersionEntrada>();
  for (const fila of filas) {
    const previa = vigentes.get(fila.codigo);
    if (!previa || fila.version > previa.version) vigentes.set(fila.codigo, fila);
  }

  for (const prefijo of prefijosDe(dx)) {
    const fila = vigentes.get(prefijo);
    if (!fila) continue;
    // Retirada y "nunca existió" tienen el mismo efecto clínico y distinta
    // conversación con el admin. No se confunden.
    if (!fila.activo) return sinMapeo(dx, "entrada-retirada");

    const datos = fila.datos as Record<string, unknown>;
    return {
      estado: "mapeado",
      dx,
      codigo: fila.codigo,
      etiqueta: fila.etiqueta,
      version: fila.version,
      exacto: prefijo === dx,
      serviciosRequeridos: Array.isArray(datos.serviciosRequeridos)
        ? (datos.serviciosRequeridos as number[])
        : [],
      complejidadMinima:
        typeof datos.complejidadMinima === "string" ? datos.complejidadMinima : "media",
      requiereMedicoABordo: datos.requiereMedicoABordo === true,
      protocolo: typeof datos.protocolo === "string" ? datos.protocolo : null,
    };
  }

  return sinMapeo(dx, "sin-entrada-en-tabla");
}

function sinMapeo(dx: string, motivo: MotivoSinMapeo): DxSinMapeo {
  return {
    estado: "sin-mapeo",
    dx,
    motivo,
    accion: "escala-a-criterio-humano",
    mensaje: MENSAJE_SIN_MAPEO[motivo],
  };
}

export type DecisionServicios =
  | {
      estado: "tabla-decide";
      serviciosRequeridos: number[];
      propuestosNoExigidos: number[];
      exigidosNoPropuestos: number[];
      codigo: string;
      version: number;
    }
  | {
      estado: "escala-a-criterio-humano";
      motivo: MotivoSinMapeo;
      mensaje: string;
      propuestoPorLlm: number[];
    };

/**
 * El LLM propone, la tabla decide.
 *
 * Cuando la tabla no sabe, **nadie** decide: escala. Lo que propuso el modelo
 * se conserva para que un humano lo vea, y no hay campo por el que salga
 * convertido en exigencia. Esa es la línea entera de §7.2.
 */
export function decidirServicios(
  resolucion: ResolucionDx,
  propuestoPorLlm: readonly number[],
): DecisionServicios {
  const propuesto = [...new Set(propuestoPorLlm)].sort((a, b) => a - b);

  if (resolucion.estado === "sin-mapeo") {
    return {
      estado: "escala-a-criterio-humano",
      motivo: resolucion.motivo,
      mensaje: resolucion.mensaje,
      propuestoPorLlm: propuesto,
    };
  }

  const exigidos = [...new Set(resolucion.serviciosRequeridos)].sort((a, b) => a - b);
  const setExigidos = new Set(exigidos);
  const setPropuestos = new Set(propuesto);

  return {
    estado: "tabla-decide",
    serviciosRequeridos: exigidos,
    propuestosNoExigidos: propuesto.filter((s) => !setExigidos.has(s)),
    exigidosNoPropuestos: exigidos.filter((s) => !setPropuestos.has(s)),
    codigo: resolucion.codigo,
    version: resolucion.version,
  };
}

// ── Modelos ──────────────────────────────────────────────────────

export const esquemaVistaModelo = z.object({
  coleccion: z.string(),
  vigentes: z.array(esquemaVersion).default([]),
  historial: z.array(esquemaVersion).default([]),
});

export type VistaModelo = z.infer<typeof esquemaVistaModelo>;

export const esquemaVersionesModelo = z.object({
  modelos: z.array(esquemaVistaModelo).default([]),
  persistencia: z.string().optional(),
});

// ── Con qué se procesó un caso ───────────────────────────────────

export const esquemaProcesamiento = z.object({
  registro: z.object({
    id: z.string(),
    casoId: z.string(),
    coleccion: z.string(),
    codigo: z.string(),
    version: z.number(),
    procesadoEn: z.string(),
  }),
  version: esquemaVersion.nullable().default(null),
  versionesPosteriores: z.number().default(0),
});

export type Procesamiento = z.infer<typeof esquemaProcesamiento>;

export const esquemaCasoProcesado = z.object({
  casoId: z.string(),
  procesamientos: z.array(esquemaProcesamiento).default([]),
  sinRegistro: z.boolean().default(true),
  nota: z.string().nullable().default(null),
});

export type CasoProcesado = z.infer<typeof esquemaCasoProcesado>;

/**
 * Si un caso se puede comparar con los de hoy.
 *
 * `versionesPosteriores > 0` significa que el motor cambió desde entonces. No
 * es un error — es el aviso que evita leer una tasa de aceptación de marzo
 * como si fuera del mismo sistema que la de agosto.
 */
export function comparableConHoy(p: Procesamiento): boolean {
  return p.versionesPosteriores === 0;
}

/** Un resumen legible del desfase, para pintarlo junto al caso. */
export function describirDesfase(p: Procesamiento): string {
  if (p.versionesPosteriores === 0) return "Sigue siendo la versión vigente.";
  const n = p.versionesPosteriores;
  return `Han salido ${n} ${n === 1 ? "versión" : "versiones"} desde entonces: este caso no es directamente comparable con los de hoy.`;
}
