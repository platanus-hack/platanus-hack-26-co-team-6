/**
 * La maquina de versionado. Logica pura: ni Nest, ni almacen, ni HTTP.
 *
 * ── LA REGLA QUE DECIDE TODO ──────────────────────────────────────
 *
 *   Cambiar una etiqueta crea una version nueva; el codigo NUNCA cambia.
 *
 * El codigo es la clave con la que el dataset historico se compara consigo
 * mismo. Si `SIN_CAMA_UCI` pasara a llamarse `UCI_LLENA` porque alguien
 * prefirio el texto, todos los rechazos anteriores dejarian de agruparse con
 * los siguientes y la serie se partiria en dos sin que nadie lo notara — el
 * grafico seguiria dibujando algo.
 *
 * La etiqueta, en cambio, cambia todo el tiempo: la redacta un comite, la
 * corrige un jefe de urgencias, se le quita una tilde. Nada de eso puede tocar
 * el dataset. Por eso editar una etiqueta AGREGA UNA FILA en vez de modificar
 * la que hay: el historico conserva la etiqueta que se le mostro al humano el
 * dia que decidio, que es la unica que explica su decision.
 *
 * ── APPEND-ONLY ───────────────────────────────────────────────────
 * Ninguna funcion de este archivo modifica una entrada existente. Todas
 * devuelven una entrada nueva. Retirar tampoco borra: es una version con
 * `activo: false`.
 */

import type { Coleccion, Diferencia, VersionEntrada } from './tipos';

/**
 * Forma de un codigo. Mayusculas, digitos, guion bajo, punto y guion.
 *
 * Cerrado a proposito: el codigo viaja a eventos de auditoria, a nombres de
 * columna de exportaciones y a URLs. Un codigo con espacios o tildes es un
 * campo inyectable disfrazado de dato de negocio. Y como es INMUTABLE, un
 * codigo mal puesto se queda para siempre: la unica defensa es no aceptarlo.
 */
export const FORMA_CODIGO = /^[A-Z0-9][A-Z0-9_.-]{1,63}$/;

export function codigoValido(codigo: string): boolean {
  return FORMA_CODIGO.test(codigo);
}

/**
 * Normaliza un codigo tal como lo tecleo un humano. NO lo "arregla": si tras
 * normalizar no cumple la forma, quien llame debe rechazarlo. Un codigo que se
 * autocorrige es un codigo que un dia se autocorrige distinto.
 */
export function normalizarCodigo(crudo: string): string {
  return (crudo ?? '').trim().toUpperCase();
}

// ─────────────────────────────────────────────────────────────────
// Lectura del historial
// ─────────────────────────────────────────────────────────────────

/** Todas las versiones de un codigo, de la mas vieja a la mas nueva. */
export function historialDe(
  filas: readonly VersionEntrada[],
  codigo: string,
): VersionEntrada[] {
  return filas
    .filter((f) => f.codigo === codigo)
    .sort((a, b) => a.version - b.version);
}

/**
 * La version que manda hoy: la de numero mas alto. Derivada, no almacenada
 * — ver el comentario de `VersionEntrada` en tipos.ts.
 */
export function vigente(filas: readonly VersionEntrada[]): VersionEntrada | undefined {
  return filas.reduce<VersionEntrada | undefined>(
    (mejor, f) => (!mejor || f.version > mejor.version ? f : mejor),
    undefined,
  );
}

