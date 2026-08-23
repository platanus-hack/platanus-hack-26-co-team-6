/**
 * §7.2 del catalogo de validaciones, ejecutable:
 *
 *   "Tabla mantenida que traduce un diagnostico/perfil a los codigos de
 *    servicio REPS mandatorios. Es logica de negocio, no del LLM;
 *    **el LLM propone, la tabla decide** que servicios exigir.
 *    Falla: si un diagnostico no esta mapeado, escalar a criterio humano."
 *
 * ── POR QUE ESTO NO PUEDE VIVIR EN EL PROMPT ──────────────────────
 * Si el modelo decide que un IAM necesita hemodinamia, esa exigencia cambia
 * cada vez que cambia el modelo, la temperatura o el dictado — y cambia en
 * silencio. El filtro de servicios es DURO (invariante 1 del contrato): una
 * sede sin `743` jamas puede recibir un IAM con supra ST, este al lado o no.
 * Una regla dura no puede depender de una inferencia probabilistica.
 *
 * Lo que si aporta el modelo es el diagnostico. Eso es lo que propone. Lo que
 * de ahi se exige lo dice esta tabla, que un humano mantiene, versiona y firma.
 *
 * ── Y CUANDO LA TABLA NO SABE ─────────────────────────────────────
 * No se inventa. `sin-mapeo` no es un error tecnico: es un evento clinico que
 * dice "este caso necesita criterio humano". Es la misma regla 3 del repo que
 * hace que un ranking vacio escale al CRUE en vez de pintar una lista en
 * blanco. Rellenar el hueco con lo que propuso el LLM seria convertir una
 * sugerencia en un filtro duro sin que nadie lo firmara.
 *
 * Logica pura: sin Nest, sin almacen, sin HTTP.
 */

import type { VersionEntrada } from './tipos';
import { vigentesActivos } from './versionado';

/**
 * Longitud minima de un codigo CIE-10 util: la categoria de tres caracteres
 * (`I21`). Por debajo de eso ('I2', 'I') el prefijo agrupa capitulos enteros y
 * "cualquier cosa que empiece por I" no es un diagnostico.
 */
const MIN_CATEGORIA = 3;

/**
 * Normaliza un CIE-10 tal como viene del dictado o del LLM.
 *
 *   'i21.1' → 'I211'      ' I21 ' → 'I21'      'I21.10' → 'I2110'
 *
 * El punto es notacion, no dato: la OMS lo usa para separar categoria de
 * subcategoria y hay fuentes que lo omiten. Guardar los dos formatos haria que
 * `I21.1` y `I211` fueran entradas distintas del mapa, y un dia se editaria
 * una sola.
 */
