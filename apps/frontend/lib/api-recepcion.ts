/**
 * Cliente de la recepción hospitalaria (prearribo).
 *
 * Vive fuera de `lib/api.ts` a propósito: ese archivo ya es el más compartido
 * del frontend y crecer por acumulación lo convierte en el punto donde chocan
 * todos los merges. Lo que NO se duplica aquí —`credentials: "include"`, la
 * renovación silenciosa del access y la lectura de los dos formatos de error de
 * core— es exactamente lo que aporta `pedir`, y por eso todo pasa por ahí.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  EL CONTRATO QUE ESTA VISTA NECESITA — para 4.1 (Sebas) y 4.2 (Neid)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Hoy core NO tiene ninguna de las dos rutas. La vista funciona igual: cae a
 *  `GET /estado?casoId=…` y lo dice en pantalla. Cuando existan, se apaga solo
 *  el camino degradado. Esta es la forma exacta que espera el cliente.
 *
 *  ── 1. GET /hospital/recepcion/:casoId ────────────────────────────
 *
 *  200 → PaqueteRecepcionDTO (todos los campos opcionales salvo `casoId`;
 *        un campo que falta se pinta como hueco declarado, no se rellena):
 *
 *    {
 *      casoId: string,
 *      sedeCodigo?: string,            // sede DESTINATARIA (la que aceptó)
 *      sedeNombre?: string,
 *
 *      protocolo?: string,             // 'codigo_infarto' | 'codigo_acv' | 'trauma_mayor'
 *      protocoloVersion?: string,      // versión del catálogo — va en la evidencia
 *
 *      sbar?: { situacion, antecedente, evaluacion, recomendacion },  // 4.2
 *      sbarMotor?: 'llm' | 'campos-del-caso',   // fallback sin ANTHROPIC_API_KEY
 *
 *      checklist?: [{
 *        id: string,                   // estable: es lo que manda el POST
 *        etiqueta: string,
 *        responsable?: string,
 *        confirmado?: boolean,
 *        confirmadoPor?: string,       // NOMBRE del actor, no su uuid
 *        confirmadoEn?: string         // ISO 8601
 *      }],
 *
 *      etaMin?: number,
 *      etaProcedencia?: 'vivo' | 'despacho' | 'sin-dato',   // ⚠ ver abajo
 *      etaMedidoEn?: string,           // ISO — cuándo se midió ese ETA
 *      llegadaEstimada?: string,       // ISO — si no viene, se proyecta con los dos de arriba
 *
 *      ventanaClinicaMin?: number,     // 90 door-to-balloon, 60 door-to-needle (4.4)
 *      ventanaNombre?: string,         // "Door-to-balloon"
 *      ventanaInicioEn?: string,       // ISO del PRIMER CONTACTO MÉDICO, no de la llegada
 *
 *      paciente?: { edad?, sexo?, triage?, dxCie10?, dxDescripcion?,
 *                   serviciosRequeridos?: number[], signosAlarma?: string[],
 *                   complejidadRequerida?, requiereMedicoABordo? },
 *      movil?: { id: string, tipo: 'TAB' | 'TAM' },
 *      aceptadoEn?: string,
 *      actualizadoEn?: string
 *    }
 *
 *  ⚠ `etaProcedencia` NO es decorativa. Sin ella el cliente asume `'despacho'`,
 *    que es la afirmación más débil: la pantalla dirá "no en vivo" aunque el
 *    ETA sí siga al móvil. Mándala.
 *
 *  ⚠ `ventanaClinicaMin` sin `ventanaInicioEn` no dibuja reloj: habría que
 *    inventar desde cuándo cuenta. Van juntos o no van.
 *
 *  ⚠ **Nada de `textoCrudo` ni de `origen` en este DTO.** Es una pantalla que
 *    cuelga de la pared de urgencias, a la vista de quien pase por el pasillo.
 *
 *  403 → la sede de la sesión no es la destinataria. **El 403 lo tiene que dar
 *        core** (tarea 4.1): la comprobación de sede que hace esta vista es de
 *        cortesía y no autoriza nada.
 *  404 → el caso no existe, o la ruta todavía no está desplegada.
 *
 *  ── 2. POST /hospital/recepcion/:casoId/checklist ─────────────────
 *
 *  → { itemId: string }
 *  200 → {
 *          item: { …el ítem ya confirmado, con confirmadoPor y confirmadoEn },
 *          evento?: { tipo: 'preparacion_confirmada', actor?: string, ocurridoEn?: string }
 *        }
 *
 *  Escribe `evento_caso` tipo `preparacion_confirmada` **con `actor_id`**. Una
 *  confirmación sin actor no sirve: la regla 6 del repo dice que nada con
 *  consecuencia clínica ocurre sin confirmación humana registrada, y "el
 *  sistema confirmó la sala de hemodinamia" no es una confirmación humana.
 *
 *  Idempotente: confirmar dos veces devuelve 200 con el ítem tal como quedó la
 *  primera vez (el actor y la hora **no** se pisan). Un doble toque en una
 *  pantalla táctil de urgencias pasa siempre.
 *
 *  La corrección ("esto no estaba listo") **no es un DELETE**: la auditoría es
 *  append-only. Si hace falta, será otro evento, no un borrado.
 */

