"use client";

/**
 * Aceptar una invitación.
 *
 * ── LA MISMA PUERTA ────────────────────────────────────────────────
 * Se pinta con `PuertaPulso`, el marco de `/entrar` y `/entrar/recuperar`, y no
 * con un diseño propio. Es deliberado: una pantalla que pide datos y **no se
 * parece** al login del producto es la señal clásica de phishing. Quien llega
 * aquí lo hace desde un correo, que es justo el contexto en el que hay que
 * poder reconocer la casa.
 *
 * ── UN ENLACE MUERTO NO ES UN ERROR ────────────────────────────────
 * Usado, revocado y vencido son tres estados normales de una invitación, y los
 * tres mandan a hacer lo mismo pero por motivos distintos. Core los distingue
 * con un 410 y un mensaje claro; esta pantalla lo pinta tal cual en vez de
 * traducirlo a "algo salió mal". El texto viene del servidor porque es el
 * único que sabe cuál de los tres fue.
 *
 * ── NO SE PIDE CONTRASEÑA ──────────────────────────────────────────
 * Y no es un olvido. Fijar credenciales es la tarea 1.3 (Argon2id, mínimos,
 * bloqueo progresivo — multitenancy §3.6). Un campo de contraseña aquí, contra
 * un core que hoy guarda `sha256` sin sal, sería seguridad de mentira: parece
 * hecho y no lo está. Se dice lo que falta en vez de simularlo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import * as equipoApi from "@/lib/api-equipo";
import type {
  AceptacionInvitacion,
  DescripcionInvitacion,
} from "@/lib/api-equipo";
import {
  Alerta,
  BotonPrimario,
  Campo,
  Degradado,
  ENLACE_SECUNDARIO,
  PuertaPulso,
} from "@/components/PuertaPulso";
import { nombreRol, relativo } from "@/components/panel/piezas";

type Estado =
  | { fase: "cargando" }
  | { fase: "valida"; invitacion: DescripcionInvitacion }
  | { fase: "muerta"; mensaje: string }
  | { fase: "desconocida" }
  | { fase: "sin-core" }
  | { fase: "aceptada"; resultado: AceptacionInvitacion };

export function AceptarInvitacion({ token }: { token: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ nombre: string }>({ defaultValues: { nombre: "" } });

  /** Bandera de vida, igual que en `lib/sesion.ts`: comprobar el enlace es una
      petición a core y no se escribe estado de algo ya desmontado. */
  const vivo = useRef(true);

  const cargar = useCallback(async () => {
    const lectura = await equipoApi.leerInvitacion(token);
    if (!vivo.current) return;
    setEstado(
      lectura.estado === "valida"
        ? { fase: "valida", invitacion: lectura.invitacion }
        : lectura.estado === "muerta"
          ? { fase: "muerta", mensaje: lectura.mensaje }
          : lectura.estado === "desconocida"
            ? { fase: "desconocida" }
            : { fase: "sin-core" },
    );
  }, [token]);

  useEffect(() => {
    vivo.current = true;
    void cargar();
    return () => {
      vivo.current = false;
    };
  }, [cargar]);

  async function aceptar({ nombre }: { nombre: string }) {
    setError(null);
    try {
      const resultado = await equipoApi.aceptar(token, {
        nombre: nombre.trim() || undefined,
      });
      setEstado({ fase: "aceptada", resultado });
    } catch (err) {
      // Un 410 aquí es la carrera real: el enlace se usó entre que se cargó la
      // pantalla y se pulsó el botón. Se relee para pintar el motivo exacto.
      const lectura = await equipoApi.leerInvitacion(token);
      if (lectura.estado === "muerta") {
        setEstado({ fase: "muerta", mensaje: lectura.mensaje });
        return;
      }
      setError(
        equipoApi.mensajeDeError(
          err,
          "El servidor no respondió. No se creó ninguna cuenta.",
        ),
      );
    }
  }

  if (estado.fase === "cargando") {
    return (
      <PuertaPulso titulo="Invitación" subtitulo="Comprobando el enlace…">
        <p className="text-sm text-texto-tenue">Un momento.</p>
      </PuertaPulso>
    );
  }

  if (estado.fase === "muerta" || estado.fase === "desconocida") {
    return (
      <PuertaPulso titulo="Este enlace ya no sirve" subtitulo="Nada que hacer aquí.">
        <div className="flex flex-col gap-4">
          <Degradado>
            {estado.fase === "muerta"
              ? estado.mensaje
              : "Este enlace no corresponde a ninguna invitación. Puede estar " +
                "cortado por el correo: cópialo entero desde el mensaje."}
          </Degradado>
          <Link
            href="/entrar"
            className={`${ENLACE_SECUNDARIO} text-texto-tenue hover:text-texto`}
          >
            Ir a entrar
          </Link>
        </div>
      </PuertaPulso>
    );
  }

  if (estado.fase === "sin-core") {
    return (
      <PuertaPulso titulo="Invitación" subtitulo="El servidor no respondió.">
        <div className="flex flex-col gap-4">
          <Alerta>
            No se pudo comprobar el enlace. No es cosa tuya: vuelve a intentarlo.
          </Alerta>
          <BotonPrimario type="button" onClick={() => void cargar()}>
            Reintentar
          </BotonPrimario>
        </div>
      </PuertaPulso>
    );
  }

  if (estado.fase === "aceptada") {
    return (
      <PuertaPulso titulo="Listo" subtitulo="Tu cuenta quedó creada.">
        <div className="flex flex-col gap-4">
          <p role="status" className="text-sm leading-relaxed">
            Ya eres parte de{" "}
            <strong className="font-semibold">
              {estado.resultado.organizacionId}
            </strong>{" "}
            como{" "}
            <strong className="font-semibold">
              {nombreRol(estado.resultado.actor.roles[0] ?? "")}
            </strong>
            .
          </p>
          {/* Lo que falta, dicho por core. La regla 2 del repo también aplica
              al final feliz: no se pinta "ya puedes entrar" si todavía no. */}
          <Degradado>{estado.resultado.siguiente}</Degradado>
          <Link
            href="/entrar"
            className="grid min-h-14 w-full place-items-center rounded-xl border border-borde text-sm transition-colors hover:border-info"
          >
            Ir a entrar
          </Link>
        </div>
      </PuertaPulso>
    );
  }

  const { invitacion } = estado;

  return (
    <PuertaPulso
      titulo="Te invitaron a PULSO"
      subtitulo={`Como ${nombreRol(invitacion.rol)} en ${invitacion.organizacionId}.`}
    >
      <form
        onSubmit={form.handleSubmit(aceptar)}
        noValidate
        className="flex flex-col gap-4"
      >
        {/*
          El correo se enseña sin poder editarlo: es el que recibió la
          invitación y el que va a quedar en la cuenta. Dejar cambiarlo aquí
          convertiría un enlace dirigido en uno transferible.
        */}
        <dl className="flex flex-col gap-2 rounded-xl border border-borde bg-fondo/60 px-3.5 py-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-texto-tenue">Correo</dt>
            <dd className="break-all">{invitacion.correo}</dd>
          </div>
          {invitacion.codigoSede && (
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-texto-tenue">Sede</dt>
              <dd className="tabular">{invitacion.codigoSede}</dd>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-texto-tenue">Vence</dt>
            <dd>{relativo(invitacion.expiraEn)}</dd>
          </div>
        </dl>

        <Campo
          id="nombre"
          etiqueta="Tu nombre (opcional)"
          autoFocus
          autoComplete="name"
          placeholder="Como quieres aparecer en la auditoría"
          {...form.register("nombre")}
        />

        {error && <Alerta>{error}</Alerta>}

        <BotonPrimario type="submit" cargando={form.formState.isSubmitting}>
          Aceptar la invitación
        </BotonPrimario>

        <p className="text-xs leading-relaxed text-texto-tenue">
          El enlace sirve una sola vez. Si no esperabas esto, ciérralo: sin
          aceptar no se crea nada.
        </p>
      </form>
    </PuertaPulso>
  );
}
