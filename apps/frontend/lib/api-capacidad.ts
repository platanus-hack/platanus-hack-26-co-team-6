/**
 * Cliente de capacidad declarada — la superficie que `/hospital/capacidad`
 * necesita de core.
 *
 * Vive aparte de `lib/api.ts` a propósito: ese archivo es el más compartido del
 * frontend y crecer por acumulación lo volvía el cuello de botella de cada
 * merge. De ahí solo se importan las tres cosas que NO se pueden duplicar sin
 * romper algo — `credentials: "include"`, la renovación silenciosa de un solo
 * intento y la lectura de los dos formatos de error de core. Un `fetch` suelto
 * aquí se saltaría las tres.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  CONTRATO PROPUESTO PARA LA TAREA 3.3 (Zaid) — hoy NO existe en core
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Respaldo: `sede_estado` + `capacidad_declarada` + vista `capacidad_vigente`
 *  de Parte II §1 bloque C. Esta es la forma en que la vista los consume.
 *
 *  ── El tipo que viaja en las tres respuestas ──────────────────────
 *
 *    Declaracion {
 *      sedeCodigo:   string                      // codigo_habilitacion_sede
 *      operativo:    'recibiendo'|'saturado'|'contingencia'|'cerrado'
 *      motivo:       string | null               // null SOLO si operativo='recibiendo'
 *      camas: [{ tipo: string,                   // nombre REPS: "CAMAS-UCI Adultos"
 *                disponibles: number,            // >= 0
 *                total: number | null }]         // camas habilitadas, si se sabe
 *      venceEn:      string | null               // ISO 8601. null SOLO en snapshot
 *      declaradoEn:  string                      // ISO 8601
 *      declaradoPor: { id, nombre? } | null      // null en snapshot
 *      procedencia:  'declarada' | 'snapshot-reps'
 *    }
 *
 *  `procedencia` es el campo del que depende toda la pantalla y **lo decide el
 *  servidor**, que es el único que sabe si hubo declaración. Un cuerpo sin él
 *  se descarta entero (`normalizarDeclaracion`): pintar camas sin saber de
 *  cuándo son es justo el bug que esta vista existe para cerrar.
 *
 *  ── GET /capacidad/:sedeCodigo ────────────────────────────────────
 *
 *    200 ← Declaracion
 *
 *    Devuelve SIEMPRE algo utilizable, y por eso el fallback al snapshot vive
 *    en el servidor y no aquí: core tiene el catálogo REPS (`CamaSede.total`,
 *    `CamaSede.ocupadasSnapshot`) y el front no. Si no hay fila vigente en
 *    `capacidad_vigente`, core responde con las camas del snapshot,
 *    `procedencia: 'snapshot-reps'`, `venceEn: null` y `declaradoPor: null`.
 *    Una declaración vencida cuenta como inexistente (el job del paso 6 de 3.3
 *    la expira; mientras tanto, la vista ya la pinta como caducada).
 *
 *    404 → la sede no existe. 403 → fuera del alcance del actor.
 *
 *  ── PUT /capacidad/:sedeCodigo/estado ─────────────────────────────
 *
 *    → { estado: 'recibiendo'|'saturado'|'contingencia'|'cerrado',
 *        motivo?: string }
 *    200 ← Declaracion   // la declaración YA aplicada, con su venceEn sellado
 *
 *    * `motivo` **obligatorio en servidor** si `estado != 'recibiendo'` (400 si
 *      falta). La vista ya lo exige, pero la vista no es la seguridad.
 *    * `vence_en` lo sella el SERVIDOR (`now() + 4 h` por defecto). El front no
 *      lo manda ni lo adivina — misma regla que `expiraEn` del handshake: un
 *      plazo inventado en el cliente es una cuenta atrás que miente.
 *    * Idempotente: declarar dos veces el mismo estado no duplica nada
 *      observable, pero **sí escribe su fila** — `capacidad_declarada` y
 *      `sede_estado` son append-only y una corrección es un registro nuevo,
 *      nunca un UPDATE.
 *    * Escribe `evento_caso`/`evento_sede` tipo `capacidad_declarada` con el
 *      `actor_id`. La auditoría es la mitad del valor de este endpoint.
 *
 *  ── PUT /capacidad/:sedeCodigo/camas ──────────────────────────────
 *
 *    → { tipo: string, disponibles: number }
 *    200 ← Declaracion   // la declaración completa, no solo la fila tocada
 *
 *    Una fila por llamada, porque en la pantalla **cada control guarda solo**:
 *    no hay botón de "Guardar". Devolver la declaración entera —y no un 204—
 *    es lo que permite que la fila confirme con el número del servidor en vez
 *    de quedarse con el suyo.
 *
 *    400 si `disponibles < 0` o si `tipo` no está habilitado en esa sede.
 *
 *  ── Mientras 3.3 no exista ────────────────────────────────────────
 *
 *  Core responde 404 a las tres rutas. `leerCapacidad` lo devuelve como
 *  `sin-endpoint`, que **no** es lo mismo que `sin-core`, y la vista lo dice
 *  con todas las letras en vez de fingir que guardó. Es la regla 2 del repo:
 *  todo degrada, y lo dice.
 */