import { ErrorApi, estado as estadoDeCore, pedir } from "./api";
import {
  normalizarPaquete,
  paqueteDesdeEstado,
  type ItemChecklist,
  type PaqueteRecepcion,
} from "./recepcion-modelo";
import type { CodServicio } from "./types";

/**
 * Las dos rutas candidatas.
 *
 * La brief de esta tarea pide `/hospital/recepcion/:casoId`; el Anexo A del
 * plan la lista como `/casos/:id/recepcion`. Todavía no existe ninguna, así
 * que en vez de apostar se prueban las dos: la vista funciona con la que
 * Sebas termine implementando y nadie pierde una tarde por un prefijo.
 * Cuando 4.1 aterrice, se borra la que no sea.
 */
export const RUTAS_RECEPCION = (casoId: string): string[] => {
  const id = encodeURIComponent(casoId);
  return [`/hospital/recepcion/${id}`, `/casos/${id}/recepcion`];
};

export const RUTAS_CHECKLIST = (casoId: string): string[] => {
  const id = encodeURIComponent(casoId);
  return [`/hospital/recepcion/${id}/checklist`, `/casos/${id}/recepcion/checklist`];
};

export type ResultadoRecepcion =
  | { estado: "ok"; paquete: PaqueteRecepcion }
  /** 200 con un cuerpo que no se entiende. No se pinta medio paquete. */
  | { estado: "ilegible" }
  /** 404/501 en las dos rutas: la tarea 4.1 todavía no está desplegada. */
  | { estado: "sin-endpoint" }
  /** 403: la sesión no es de la sede destinataria. Lo decide core. */
  | { estado: "prohibido"; mensaje: string }
  | { estado: "error"; mensaje: string };

/** 501 lo devolvería una ruta declarada pero sin implementar. */
function esRutaAusente(err: unknown): boolean {
  return err instanceof ErrorApi && (err.status === 404 || err.status === 501);
}

/**
 * Pide el paquete de prearribo.
 *
 * `sinEndpoint` propaga hacia arriba en vez de convertirse en un error rojo:
 * que 4.1 no exista no es una falla que reportar cada 3 segundos, es el estado
 * conocido del sistema y la vista sabe caer a `GET /estado`.
 */
export async function obtenerRecepcion(
  casoId: string,
): Promise<ResultadoRecepcion> {
  let ausentes = 0;

  for (const ruta of RUTAS_RECEPCION(casoId)) {
    try {
      const crudo = await pedir<unknown>(ruta, { cache: "no-store" });
      const paquete = normalizarPaquete(crudo);
      return paquete ? { estado: "ok", paquete } : { estado: "ilegible" };
    } catch (err) {
      if (esRutaAusente(err)) {
        ausentes += 1;
        continue;
      }
      if (err instanceof ErrorApi && err.status === 403) {
        return { estado: "prohibido", mensaje: err.message };
      }
      // El 401 no se traduce: `pedir` ya avisó a <Sesion>, que manda al login.
      return {
        estado: "error",
        mensaje: err instanceof Error ? err.message : "core no respondió",
      };
    }
  }

  return ausentes > 0
    ? { estado: "sin-endpoint" }
    : { estado: "error", mensaje: "core no respondió" };
}

