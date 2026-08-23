"use client";

/**
 * Equipo de la organización (tarea 2.5).
 *
 * ── DÓNDE VIVE ESTA RUTA ───────────────────────────────────────────
 * `app/(panel)/equipo/` — el paréntesis es un route group: agrupa sin aparecer
 * en la URL, así que hoy esto se sirve en **`/equipo`**, no en `/panel/equipo`.
 * El shell de `/panel` es la tarea 2.7 y es su dueña quien decide la forma
 * final del árbol; el día que quiera el prefijo en la URL, esta carpeta se
 * mueve a `app/(panel)/panel/equipo/` y no cambia una línea de código.
 *
 * Por eso tampoco hay `layout.tsx` aquí: lo trae 2.7 con la navegación por rol
 * y el selector de organización. Next no exige layout en un grupo de rutas —
 * esta página funciona colgada del layout raíz mientras tanto.
 *
 * ── POR QUÉ NO USA `useSesion()` ───────────────────────────────────
 * El proveedor de sesión lo monta el layout de cada árbol, y el de `/panel`
 * todavía no existe. Depender de él aquí sería depender de un contexto vacío.
 * Se le pregunta a core directamente con `mi`, que el servidor resuelve a la
 * organización de quien llama — que además es la forma más segura de pedirlo:
 * el inquilino no lo elige el cliente. Cuando 2.7 monte `<Sesion>`, esta
 * página sigue igual; el guard solo corta antes.
 *
 * ── LO QUE ESTA PANTALLA NO DECIDE ─────────────────────────────────
 * Nada. Qué roles se pueden repartir, quién puede invitar y a qué organización
 * lo decide core y lo devuelve en la respuesta. Aquí solo se pinta. Si alguien
 * borra este archivo, la autorización sigue exactamente igual de cerrada.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as equipoApi from "@/lib/api-equipo";
import type { ActorEquipo, Equipo, InvitacionEquipo } from "@/lib/api-equipo";
import { ErrorApi } from "@/lib/api";
import { Bitacora } from "@/components/panel/Bitacora";
import { FormularioInvitacion } from "@/components/panel/FormularioInvitacion";
import {
  ListaActores,
  ListaInvitaciones,
} from "@/components/panel/ListaEquipo";
import {
  Alerta,
  Boton,
  Degradado,
  Pagina,
  Seccion,
  Vacio,
} from "@/components/panel/piezas";

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; equipo: Equipo }
  | { fase: "sin-sesion" }
  /** 403: la sesión existe pero no acredita lo necesario. `motivo` es de core. */
  | { fase: "sin-permiso"; motivo: string }
  | { fase: "sin-core" };

