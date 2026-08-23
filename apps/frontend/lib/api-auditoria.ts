/**
 * Cliente de la línea de tiempo y del expediente forense.
 *
 * Vive fuera de `lib/api.ts` a propósito: ese archivo es el más compartido del
 * frontend y crecer por acumulación lo convierte en el sitio donde chocan
 * todos los merges. Lo que NO se duplica aquí —y por eso todo pasa por
 * `pedir`— es `credentials: "include"`, la renovación silenciosa de la sesión
 * y la lectura de los dos formatos de error de core. Un `fetch` suelto se
 * salta las tres.
 */

import { ErrorApi, pedir } from "./api";
import { leerExpediente, type ExpedienteCaso } from "./auditoria-modelo";

/** Un `evento_caso` tal como lo devuelve core. */
export interface EventoCasoCliente {
  id: number;
  casoId: string;
  tipo: string;
  actor: { id: string | null; nombre: string | null; tipo: "humano" | "servicio" | "sistema" };
  organizacionId: string | null;
  movilId: string | null;
  codigoSede: string | null;
  detalle: Record<string, unknown>;
  corrigeA: number | null;
  claveIdempotencia: string | null;
  ocurridoEn: string;
}

export interface RespuestaEventos {
  eventos: EventoCasoCliente[];
  /** 'memoria' = el registro se pierde si core reinicia. La UI lo dice. */
  modo: "memoria" | "postgres";
}

/** La línea de tiempo operativa de un caso. No registra acceso. */
export function eventosDeCaso(casoId: string): Promise<RespuestaEventos> {
  return pedir<RespuestaEventos>(
    `/casos/${encodeURIComponent(casoId)}/eventos`,
    { cache: "no-store" },
  );
}

/** Los últimos eventos de todos los casos. Lo lee el registro de /crue. */
export function eventosRecientes(limite = 200): Promise<RespuestaEventos> {
  return pedir<RespuestaEventos>(`/eventos?limite=${limite}`, {
    cache: "no-store",
  });
}

export interface OverrideCuerpo {
  casoId: string;
  sedeCodigo: string;
  /** Obligatoria. El servidor responde 400 si viene vacía o muy corta. */
  justificacion: string;
  /** El nombre que el regulador declara. Se guarda como NO verificado. */
  firmaDeclarada?: string;
  /** El motivo de descarte que tenía la sede, si el override salta la regla. */
  saltaRegla?: string | null;
  /** Radio con el que apareció esa sede, si se amplió el perímetro. */
  radioKm?: number | null;
  /** Estable por confirmación: el doble toque no manda dos ambulancias. */
  claveIdempotencia?: string;
}

export interface OverrideResultado {
  evento: EventoCasoCliente;
  handshake: { id: string; sedeCodigo: string } | null;
  repetido: boolean;
}

/**
 * El override del CRUE.
 *
 * **Esto no es "despachar y además anotar".** El endpoint despacha Y escribe
 * el `evento_caso` en una sola operación del servidor: no hay forma de que la
 * ambulancia salga sin que la decisión quede registrada, que es exactamente
 * lo que pasaba cuando la justificación vivía en `localStorage`.
 */
export function override(cuerpo: OverrideCuerpo): Promise<OverrideResultado> {
  const { casoId, ...resto } = cuerpo;
  return pedir<OverrideResultado>(
    `/casos/${encodeURIComponent(casoId)}/override`,
    { method: "POST", body: JSON.stringify(resto) },
  );
}

/**
 * El expediente forense de un caso.
 *
 * Cada llamada **queda registrada en el propio expediente**: no se pone en un
 * `useEffect` que se repita con el polling.
 *
 * Un cuerpo que no se entiende se trata como "no hay expediente" y no como
 * "hay expediente a medias": pintar media auditoría es peor que no pintarla,
 * porque el hueco no se ve.
 */
export async function expediente(casoId: string): Promise<ExpedienteCaso> {
  const crudo = await pedir<unknown>(
    `/auditoria/casos/${encodeURIComponent(casoId)}`,
    { cache: "no-store" },
  );
  const leido = leerExpediente(crudo);
  if (!leido) {
    throw new ErrorApi(
      "Core respondió algo que este build no sabe leer. No se pinta media auditoría.",
      200,
    );
  }
  return leido;
}