/**
 * El camino degradado: reconstruir el prearribo con lo que sí existe hoy.
 *
 * `GET /estado?casoId=…` devuelve `CasoPublico` + `Handshake`. Con eso alcanza
 * para el SBAR (compuesto de los campos estructurados) y para el ETA del
 * despacho. No alcanza para el protocolo, la ventana clínica ni el checklist,
 * y la vista lo declara en vez de dibujarlos vacíos.
 */
export async function recepcionDesdeEstado(
  casoId: string,
  nombrarServicios?: (cods: CodServicio[]) => string,
): Promise<
  | { estado: "ok"; paquete: PaqueteRecepcion }
  | { estado: "sin-caso" }
  | { estado: "error"; mensaje: string }
> {
  try {
    const d = await estadoDeCore(casoId);
    const paquete = paqueteDesdeEstado(casoId, d, nombrarServicios);
    return paquete ? { estado: "ok", paquete } : { estado: "sin-caso" };
  } catch (err) {
    return {
      estado: "error",
      mensaje: err instanceof Error ? err.message : "core no respondió",
    };
  }
}

export type ResultadoConfirmacion =
  | { estado: "ok"; item: ItemChecklist }
  | { estado: "sin-endpoint" }
  | { estado: "prohibido"; mensaje: string }
  | { estado: "error"; mensaje: string };

/**
 * Confirma un ítem de la preparación.
 *
 * Lo que se manda es el `itemId`, nunca el estado completo del checklist: dos
 * enfermeras confirmando cosas distintas a la vez no pueden pisarse. El actor
 * lo pone el servidor con la sesión — el cliente no lo elige, porque entonces
 * cualquiera podría firmar por otro.
 */
export async function confirmarItem(
  casoId: string,
  itemId: string,
): Promise<ResultadoConfirmacion> {
  let ausentes = 0;

  for (const ruta of RUTAS_CHECKLIST(casoId)) {
    try {
      const respuesta = await pedir<{ item?: unknown }>(ruta, {
        method: "POST",
        body: JSON.stringify({ itemId }),
      });

      const item = leerItem(respuesta?.item);
      return item
        ? { estado: "ok", item }
        : {
            estado: "error",
            mensaje: "core confirmó pero no devolvió quién ni cuándo",
          };
    } catch (err) {
      if (esRutaAusente(err)) {
        ausentes += 1;
        continue;
      }
      if (err instanceof ErrorApi && err.status === 403) {
        return { estado: "prohibido", mensaje: err.message };
      }
      return {
        estado: "error",
        mensaje: err instanceof Error ? err.message : "core no respondió",
      };
    }
  }

  return ausentes > 0
    ? { estado: "sin-endpoint" }
    : { estado: "error", mensaje: "core no respondió" };
}

/**
 * Lee el ítem que devolvió core.
 *
 * Sin `confirmadoPor` no hay confirmación que mostrar: un ✓ sin nombre al lado
 * es justo lo que esta pantalla no puede permitirse. Se acepta igual —el
 * servidor ya lo escribió— y la UI dirá "confirmado" sin autor, que es la
 * verdad.
 */
function leerItem(crudo: unknown): ItemChecklist | null {
  if (!crudo || typeof crudo !== "object") return null;
  const o = crudo as Record<string, unknown>;
  if (typeof o.id !== "string") return null;

  return {
    id: o.id,
    etiqueta: typeof o.etiqueta === "string" ? o.etiqueta : o.id,
    responsable: typeof o.responsable === "string" ? o.responsable : null,
    confirmado: o.confirmado !== false,
    confirmadoPor: typeof o.confirmadoPor === "string" ? o.confirmadoPor : null,
    confirmadoEn: typeof o.confirmadoEn === "string" ? o.confirmadoEn : null,
  };
}