export default function PaginaEquipo() {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [error, setError] = useState<string | null>(null);

  /**
   * Bandera de vida, como en `lib/sesion.ts` y `useCapacidades`: la carga es
   * una suscripción a un sistema externo (core) y no se escribe estado de un
   * componente que ya se desmontó a mitad de petición.
   */
  const vivo = useRef(true);

  const cargar = useCallback(async () => {
    let siguiente: Estado;
    try {
      siguiente = { fase: "listo", equipo: await equipoApi.equipo() };
    } catch (err) {
      siguiente = interpretar(err);
    }
    if (vivo.current) setEstado(siguiente);
  }, []);

  useEffect(() => {
    vivo.current = true;
    void cargar();
    return () => {
      vivo.current = false;
    };
  }, [cargar]);

  /**
   * Toda mutación recarga.
   *
   * Sin optimismo a propósito, y es lo contrario de lo que hace `/campo`: allá
   * hay un paciente en la camilla y esperar 400 ms es caro. Aquí no hay prisa,
   * y pintar "desactivado" antes de que el servidor lo confirme sería mentir
   * sobre quién tiene acceso a un hospital.
   */
  const trasMutar = useCallback(
    async (accion: () => Promise<unknown>) => {
      setError(null);
      try {
        await accion();
        await cargar();
      } catch (err) {
        setError(
          equipoApi.mensajeDeError(
            err,
            "El servidor no respondió. No se cambió nada.",
          ),
        );
      }
    },
    [cargar],
  );

  if (estado.fase === "cargando") {
    return (
      <Pagina titulo="Equipo" bajada="Cargando…">
        <Vacio>Preguntándole a core quién está en tu organización.</Vacio>
      </Pagina>
    );
  }

  if (estado.fase === "sin-sesion") {
    return (
      <Pagina
        titulo="Equipo"
        bajada="Hay que entrar antes de administrar a nadie."
      >
        <Link
          href="/entrar?destino=/equipo"
          className="inline-flex min-h-11 items-center rounded-xl bg-marca px-4 text-sm font-semibold text-white"
        >
          Entrar
        </Link>
      </Pagina>
    );
  }

  if (estado.fase === "sin-core") {
    return (
      <Pagina titulo="Equipo" bajada="El servidor no respondió.">
        <div className="flex flex-col gap-4">
          <Alerta>
            No se pudo hablar con core. No es cosa tuya: vuelve a intentarlo y,
            si sigue igual, el servicio está caído.
          </Alerta>
          <div>
            <Boton type="button" onClick={() => void cargar()}>
              Reintentar
            </Boton>
          </div>
        </div>
      </Pagina>
    );
  }

  if (estado.fase === "sin-permiso") {
    return (
      <Pagina
        titulo="Equipo"
        bajada="Esta sesión no alcanza para administrar el equipo."
      >
        {/*
          Ámbar y no rojo: en este momento del proyecto, el motivo casi siempre
          es que el modelo de identidad todavía no existe y el servidor no sabe
          de qué organización es esta sesión. El mensaje viene de core y dice
          exactamente qué falta — repetirlo aquí en palabras propias sería
          adivinar.
        */}
        <Degradado>{estado.motivo}</Degradado>
      </Pagina>
    );
  }

  const { equipo } = estado;
  const { degradaciones } = equipo;

  return (
    <Pagina
      titulo="Equipo"
      bajada={`Quién puede entrar a ${equipo.organizacionId}, con qué rol y desde cuándo. Sacar a alguien lo desactiva; no lo borra.`}
    >
      <div className="mb-8 flex flex-col gap-3">
        {degradaciones.identidad === "turno" && (
          <Degradado>
            <strong className="font-semibold">
              Identidad de turno, no de persona.
            </strong>{" "}
            Core todavía no tiene el modelo de actores (tarea 1.3): esta sesión
            es la contraseña compartida, y todo lo que hagas aquí queda atribuido
            a ella y no a ti.
          </Degradado>
        )}

        {degradaciones.correo === "ninguno" && (
          <Degradado>
            <strong className="font-semibold">Sin proveedor de correo.</strong>{" "}
            Las invitaciones no se envían: el enlace se muestra en pantalla al
            crearlas, y hay que pasarlo a mano.
          </Degradado>
        )}

        {error && <Alerta>{error}</Alerta>}
      </div>

      {equipo.puedeInvitar ? (
        <Seccion titulo="Invitar a alguien">
          <FormularioInvitacion
            rolesOtorgables={equipo.rolesOtorgables}
            invitar={async (datos) => {
              const res = await equipoApi.invitar(equipo.organizacionId, datos);
              // Se recarga por detrás para que la invitación nueva aparezca en
              // la lista, pero el resultado se devuelve al formulario: lleva el
              // enlace, y esa es la única vez que se puede ver.
              await cargar();
              return res;
            }}
          />
        </Seccion>
      ) : (
        <Seccion titulo="Invitar a alguien">
          <Vacio>
            Tu rol no puede invitar. Invitar y repartir roles es del
            administrador de la organización.
          </Vacio>
        </Seccion>
      )}

      <Seccion titulo="Personas" cuenta={equipo.actores.length}>
        <ListaActores
          actores={equipo.actores}
          puedeAdministrar={equipo.puedeInvitar}
          ultimoAccesoDisponible={degradaciones.ultimoAcceso}
          cambiarActivo={(actor: ActorEquipo, activo: boolean) =>
            trasMutar(() =>
              activo
                ? equipoApi.reactivarActor(equipo.organizacionId, actor.id)
                : equipoApi.desactivarActor(equipo.organizacionId, actor.id),
            )
          }
        />
      </Seccion>

      <Seccion titulo="Invitaciones" cuenta={equipo.invitaciones.length}>
        <ListaInvitaciones
          invitaciones={equipo.invitaciones}
          puedeAdministrar={equipo.puedeInvitar}
          revocar={(invitacion: InvitacionEquipo) =>
            trasMutar(() =>
              equipoApi.revocarInvitacion(
                equipo.organizacionId,
                invitacion.id,
              ),
            )
          }
        />
      </Seccion>

      <Seccion titulo="Bitácora">
        <Bitacora eventos={equipo.eventos} />
      </Seccion>
    </Pagina>
  );
}

function interpretar(err: unknown): Estado {
  if (!(err instanceof ErrorApi)) return { fase: "sin-core" };
  if (err.status === 401) return { fase: "sin-sesion" };
  if (err.status === 403) return { fase: "sin-permiso", motivo: err.message };
  return { fase: "sin-core" };
}
