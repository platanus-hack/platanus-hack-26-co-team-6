/**
 * Bitácora del regulador — **ya no es local**.
 *
 * ── QUÉ CAMBIÓ Y POR QUÉ IMPORTA ──────────────────────────────────
 * Hasta la tarea 3.11 este módulo escribía en `localStorage` y la UI rotulaba
 * cada línea "registro local". Eso significaba que **una decisión que la ley
 * le atribuye al regulador (Res. 1220/2010) vivía en la caché de un Chrome**:
 * se borraba al limpiar el navegador, no la veía ningún otro regulador, no
 * sobrevivía a cambiar de máquina y ningún servidor había comprobado que la
 * justificación existiera. Era de lo más difícil de defender del sistema.
 *
 * Ahora el override pasa por `POST /casos/:id/override`: el servidor exige la
 * justificación, comprueba que quien firma sea `regulador_crue`, despacha y
 * escribe el `evento_caso` en la misma operación. La lectura viene de core.
 * El rótulo "registro local" desaparece porque dejó de ser verdad.
 *
 * ── LO QUE SÍ SE PERDIÓ, DICHO EN VOZ ALTA ────────────────────────
 * Las notas de "ampliar perímetro" y "solicitar al siguiente candidato" ya no
 * se anotan. No es un olvido: el registro **solo lo escribe el servidor**, y
 * ninguna de las dos es una acción con consecuencia que core pueda atestiguar
 * hoy —el despacho al siguiente candidato ya aparece como su propio handshake,
 * y ampliar el perímetro es una exploración, no una decisión—. Dejar que el
 * navegador inserte entradas de auditoría a voluntad habría sido peor que
 * perderlas: una línea de tiempo que el cliente puede inventar no prueba nada.
 * El radio con el que apareció una sede viaja dentro del override que sí se
 * escribe (`detalle.radioKmBusqueda`), que es donde de verdad hace falta.
 */

import {
  eventosDeCaso,
  eventosRecientes,
  override as pedirOverride,
  type EventoCasoCliente,
} from "@/lib/api-auditoria";
import { etiquetaActor, etiquetaTipo } from "@/lib/auditoria-modelo";

export interface EventoBitacora {
  id: number;
  /** ISO 8601. Lo sella el servidor, no el reloj del navegador. */
  ts: string;
  casoId: string;
  tipo: string;
  /** Frase lista para pintar. */
  texto: string;
  /** Quién, ya rotulado: persona, servicio automático o sistema. */
  actor: string;
  esServicio: boolean;
  /** Merece color/peso: overrides, rechazos, timeouts. */
  critico: boolean;
  codigoSede: string | null;
}

export interface Bitacora {
  eventos: EventoBitacora[];
  /** 'memoria' → se pierde si core reinicia. La UI lo dice. */
  modo: "memoria" | "postgres";
}

const CRITICOS = new Set([
  "override_crue",
  "rechazado",
  "timeout",
  "escalado",
  "rerouteado",
]);

/** La línea de tiempo de un caso, tal como la guarda el servidor. */
export async function bitacoraDeCaso(casoId: string): Promise<Bitacora> {
  const { eventos, modo } = await eventosDeCaso(casoId);
  return { eventos: eventos.map(traducir), modo };
}

/** Los últimos eventos de todos los casos. Lo pinta el registro de /crue. */
export async function bitacoraReciente(limite = 200): Promise<Bitacora> {
  const { eventos, modo } = await eventosRecientes(limite);
  return { eventos: eventos.map(traducir), modo };
}

export interface PeticionOverride {
  casoId: string;
  sedeCodigo: string;
  sedeNombre: string;
  justificacion: string;
  /** El nombre declarado en la barra de /crue. No está verificado, y se dice. */
  regulador: string;
  saltaRegla?: string | null;
  radioKm?: number | null;
  /** Estable por confirmación. Un doble toque no manda dos ambulancias. */
  claveIdempotencia: string;
}

/**
 * Forzar un destino.
 *
 * Devuelve el evento tal como quedó escrito en el servidor — no una copia
 * optimista construida aquí. Si core rechaza (403 sin rol, 400 sin
 * justificación), esto lanza y la consola lo cuenta: no hay estado local que
 * quede diciendo que se hizo algo que no se hizo.
 */
export async function registrarOverride(
  peticion: PeticionOverride,
): Promise<{ evento: EventoBitacora; repetido: boolean }> {
  const { evento, repetido } = await pedirOverride({
    casoId: peticion.casoId,
    sedeCodigo: peticion.sedeCodigo,
    justificacion: peticion.justificacion,
    firmaDeclarada: peticion.regulador,
    saltaRegla: peticion.saltaRegla ?? null,
    radioKm: peticion.radioKm ?? null,
    claveIdempotencia: peticion.claveIdempotencia,
  });
  return { evento: traducir(evento), repetido };
}

/** Un `evento_caso` convertido en una línea legible. */
function traducir(evento: EventoCasoCliente): EventoBitacora {
  return {
    id: evento.id,
    ts: evento.ocurridoEn,
    casoId: evento.casoId,
    tipo: evento.tipo,
    texto: describir(evento),
    actor: etiquetaActor(evento.actor),
    esServicio: evento.actor.tipo !== "humano",
    critico: CRITICOS.has(evento.tipo),
    codigoSede: evento.codigoSede,
  };
}

function describir(evento: EventoCasoCliente): string {
  const d = evento.detalle ?? {};

  if (evento.tipo === "override_crue") {
    const partes = [
      `Forzó asignación a ${evento.codigoSede ?? "una sede"}`,
      typeof d.justificacion === "string" ? `Justificación: "${d.justificacion}"` : null,
      typeof d.saltaReglaDura === "string"
        ? `SALTÓ REGLA DURA: ${d.saltaReglaDura}`
        : null,
      typeof d.radioKmBusqueda === "number"
        ? `perímetro ampliado a ${d.radioKmBusqueda} km`
        : null,
    ].filter(Boolean);
    return partes.join(" · ");
  }

  if (evento.tipo === "lectura_auditoria") {
    return `Consultó el expediente forense (${d.rolEfectivo ?? "sin rol"})`;
  }

  // Genérico y honesto: el tipo traducido más lo que el detalle diga, sin
  // inventar una narración que el evento no trae.
  const extra = typeof d.motivo === "string" ? ` · ${d.motivo}` : "";
  return `${etiquetaTipo(evento.tipo)}${extra}`;
}
