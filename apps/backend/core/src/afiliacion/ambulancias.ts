/**
 * Autoverificacion de operadores de ambulancia — tarea 2.9.
 *
 * Lo mismo que 2.1 pero contra los 225 prestadores de transporte asistencial
 * que la Secretaria de Salud publica (corte 01/07/2026): 112 con TAB, 53 con
 * TAM. Estaban en `data/procesado/ambulancias.json` desde el principio y no
 * los consumia nadie.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  EL PASO DE LA TAREA QUE NO SE PUEDE HACER, Y POR QUE
 * ═══════════════════════════════════════════════════════════════════
 *  El plan dice: «Cruce por NIT si esta, y por nombre con pg_trgm si no».
 *
 *  **El "si esta" nunca se cumple.** El CSV de transporte asistencial trae
 *  nueve columnas —prestador, sede, direccion, telefono, email y las tres
 *  marcas— y ninguna es el NIT. No es que este vacio en algunas filas: la
 *  columna no existe en la fuente.
 *
 *  Asi que el cruce es SIEMPRE por nombre normalizado. El camino por NIT
 *  esta escrito igual y se enciende solo el dia que la fuente lo traiga
 *  (`PrestadorAmbulancia.nit` ya existe, hoy siempre `null`), pero hoy no
 *  corre nunca y decirlo aqui es mas util que dejarlo parecer que si.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  LO QUE ESTE MODULO LE DA AL RESTO DEL SISTEMA
 * ═══════════════════════════════════════════════════════════════════
 *  La marca TAB/TAM precargada. Es lo que despues alimenta `movil.tipo` en
 *  la tarea 3.6, y `movil.tipo` es un FILTRO DURO del ruteo: un TAB no
 *  traslada un paciente que requiere ventilacion. Que esa marca venga del
 *  corte oficial y no de lo que el operador escriba en un formulario es la
 *  diferencia entre un filtro y una declaracion de buenas intenciones.
 */

import type { PrecargaOperador, TipoMovil } from '../contracts/types';
import {
  AMBULANCIAS_CATALOGO,
  type PrestadorAmbulancia,
} from './ambulancias.generado';
import { normalizarNit } from './nit';
import { UMBRAL_SIMILITUD, masParecido, normalizar } from './similitud';

export type ComoCruzo = 'nit' | 'nombre';

export interface CruceOperador {
  prestador: PrestadorAmbulancia;
  /** 1 cuando cruzo por NIT (es exacto); la similitud cuando fue por nombre. */
  puntaje: number;
  como: ComoCruzo;
}

/** Los tipos de movil que el corte oficial le reconoce al prestador. */
export function tiposMovilDe(p: PrestadorAmbulancia): TipoMovil[] {
  const tipos: TipoMovil[] = [];
  if (p.basico) tipos.push('TAB');
  if (p.medicalizado) tipos.push('TAM');
  return tipos;
}

/** Lo que el operador NO tiene que tipear porque el corte oficial ya lo sabe. */
export const precargaDe = (p: PrestadorAmbulancia): PrecargaOperador => ({
  prestador: p.prestador,
  direccion: p.direccion,
  telefono: p.telefono,
  correo: p.correo,
  tiposMovil: tiposMovilDe(p),
  urgencias: p.urgencias,
});

/**
 * Busca el prestador. NIT primero (exacto), nombre despues (trigrama).
 *
 * Devuelve el mejor candidato AUNQUE no llegue al umbral: quien llama
 * decide, y necesita el puntaje para explicarle al operador por que su
 * afiliacion queda `observada` en vez de solo decirle que no.
 */
export function buscarOperador(
  razonSocial: string,
  nit?: string,
  catalogo: readonly PrestadorAmbulancia[] = AMBULANCIAS_CATALOGO,
): CruceOperador | undefined {
  // Camino muerto hoy —ninguna fila trae NIT— y escrito a proposito. Ver la
  // cabecera: el dia que la fuente lo publique, esto se enciende solo.
  const nitLimpio = normalizarNit(nit);
  if (nitLimpio) {
    const porNit = catalogo.find(
      (p) => p.nit && normalizarNit(p.nit) === nitLimpio,
    );
    if (porNit) return { prestador: porNit, puntaje: 1, como: 'nit' };
  }

  if (!normalizar(razonSocial)) return undefined;

  // Se compara contra `prestador` Y contra `sede`: en 225 filas los dos
  // campos coinciden casi siempre, pero cuando difieren es porque la sede
  // lleva el nombre comercial y el prestador la razon social — y el que
  // afilia escribe cualquiera de los dos.
  const mejor = masParecido(razonSocial, catalogo, (p) =>
    similitudMayor(razonSocial, p),
  );
  return mejor && mejor.puntaje > 0
    ? { prestador: mejor.candidato, puntaje: mejor.puntaje, como: 'nombre' }
    : undefined;
}

/** true si el cruce alcanza para autoverificar sin ojo humano. */
export const cruceSuficiente = (cruce: CruceOperador): boolean =>
  cruce.como === 'nit' || cruce.puntaje >= UMBRAL_SIMILITUD;

/**
 * Devuelve el nombre del prestador o el de la sede, el que mas se parezca.
 *
 * `masParecido` espera un extractor de nombre, no un puntaje, asi que esto
 * elige cual de los dos nombres presentarle. Compara los dos y se queda con
 * el que gane — que es exactamente lo que haria un humano mirando la fila.
 */
function similitudMayor(consulta: string, p: PrestadorAmbulancia): string {
  const a = normalizar(consulta);
  const conPrestador = coincidencias(a, normalizar(p.prestador));
  const conSede = coincidencias(a, normalizar(p.sede));
  return conSede > conPrestador ? p.sede : p.prestador;
}

/** Palabras en comun. Barato y solo sirve para elegir cual de los dos nombres. */
function coincidencias(a: string, b: string): number {
  const palabras = new Set(b.split(' ').filter(Boolean));
  return a.split(' ').filter((p) => palabras.has(p)).length;
}
