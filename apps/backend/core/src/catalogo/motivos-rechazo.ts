/**
 * Catalogo versionado de motivos de rechazo — tarea 0.6.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  POR QUE UN CATALOGO Y NO CUATRO STRINGS EN UN .tsx
 * ═══════════════════════════════════════════════════════════════════
 *  Cada rechazo es una fila del dataset que se auto-etiqueta — el activo
 *  del producto. Mientras el motivo viajaba como TEXTO LIBRE desde
 *  `MotivosCapacidad.tsx`, bastaba que alguien corrigiera una tilde para
 *  partir la serie historica en dos: "Sin camas UCI disponibles" y
 *  "Sin camas UCI" son la misma causa y dos claves distintas al agrupar.
 *
 *  El codigo es INMUTABLE y es lo que se guarda. La etiqueta es editable
 *  y es lo unico que se pinta. Cambiar una etiqueta no toca el historico.
 *
 *  La `categoria` es la que sostiene la tesis del producto: un rechazo
 *  por `capacidad` es la red saturada, uno `administrativo` es fricción
 *  que no tiene nada que ver con si hay o no una cama. Sin este campo no
 *  se pueden reportar aparte, y sin reportarlos aparte no se pueden
 *  atacar.
 *
 * ⚠️ NUNCA se borra ni se renombra un `codigo`. Un motivo que deja de
 *    ofrecerse se marca `vigente: false`: el handshake de hace tres meses
 *    tiene que seguir resolviendo su etiqueta.
 */

import type {
  CategoriaMotivoRechazo,
  MotivoRechazoCatalogo,
} from '../contracts/types';

/** Sube cuando se agrega, retira o reetiqueta un motivo. Viaja en la respuesta. */
export const VERSION_MOTIVOS_RECHAZO = 2;

/**
 * Los cuatro que ya existian + el quinto que faltaba.
 *
 * `SIN_CLARIDAD_PAGADOR` es el motivo real que hoy nadie reporta porque no
 * existe el boton: la sede dice "saturacion" y la verdadera causa —que no
 * esta clara la EPS que responde— se pierde. Es incomodo en el pitch y es
 * exactamente lo que hay que decir: medirlo es lo unico que permite atacarlo.
 *
 * Ley 1751/2015: ninguno de estos motivos niega la atencion inicial de
 * urgencias. Son DECLARACIONES DE CAPACIDAD con fecha y hora, y en triage I
 * no se ofrecen (ver `MotivosCapacidad.tsx` y `SolicitudTraslado.tsx`).
 */
export const MOTIVOS_RECHAZO: readonly MotivoRechazoCatalogo[] = [
  {
    codigo: 'SIN_CAMAS_UCI',
    etiqueta: 'Sin camas UCI disponibles',
    categoria: 'capacidad',
    version: 1,
    vigente: true,
  },
  {
    codigo: 'HEMODINAMIA_OCUPADA',
    etiqueta: 'Sala de hemodinamia en procedimiento',
    categoria: 'tecnico',
    version: 1,
    vigente: true,
  },
  {
    codigo: 'URGENCIAS_SATURADAS',
    etiqueta: 'Urgencias en capacidad máxima',
    categoria: 'capacidad',
    version: 1,
    vigente: true,
  },
  {
    codigo: 'SIN_ESPECIALISTA',
    etiqueta: 'Sin especialista de turno',
    categoria: 'recurso_humano',
    version: 1,
    vigente: true,
  },
  {
    codigo: 'SIN_CLARIDAD_PAGADOR',
    etiqueta: 'Sin claridad del pagador',
    categoria: 'administrativo',
    version: 2,
    vigente: true,
  },
] as const;

/** El que se guarda cuando la respuesta no trae codigo (webhook, cliente viejo). */
export const MOTIVO_POR_DEFECTO = 'URGENCIAS_SATURADAS';

const POR_CODIGO = new Map(MOTIVOS_RECHAZO.map((m) => [m.codigo, m]));

export function motivoPorCodigo(
  codigo: string | null | undefined,
): MotivoRechazoCatalogo | undefined {
  return codigo ? POR_CODIGO.get(codigo) : undefined;
}

/** Lo que se pinta. Un codigo desconocido no revienta: se devuelve tal cual. */
export function etiquetaDeMotivo(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  return POR_CODIGO.get(codigo)?.etiqueta ?? codigo;
}

export function categoriaDeMotivo(
  codigo: string | null | undefined,
): CategoriaMotivoRechazo | undefined {
  return motivoPorCodigo(codigo)?.categoria;
}

/**
 * Texto libre → codigo, SOLO para no perder lo que ya existe.
 *
 * Los clientes viejos (y el webhook de Telegram antes de 3.5) mandan la
 * etiqueta como texto. Se resuelve por coincidencia exacta de etiqueta; si no
 * cruza, no se inventa un codigo: el texto se conserva en `motivoRechazo` y
 * `motivoCodigo` queda nulo. Un codigo inventado ensucia el dataset mas de lo
 * que lo ensucia un hueco.
 */
export function codigoDesdeEtiqueta(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const normal = texto.trim().toLowerCase();
  return (
    MOTIVOS_RECHAZO.find((m) => m.etiqueta.toLowerCase() === normal)?.codigo ??
    null
  );
}