/** La version vigente de CADA codigo, ordenada por codigo. */
export function vigentesPorCodigo(filas: readonly VersionEntrada[]): VersionEntrada[] {
  const porCodigo = new Map<string, VersionEntrada>();
  for (const fila of filas) {
    const previa = porCodigo.get(fila.codigo);
    if (!previa || fila.version > previa.version) porCodigo.set(fila.codigo, fila);
  }
  return [...porCodigo.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/** Lo que la operacion puede usar hoy: vigente Y no retirado. */
export function vigentesActivos(filas: readonly VersionEntrada[]): VersionEntrada[] {
  return vigentesPorCodigo(filas).filter((f) => f.activo);
}

export function siguienteVersion(filas: readonly VersionEntrada[], codigo: string): number {
  const ultima = vigente(historialDe(filas, codigo));
  return ultima ? ultima.version + 1 : 1;
}

// ─────────────────────────────────────────────────────────────────
// Comparar dos versiones
// ─────────────────────────────────────────────────────────────────

/**
 * Que cambio entre dos versiones. Es lo que pinta el historico de la consola:
 * un listado de versiones sin el diff obliga a leer dos JSON en paralelo, y
 * nadie lo hace.
 *
 * `datos` se compara campo por campo, no como bloque: decir "cambiaron los
 * datos" en una entrada del mapa Dx esconde justo lo que importa, que es si
 * se agrego o se quito un servicio REPS obligatorio.
 */
export function compararVersiones(
  antes: Pick<VersionEntrada, 'etiqueta' | 'activo' | 'datos'>,
  despues: Pick<VersionEntrada, 'etiqueta' | 'activo' | 'datos'>,
): Diferencia[] {
  const cambios: Diferencia[] = [];

  if (antes.etiqueta !== despues.etiqueta) {
    cambios.push({ campo: 'etiqueta', antes: antes.etiqueta, despues: despues.etiqueta });
  }
  if (antes.activo !== despues.activo) {
    cambios.push({ campo: 'activo', antes: antes.activo, despues: despues.activo });
  }

  const claves = [
    ...new Set([...Object.keys(antes.datos ?? {}), ...Object.keys(despues.datos ?? {})]),
  ].sort();

  for (const clave of claves) {
    const a = (antes.datos ?? {})[clave];
    const d = (despues.datos ?? {})[clave];
    if (!iguales(a, d)) {
      cambios.push({ campo: `datos.${clave}`, antes: a, despues: d });
    }
  }

  return cambios;
}

/**
 * Igualdad estructural con orden estable.
 *
 * `JSON.stringify` a secas diria que `{a:1,b:2}` y `{b:2,a:1}` son distintos, y
 * eso crearia una version nueva cada vez que el navegador serializa las claves
 * en otro orden. Una version fantasma es peor que ninguna: ensucia el historico
 * justo donde se va a buscar el cambio real.
 */
function iguales(a: unknown, b: unknown): boolean {
  return estable(a) === estable(b);
}

function estable(valor: unknown): string {
  return JSON.stringify(ordenar(valor));
}

function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === 'object') {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([x], [y]) => x.localeCompare(y));
    return Object.fromEntries(entradas.map(([k, v]) => [k, ordenar(v)]));
  }
  return valor;
}

// ─────────────────────────────────────────────────────────────────
// Proponer una version
// ─────────────────────────────────────────────────────────────────

export interface Borrador {
  etiqueta: string;
  datos: Record<string, unknown>;
  activo: boolean;
  motivo: string | null;
}

export interface Contexto {
  id: string;
  actor: string;
  ahora: string;
}

export type Propuesta =
  /** Hay cambio real: esta es la fila que hay que insertar. */
  | { estado: 'nueva-version'; entrada: VersionEntrada; cambios: Diferencia[] }
  /**
   * El borrador es identico a la version vigente. NO se crea version.
   *
   * Es lo que hace idempotente al endpoint: el doble clic de un admin con mala
   * conexion no deja dos versiones iguales separadas por 300 ms, que es
   * exactamente el ruido que vuelve inutil un historico.
   */
  | { estado: 'sin-cambios'; entrada: VersionEntrada }
  /** Falta el motivo, que es obligatorio de la v2 en adelante. */
  | { estado: 'falta-motivo' };

/**
 * Construye la version siguiente de un codigo que YA existe.
 *
 * Fijate en lo que NO recibe: el codigo del borrador. Se toma siempre del
 * historial. Es la forma estructural de garantizar que el codigo no cambia —
 * no hay parametro por donde colarlo. Quien recibe un codigo en el cuerpo de
 * la peticion tiene que compararlo con el de la ruta y rechazar la diferencia
 * antes de llegar aqui.
 *
 * El motivo es obligatorio a partir de la v2 porque una version sin motivo es
 * una fila que dentro de seis meses nadie sabra explicar, y explicar por que
 * cambio la logica clinica es la mitad del punto de versionarla.
 */
export function proponerVersion(
  historial: readonly VersionEntrada[],
  borrador: Borrador,
  ctx: Contexto,
): Propuesta {
  const actual = vigente(historial);
  if (!actual) {
    throw new Error('proponerVersion() necesita al menos una version previa');
  }

  const cambios = compararVersiones(actual, borrador);
  if (cambios.length === 0) return { estado: 'sin-cambios', entrada: actual };

  const motivo = (borrador.motivo ?? '').trim();
  if (!motivo) return { estado: 'falta-motivo' };

  return {
    estado: 'nueva-version',
    cambios,
    entrada: {
      id: ctx.id,
      coleccion: actual.coleccion,
      // Del historial, nunca del borrador. Ver el docblock.
      codigo: actual.codigo,
      version: actual.version + 1,
      etiqueta: borrador.etiqueta,
      datos: borrador.datos,
      activo: borrador.activo,
      motivo,
      creadoEn: ctx.ahora,
      creadoPor: ctx.actor,
    },
  };
}

/** La version 1 de un codigo nuevo. Aqui el motivo si es opcional: no hay nada que explicar todavia. */
export function primeraVersion(
  coleccion: Coleccion,
  codigo: string,
  borrador: Omit<Borrador, 'activo'> & { activo?: boolean },
  ctx: Contexto,
): VersionEntrada {
  return {
    id: ctx.id,
    coleccion,
    codigo,
    version: 1,
    etiqueta: borrador.etiqueta,
    datos: borrador.datos,
    activo: borrador.activo ?? true,
    motivo: (borrador.motivo ?? '').trim() || null,
    creadoEn: ctx.ahora,
    creadoPor: ctx.actor,
  };
}
