"use client";

/**
 * La bitácora del equipo: quién invitó a quién, quién entró y quién salió.
 *
 * ── POR QUÉ ESTÁ EN LA MISMA PANTALLA ──────────────────────────────
 * Porque es lo que hace que "desactivar" no se lea como "borrar". Al lado de
 * una lista donde alguien acaba de desaparecer, la bitácora es la prueba de
 * que sigue ahí: la regla 4 del repo dice que la auditoría es append-only y
 * que una corrección es un evento nuevo, y eso solo se cree cuando se ve.
 *
 * Los dos eventos raros —`intento_cruzado` y `rol_no_otorgable`— se pintan en
 * rojo a propósito. Son los 403 que el invariante 1 de multitenancy §5.3 pide
 * registrar: alguien intentó invitar a una organización ajena, o repartir un
 * rol que no tiene. Un 403 mudo pierde la señal más interesante del sistema;
 * enterrarlo en gris en una lista de eventos, también.
 */

import type { EventoEquipo } from "@/lib/api-equipo";
import { fecha, nombreRol, Pildora, relativo, Vacio, type Tono } from "./piezas";

const TEXTO: Record<EventoEquipo["tipo"], string> = {
  invitacion_creada: "Invitación enviada",
  invitacion_reemplazada: "Invitación reemplazada por una nueva",
  invitacion_revocada: "Invitación revocada",
  invitacion_aceptada: "Invitación aceptada",
  actor_desactivado: "Actor desactivado",
  actor_reactivado: "Actor reactivado",
  intento_cruzado: "Intento de acceso a otra organización",
  rol_no_otorgable: "Intento de otorgar un rol que no tiene",
};

const TONO: Record<EventoEquipo["tipo"], Tono> = {
  invitacion_creada: "info",
  invitacion_reemplazada: "neutro",
  invitacion_revocada: "neutro",
  invitacion_aceptada: "estable",
  actor_desactivado: "alerta",
  actor_reactivado: "estable",
  intento_cruzado: "critico",
  rol_no_otorgable: "critico",
};

export function Bitacora({ eventos }: { eventos: EventoEquipo[] }) {
  if (eventos.length === 0) {
    return <Vacio>Todavía no ha pasado nada que registrar.</Vacio>;
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {eventos.map((evento) => (
        <li
          key={evento.id}
          className="flex flex-col gap-1.5 rounded-xl border border-borde bg-superficie px-3.5 py-3 sm:flex-row sm:items-baseline sm:gap-3"
        >
          <span className="tabular shrink-0 text-xs text-texto-tenue">
            <time dateTime={evento.en} title={fecha(evento.en) ?? undefined}>
              {relativo(evento.en)}
            </time>
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <Pildora tono={TONO[evento.tipo]}>{TEXTO[evento.tipo]}</Pildora>{" "}
            <span className="break-words text-texto-tenue">
              {detalle(evento)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * El contexto del evento, en una frase.
 *
 * Se lee del `detalle` con cuidado: es un mapa abierto y core puede empezar a
 * mandar claves nuevas. Una clave que no se entiende se ignora en vez de
 * romper la lista — una bitácora que revienta por un campo nuevo es una
 * bitácora que nadie va a poder leer justo cuando haga falta.
 */
function detalle(evento: EventoEquipo): string {
  const partes: string[] = [];
  const { correo, rol, rolPedido, motivo, organizacionSolicitada } =
    evento.detalle;

  if (correo) partes.push(correo);
  if (rol) partes.push(`como ${nombreRol(rol)}`);
  if (rolPedido) partes.push(`rol pedido: ${nombreRol(rolPedido)}`);
  if (organizacionSolicitada) partes.push(`hacia ${organizacionSolicitada}`);
  if (motivo) partes.push(`— ${motivo}`);

  return partes.join(" ");
}
