"use client";

/**
 * El equipo: quién está, quién fue invitado y quién salió.
 *
 * ── POR QUÉ NO ES UN `<table>` ─────────────────────────────────────
 * Una tabla de seis columnas no cabe en 320 px, y la salida habitual —meterla
 * en un `overflow-x-auto`— convierte la lista de personas de un hospital en
 * algo que hay que arrastrar de lado para leer. La regla del repo es que no
 * haya scroll horizontal, no que se esconda dentro de un contenedor.
 *
 * Así que cada persona es una tarjeta que apila en móvil y se despliega en
 * columnas desde `sm`. La misma información, sin arrastre lateral, y con los
 * botones a 44 px en vez de a tamaño de celda.
 *
 * ── EL INACTIVO SE QUEDA A LA VISTA ────────────────────────────────
 * Un actor desactivado NO desaparece de la lista: sale atenuado y con su
 * píldora. Es el caso límite 4 de multitenancy §7 hecho pantalla — "el actor
 * nunca se borra, se muestra 'Nombre (inactivo)'" — y es lo que permite que un
 * evento de hace tres meses siga resolviendo a una persona con nombre en vez
 * de a un id huérfano.
 */

import { useState } from "react";
import type { ActorEquipo, InvitacionEquipo } from "@/lib/api-equipo";
import {
  Boton,
  fecha,
  nombreRol,
  Pildora,
  relativo,
  Vacio,
  type Tono,
} from "./piezas";

// ── Actores ──────────────────────────────────────────────────────

export function ListaActores({
  actores,
  puedeAdministrar,
  ultimoAccesoDisponible,
  cambiarActivo,
}: {
  actores: ActorEquipo[];
  puedeAdministrar: boolean;
  ultimoAccesoDisponible: boolean;
  cambiarActivo: (actor: ActorEquipo, activo: boolean) => Promise<void>;
}) {
  if (actores.length === 0) {
    return (
      <Vacio>
        Todavía no hay nadie más en tu organización. Invita al primero con el
        formulario de arriba: le llega un enlace de un solo uso.
      </Vacio>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {actores.map((actor) => (
        <FilaActor
          key={actor.id}
          actor={actor}
          puedeAdministrar={puedeAdministrar}
          ultimoAccesoDisponible={ultimoAccesoDisponible}
          cambiarActivo={cambiarActivo}
        />
      ))}
    </ul>
  );
}

function FilaActor({
  actor,
  puedeAdministrar,
  ultimoAccesoDisponible,
  cambiarActivo,
}: {
  actor: ActorEquipo;
  puedeAdministrar: boolean;
  ultimoAccesoDisponible: boolean;
  cambiarActivo: (actor: ActorEquipo, activo: boolean) => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);

  async function alternar() {
    setOcupado(true);
    try {
      await cambiarActivo(actor, !actor.activo);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <li
      className={`rounded-2xl border border-borde bg-superficie p-4 ${
        actor.activo ? "" : "opacity-60"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span className="truncate">{actor.nombre ?? actor.correo}</span>
            {!actor.activo && <Pildora tono="neutro">Inactivo</Pildora>}
          </p>
          {actor.nombre && (
            <p className="truncate text-sm text-texto-tenue">{actor.correo}</p>
          )}

          <p className="mt-2 flex flex-wrap gap-1.5">
            {actor.roles.map((rol) => (
              <Pildora key={rol} tono="info">
                {nombreRol(rol)}
              </Pildora>
            ))}
            {actor.codigoSede && (
              <Pildora tono="neutro">Sede {actor.codigoSede}</Pildora>
            )}
          </p>

          <p className="mt-2 text-xs leading-relaxed text-texto-tenue">
            <span className="block">
              Último acceso:{" "}
              {ultimoAccesoDisponible ? (
                (fecha(actor.ultimoAccesoEn) ?? "nunca ha entrado")
              ) : (
                // No se pinta un guion mudo: un dato que nadie escribe todavía
                // se parece demasiado a un dato que dice "nunca entró".
                <span className="text-alerta">
                  no se registra todavía (llega con la tarea 1.3)
                </span>
              )}
            </span>
            {!actor.activo && actor.desactivadoEn && (
              <span className="block">
                Desactivado {relativo(actor.desactivadoEn)} · sigue en la
                auditoría
              </span>
            )}
          </p>
        </div>

        {puedeAdministrar && (
          <div className="shrink-0">
            <Boton
              type="button"
              variante={actor.activo ? "peligro" : "secundario"}
              cargando={ocupado}
              onClick={alternar}
            >
              {actor.activo ? "Desactivar" : "Reactivar"}
            </Boton>
          </div>
        )}
      </div>
    </li>
  );
}

// ── Invitaciones ─────────────────────────────────────────────────

const TONO_ESTADO: Record<InvitacionEquipo["estado"], Tono> = {
  pendiente: "alerta",
  aceptada: "estable",
  revocada: "neutro",
  vencida: "neutro",
};

const TEXTO_ESTADO: Record<InvitacionEquipo["estado"], string> = {
  pendiente: "Pendiente",
  aceptada: "Aceptada",
  revocada: "Revocada",
  vencida: "Vencida",
};

export function ListaInvitaciones({
  invitaciones,
  puedeAdministrar,
  revocar,
}: {
  invitaciones: InvitacionEquipo[];
  puedeAdministrar: boolean;
  revocar: (invitacion: InvitacionEquipo) => Promise<void>;
}) {
  if (invitaciones.length === 0) {
    return <Vacio>No hay invitaciones. Ni pendientes ni gastadas.</Vacio>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {invitaciones.map((invitacion) => (
        <FilaInvitacion
          key={invitacion.id}
          invitacion={invitacion}
          puedeAdministrar={puedeAdministrar}
          revocar={revocar}
        />
      ))}
    </ul>
  );
}

function FilaInvitacion({
  invitacion,
  puedeAdministrar,
  revocar,
}: {
  invitacion: InvitacionEquipo;
  puedeAdministrar: boolean;
  revocar: (invitacion: InvitacionEquipo) => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);
  const pendiente = invitacion.estado === "pendiente";

  async function alRevocar() {
    setOcupado(true);
    try {
      await revocar(invitacion);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <li
      className={`rounded-2xl border border-borde bg-superficie p-4 ${
        pendiente ? "" : "opacity-60"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{invitacion.correo}</span>
            <Pildora tono={TONO_ESTADO[invitacion.estado]}>
              {TEXTO_ESTADO[invitacion.estado]}
            </Pildora>
          </p>
          <p className="mt-2 flex flex-wrap gap-1.5">
            <Pildora tono="info">{nombreRol(invitacion.rol)}</Pildora>
            {invitacion.codigoSede && (
              <Pildora tono="neutro">Sede {invitacion.codigoSede}</Pildora>
            )}
          </p>
          <p className="mt-2 text-xs text-texto-tenue">
            {pendiente
              ? `Vence ${relativo(invitacion.expiraEn)} · ${fecha(invitacion.expiraEn)}`
              : `Invitada ${relativo(invitacion.creadaEn)}`}
          </p>
        </div>

        {/* Revocar solo tiene sentido sobre una pendiente: lo demás ya pasó, y
            lo que pasó no se deshace, se registra. */}
        {puedeAdministrar && pendiente && (
          <div className="shrink-0">
            <Boton
              type="button"
              variante="peligro"
              cargando={ocupado}
              onClick={alRevocar}
            >
              Revocar
            </Boton>
          </div>
        )}
      </div>
    </li>
  );
}