export function normalizarDx(crudo: string | null | undefined): string {
  return (crudo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Cadena de prefijos de mas especifico a mas general: I211 → ['I211','I21']. */
export function prefijosDe(dx: string): string[] {
  const salida: string[] = [];
  for (let largo = dx.length; largo >= MIN_CATEGORIA; largo--) {
    salida.push(dx.slice(0, largo));
  }
  return salida;
}

export type MotivoSinMapeo =
  /** El dictado no alcanzo para un CIE-10. `caso.dxCie10` viene null. */
  | 'sin-diagnostico'
  /** El CIE-10 existe pero es demasiado corto para ser una categoria. */
  | 'diagnostico-incompleto'
  /** La tabla no tiene fila para ese diagnostico ni para su categoria. */
  | 'sin-entrada-en-tabla'
  /** Habia fila y un admin la retiro. Se trata igual: no se adivina. */
  | 'entrada-retirada';

export interface DxMapeado {
  estado: 'mapeado';
  /** El CIE-10 normalizado que se consulto. */
  dx: string;
  /** El codigo de la entrada que respondio: puede ser un prefijo del anterior. */
  codigo: string;
  etiqueta: string;
  version: number;
  /** true si la fila era del codigo exacto; false si respondio la categoria. */
  exacto: boolean;
  serviciosRequeridos: number[];
  complejidadMinima: string;
  requiereMedicoABordo: boolean;
  protocolo: string | null;
}

export interface DxSinMapeo {
  estado: 'sin-mapeo';
  dx: string;
  motivo: MotivoSinMapeo;
  /**
   * Lo unico que el sistema tiene permitido hacer aqui. No es un string
   * decorativo: es la instruccion que el resto del pipeline debe obedecer.
   */
  accion: 'escala-a-criterio-humano';
  mensaje: string;
}

export type ResolucionDx = DxMapeado | DxSinMapeo;

const MENSAJE: Record<MotivoSinMapeo, string> = {
  'sin-diagnostico':
    'El dictado no alcanzó para un diagnóstico CIE-10. Escala a criterio humano.',
  'diagnostico-incompleto':
    'El código CIE-10 es demasiado corto para identificar una categoría. Escala a criterio humano.',
  'sin-entrada-en-tabla':
    'Este diagnóstico no está en el mapa Dx→servicios. Escala a criterio humano: PULSO no inventa qué servicios exigir.',
  'entrada-retirada':
    'La entrada del mapa para este diagnóstico fue retirada. Escala a criterio humano.',
};

/**
 * Resuelve un diagnostico contra el mapa.
 *
 * `filas` es el historial COMPLETO del catalogo `mapa_dx`; aqui adentro se
 * queda con la version vigente de cada codigo. Recibe el historial y no la
 * lista ya filtrada para que no exista la forma de consultar una version
 * vieja por accidente: la operacion siempre usa la vigente.
 *
 * Busca del prefijo mas especifico al mas general (`I211` antes que `I21`) —
 * asi una subcategoria puede exigir mas que su categoria sin duplicar el
 * resto de la tabla.
 */
export function resolverDx(
  filas: readonly VersionEntrada[],
  dxCrudo: string | null | undefined,
): ResolucionDx {
  const dx = normalizarDx(dxCrudo);
  if (!dx) return sinMapeo('', 'sin-diagnostico');
  if (dx.length < MIN_CATEGORIA) return sinMapeo(dx, 'diagnostico-incompleto');

  // Todas las versiones vigentes, activas o no: hace falta distinguir "no
  // existe" de "existia y la retiraron", que son dos conversaciones distintas
  // con el admin aunque el efecto clinico sea el mismo.
  const vigentes = new Map<string, VersionEntrada>();
  for (const fila of filas) {
    const previa = vigentes.get(fila.codigo);
    if (!previa || fila.version > previa.version) vigentes.set(fila.codigo, fila);
  }

  for (const prefijo of prefijosDe(dx)) {
    const fila = vigentes.get(prefijo);
    if (!fila) continue;
    if (!fila.activo) return sinMapeo(dx, 'entrada-retirada');

    const datos = fila.datos as {
      serviciosRequeridos?: unknown;
      complejidadMinima?: unknown;
      requiereMedicoABordo?: unknown;
      protocolo?: unknown;
    };

    return {
      estado: 'mapeado',
      dx,
      codigo: fila.codigo,
      etiqueta: fila.etiqueta,
      version: fila.version,
      exacto: prefijo === dx,
      serviciosRequeridos: Array.isArray(datos.serviciosRequeridos)
        ? (datos.serviciosRequeridos as number[])
        : [],
      complejidadMinima:
        typeof datos.complejidadMinima === 'string' ? datos.complejidadMinima : 'media',
      requiereMedicoABordo: datos.requiereMedicoABordo === true,
      protocolo: typeof datos.protocolo === 'string' ? datos.protocolo : null,
    };
  }

  return sinMapeo(dx, 'sin-entrada-en-tabla');
}

function sinMapeo(dx: string, motivo: MotivoSinMapeo): DxSinMapeo {
  return {
    estado: 'sin-mapeo',
    dx,
    motivo,
    accion: 'escala-a-criterio-humano',
    mensaje: MENSAJE[motivo],
  };
}

// ─────────────────────────────────────────────────────────────────
// El LLM propone, la tabla decide
// ─────────────────────────────────────────────────────────────────

export type DecisionServicios =
  | {
      estado: 'tabla-decide';
      /** Lo unico que el filtro duro tiene permitido exigir. */
      serviciosRequeridos: number[];
      /**
       * Lo que el LLM propuso y la tabla NO exige. No se descarta en
       * silencio: se reporta para que un humano vea el desacuerdo. Un modelo
       * que propone hemodinamia donde la tabla no la pide puede estar
       * equivocado — o puede ser la senal de que a la tabla le falta una fila.
       */
      propuestosNoExigidos: number[];
      /** Lo que la tabla exige y el LLM no vio. La otra mitad del desacuerdo. */
      exigidosNoPropuestos: number[];
      codigo: string;
      version: number;
    }
  | {
      estado: 'escala-a-criterio-humano';
      motivo: MotivoSinMapeo;
      mensaje: string;
      /**
       * Se conserva lo que propuso el modelo para que el regulador lo vea,
       * PERO no se convierte en exigencia. Esa es la linea entera.
       */
      propuestoPorLlm: number[];
    };

/**
 * Cruza lo que propuso el modelo con lo que dice la tabla.
 *
 * La tabla gana siempre. Cuando la tabla no sabe, NADIE gana: escala.
 */
export function decidirServicios(
  resolucion: ResolucionDx,
  propuestoPorLlm: readonly number[],
): DecisionServicios {
  const propuesto = [...new Set(propuestoPorLlm)].sort((a, b) => a - b);

  if (resolucion.estado === 'sin-mapeo') {
    return {
      estado: 'escala-a-criterio-humano',
      motivo: resolucion.motivo,
      mensaje: resolucion.mensaje,
      propuestoPorLlm: propuesto,
    };
  }

  const exigidos = [...new Set(resolucion.serviciosRequeridos)].sort((a, b) => a - b);
  const setExigidos = new Set(exigidos);
  const setPropuestos = new Set(propuesto);

  return {
    estado: 'tabla-decide',
    serviciosRequeridos: exigidos,
    propuestosNoExigidos: propuesto.filter((s) => !setExigidos.has(s)),
    exigidosNoPropuestos: exigidos.filter((s) => !setPropuestos.has(s)),
    codigo: resolucion.codigo,
    version: resolucion.version,
  };
}

/** Los diagnosticos que la tabla cubre hoy. Lo pinta la consola. */
export function codigosCubiertos(filas: readonly VersionEntrada[]): string[] {
  return vigentesActivos(filas).map((f) => f.codigo);
}