import { ErrorApi, pedir } from "./api";
import {
  normalizarDeclaracion,
  type Declaracion,
  type EstadoOperativo,
  type MotivoAusencia,
} from "./capacidad-modelo";

/**
 * Lo que la vista recibe al leer.
 *
 * No es `Declaracion | null`: cuando no hay declaración hace falta saber POR
 * QUÉ para poder decirlo en pantalla. Un `null` mudo se acaba pintando como
 * "no hay camas", que es una afirmación que nadie verificó.
 */
export type Lectura =
  | { hay: true; declaracion: Declaracion }
  | { hay: false; ausencia: MotivoAusencia };

/**
 * Un 404 en estas rutas casi siempre significa "3.3 no está desplegada".
 *
 * También lo devolvería core si la sede no existiera, y los dos casos se
 * pintan igual de arriba: no hay dato y no se inventa. Cuando 3.3 aterrice,
 * el 404 pasa a significar solo lo segundo y el mensaje seguirá siendo cierto.
 */
function ausenciaDe(err: unknown): MotivoAusencia {
  if (err instanceof ErrorApi && (err.status === 404 || err.status === 501)) {
    return "sin-endpoint";
  }
  return "sin-core";
}

/** El código de sede va en la URL: es un dato público del REPS, no PII. */
function ruta(sedeCodigo: string, sufijo = ""): string {
  return `/capacidad/${encodeURIComponent(sedeCodigo)}${sufijo}`;
}

/**
 * Un cuerpo 200 que no se entiende se trata como ausencia, no como dato.
 *
 * Es el mismo criterio de `normalizarSesion`: ante la duda, el degradado cae
 * del lado de "no sé", nunca del de "asumo que sí".
 */
function leer(crudo: unknown): Lectura {
  const declaracion = normalizarDeclaracion(crudo);
  return declaracion ? { hay: true, declaracion } : { hay: false, ausencia: "sin-core" };
}

export async function leerCapacidad(sedeCodigo: string): Promise<Lectura> {
  try {
    return leer(await pedir<unknown>(ruta(sedeCodigo), { cache: "no-store" }));
  } catch (err) {
    return { hay: false, ausencia: ausenciaDe(err) };
  }
}

/**
 * Declara el estado operativo.
 *
 * Lanza `ErrorApi` a propósito: aquí un fallo NO se traga. Quien llama tiene
 * que revertir lo que pintó y decir que no se guardó — tragarse el error
 * dejaría a alguien creyendo que su sede salió del ranking cuando PULSO le
 * sigue mandando pacientes. Es el peor final posible de esta pantalla.
 */
export async function declararEstado(
  sedeCodigo: string,
  cuerpo: { estado: EstadoOperativo; motivo?: string | null },
): Promise<Declaracion> {
  const crudo = await pedir<unknown>(ruta(sedeCodigo, "/estado"), {
    method: "PUT",
    body: JSON.stringify({
      estado: cuerpo.estado,
      // `null` no viaja: un motivo ausente es un campo ausente.
      ...(cuerpo.motivo ? { motivo: cuerpo.motivo } : {}),
    }),
  });

  return exigirDeclaracion(crudo);
}

/** Declara las camas disponibles de UN tipo. Una fila, una llamada. */
export async function declararCamas(
  sedeCodigo: string,
  cuerpo: { tipo: string; disponibles: number },
): Promise<Declaracion> {
  const crudo = await pedir<unknown>(ruta(sedeCodigo, "/camas"), {
    method: "PUT",
    body: JSON.stringify(cuerpo),
  });

  return exigirDeclaracion(crudo);
}

/**
 * Un 200 con un cuerpo ilegible es un fallo, no un éxito silencioso.
 *
 * Si core responde OK pero no manda la declaración resultante, la pantalla no
 * puede confirmar nada: se comporta igual que ante un 500 y revierte. Mejor un
 * aviso de más que un número que nadie sabe si llegó.
 */
function exigirDeclaracion(crudo: unknown): Declaracion {
  const declaracion = normalizarDeclaracion(crudo);
  if (!declaracion) {
    throw new ErrorApi("core aceptó la declaración pero no la devolvió", 502);
  }
  return declaracion;
}

/**
 * Mensaje corto para el aviso de reversión.
 *
 * Distingue el caso que hoy es el normal —el endpoint no existe— de un fallo
 * de verdad. Los dos revierten igual; lo que cambia es qué tiene que hacer
 * quien lo lee.
 */
export function mensajeDeFallo(err: unknown): string {
  if (err instanceof ErrorApi) {
    if (err.status === 404 || err.status === 501) {
      return "Core no tiene todavía el endpoint de capacidad (tarea 3.3). No se guardó nada.";
    }
    if (err.status === 403) {
      return "Core no te deja declarar por esta sede. No se guardó nada.";
    }
    return `${err.message}. No se guardó nada.`;
  }
  return "No se pudo hablar con core. No se guardó nada.";
}
