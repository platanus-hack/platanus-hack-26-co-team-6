"use client";

/**
 * /entrar — puerta de las consolas.
 *
 * ── DOS PUERTAS, UNA PANTALLA ──────────────────────────────────────
 * PULSO está a mitad de camino entre dos modelos de identidad y la pantalla
 * lo refleja sin mentir:
 *
 *   modo "actor"   → correo + contraseña. Identidad real, roles, organización.
 *   modo "legacy"  → contraseña de turno compartida (`PULSO_AUTH_LEGACY=true`).
 *
 * El modo lo dice core en `GET /auth/sesion`. Si no lo dice, arrancamos en
 * legacy: es la puerta que funciona hoy, se pinta sin esperar a nadie y se
 * puede teclear aunque core esté caído.
 *
 * ── LO QUE ESTA PANTALLA NO HACE ───────────────────────────────────
 * No distingue "ese correo no existe" de "esa contraseña está mal". El mensaje
 * es uno solo, siempre.
 *
 * Y no ve el token: core lo pone en una cookie HttpOnly. Este archivo tampoco
 * guarda la contraseña en ningún sitio.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as api from "@/lib/api";
import { ErrorApi } from "@/lib/api";
import {
  destinoInterno,
  ModoAuth,
  normalizarSesion,
  Organizacion,
  rutaPorRol,
} from "@/lib/sesion";
import {
  Alerta,
  BotonPrimario,
  Campo,
  ENLACE_SECUNDARIO,
  PuertaPulso,
  Secundario,
} from "@/components/PuertaPulso";

/** Uno solo, para los dos modos y para todos los fallos de credenciales. */
const CREDENCIALES = "Credenciales incorrectas.";
const SIN_CORE = "No se pudo contactar a core. ¿Está corriendo en el puerto 3001?";
/**
 * Core pidió elegir organización y no mandó ninguna.
 *
 * No se entra "con la primera" ni se sigue de largo: de esa elección depende de
 * qué inquilino son los datos que se van a ver y a nombre de quién quedan las
 * decisiones. Ante la duda, no se pasa — y se dice por qué.
 */
const SIN_ORGANIZACIONES =
  "Tu correo tiene acceso a varias organizaciones, pero el servidor no dijo cuáles. No podemos elegir por ti: avísale a quien administra tu organización.";

/**
 * Con qué puerta arranca la pantalla antes de que core conteste.
 *
 * "legacy" a propósito: es la que funciona hoy. Cuando core empiece a responder
 * `modo:"actor"` (tarea 1.3), la pantalla cambia sola al llegar la respuesta.
 */
const MODO_INICIAL: ModoAuth = "legacy";

const esquemaCorreo = z.object({
  correo: z.email("Escribe un correo válido"),
  password: z.string().min(1, "Escribe tu contraseña"),
});
type FormCorreo = z.infer<typeof esquemaCorreo>;

const esquemaTurno = z.object({
  password: z.string().min(1, "Escribe la contraseña de turno"),
});
type FormTurno = z.infer<typeof esquemaTurno>;

/**
 * A dónde mandar tras entrar, leído de `?destino=` en el momento del submit.
 *
 * Se lee aquí y no con useSearchParams porque eso obligaría a un <Suspense>
 * alrededor de la página entera solo para un query param. Quién puede pasar el
 * filtro lo decide `destinoInterno`, que está en el modelo y tiene tests.
 */
function destinoPedido(): string | null {
  if (typeof window === "undefined") return null;
  return destinoInterno(
    new URLSearchParams(window.location.search).get("destino"),
  );
}

export default function Entrar() {
  const router = useRouter();
  const sinMovimiento = useReducedMotion();

  const [modo, setModo] = useState<ModoAuth>(MODO_INICIAL);
  const [error, setError] = useState<string | null>(null);
  /** Cuando el correo tiene actor en varias organizaciones. */
  const [aElegir, setAElegir] = useState<Organizacion[] | null>(null);
  /** Su consola todavía no está construida: se lo decimos, no lo escondemos. */
  const [pendiente, setPendiente] = useState<{
    /** La consola que le tocaba y todavía no existe. */
    suya: string;
    /** A dónde se le ofrece ir mientras tanto. */
    destino: string;
  } | null>(null);

  /**
   * Tras un login correcto, core ya sabe quién entró: se lo preguntamos y con
   * eso decidimos la consola. El `?destino=` explícito manda — venía de una
   * sesión que se cayó a mitad de trabajo y ahí es donde quiere volver.
   */
  const entrar = useCallback(async () => {
    const sesion = normalizarSesion(await api.sesion().catch(() => null));

    const pedido = destinoPedido();
    if (pedido) {
      router.replace(pedido);
      return;
    }

    const { destino, pendiente: sinConstruir } = rutaPorRol(sesion.roles);
    if (sinConstruir) {
      setPendiente({ suya: sinConstruir, destino });
      return;
    }
    router.replace(destino);
  }, [router]);

  // Averiguar el modo y, de paso, saltarse el login si ya hay sesión viva.
  useEffect(() => {
    let vivo = true;
    api
      .sesion()
      .then((crudo) => {
        if (!vivo) return;
        const leido = normalizarSesion(crudo);
        setModo(leido.modo);
        if (leido.autenticado) void entrar();
      })
      .catch(() => {
        // core caído: lo decimos ya, no después de que teclee una contraseña
        // que no va a llegar a ninguna parte.
        if (vivo) setError(SIN_CORE);
      });
    return () => {
      vivo = false;
    };
  }, [entrar]);

  const traducir = (err: unknown) =>
    err instanceof ErrorApi && (err.status === 401 || err.status === 400)
      ? CREDENCIALES
      : SIN_CORE;

  const formCorreo = useForm<FormCorreo>({
    resolver: zodResolver(esquemaCorreo),
    defaultValues: { correo: "", password: "" },
  });

  const formTurno = useForm<FormTurno>({
    resolver: zodResolver(esquemaTurno),
    defaultValues: { password: "" },
  });

  async function enviarCorreo(datos: FormCorreo) {
    setError(null);
    try {
      const res = await api.login(datos);
      formCorreo.setValue("password", "");

      if (res.requiereOrganizacion) {
        // La lista suele venir en la respuesta del login; si core solo levantó
        // la bandera, se la pedimos a /auth/sesion antes de rendirnos.
        const opciones = res.organizaciones?.length
          ? res.organizaciones
          : normalizarSesion(await api.sesion().catch(() => null)).organizaciones;

        if (opciones.length === 0) {
          setError(SIN_ORGANIZACIONES);
          return;
        }
        setAElegir(opciones);
        return;
      }

      await entrar();
    } catch (err) {
      setError(traducir(err));
    }
  }

  async function enviarTurno(datos: FormTurno) {
    setError(null);
    try {
      await api.loginTurno(datos.password);
      formTurno.setValue("password", "");
      await entrar();
    } catch (err) {
      setError(traducir(err));
    }
  }

  async function elegir(organizacionId: string) {
    setError(null);
    try {
      await api.elegirOrganizacion(organizacionId);
      setAElegir(null);
      await entrar();
    } catch (err) {
      setError(traducir(err));
    }
  }

  const enviando =
    formCorreo.formState.isSubmitting || formTurno.formState.isSubmitting;

  /** Qué se está mostrando. Cada fase entra y sale como una sola pieza. */
  const fase = pendiente ? "pendiente" : aElegir ? "organizacion" : modo;

  return (
    <PuertaPulso
      titulo={
        fase === "pendiente"
          ? "Entraste"
          : fase === "organizacion"
            ? "¿Con cuál organización?"
            : "Acceso a las consolas"
      }
      subtitulo={
        fase === "pendiente"
          ? "Tu consola todavía no está construida."
          : fase === "organizacion"
            ? "Tu correo tiene acceso a varias."
            : "Restringido al personal de turno."
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={fase}
          initial={sinMovimiento ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={sinMovimiento ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {fase === "pendiente" && pendiente && (
            <ConsolaPendiente
              suya={pendiente.suya}
              destino={pendiente.destino}
              alContinuar={() => router.replace(pendiente.destino)}
            />
          )}

          {fase === "organizacion" && aElegir && (
            <SelectorOrganizacion
              organizaciones={aElegir}
              alElegir={elegir}
              deshabilitado={enviando}
            />
          )}

          {fase === "actor" && (
            <form
              onSubmit={formCorreo.handleSubmit(enviarCorreo)}
              noValidate
              className="flex flex-col gap-4"
            >
              <Campo
                id="correo"
                etiqueta="Correo"
                type="email"
                autoFocus
                autoComplete="username"
                placeholder="nombre@tuhospital.co"
                error={formCorreo.formState.errors.correo?.message}
                {...formCorreo.register("correo")}
              />
              <Campo
                id="password"
                etiqueta="Contraseña"
                type="password"
                autoComplete="current-password"
                error={formCorreo.formState.errors.password?.message}
                {...formCorreo.register("password")}
              />
              {error && <Alerta>{error}</Alerta>}
              <BotonPrimario type="submit" cargando={enviando}>
                Entrar
              </BotonPrimario>

              {/* `flex-wrap`: a 320 px los dos textos no caben en una línea y
                  sin esto el segundo empuja la tarjeta a scroll horizontal. */}
              <div className="flex flex-wrap items-center justify-between gap-x-4">
                <Link
                  href="/entrar/recuperar"
                  className={`${ENLACE_SECUNDARIO} text-info`}
                >
                  Olvidé mi contraseña
                </Link>
                <Secundario
                  onClick={() => {
                    setError(null);
                    setModo("legacy");
                  }}
                >
                  Contraseña de turno
                </Secundario>
              </div>
            </form>
          )}

          {fase === "legacy" && (
            <form
              onSubmit={formTurno.handleSubmit(enviarTurno)}
              noValidate
              className="flex flex-col gap-4"
            >
              {/*
                Un formulario con contraseña y sin campo de usuario deja a los
                gestores de contraseñas sin nada bajo lo que guardarla, y el
                navegador lo avisa por consola. El usuario aquí existe y es
                real: la cuenta es el turno, compartida, que es justo lo que
                esta pantalla admite sin disimulo. Se va con 1.3.
              */}
              <input
                type="text"
                name="usuario"
                value="turno"
                readOnly
                tabIndex={-1}
                aria-hidden
                autoComplete="username"
                className="sr-only"
              />
              <Campo
                id="password"
                etiqueta="Contraseña de turno"
                type="password"
                autoFocus
                autoComplete="current-password"
                error={formTurno.formState.errors.password?.message}
                {...formTurno.register("password")}
              />
              {error && <Alerta>{error}</Alerta>}
              <BotonPrimario type="submit" cargando={enviando}>
                Entrar
              </BotonPrimario>

              <p className="text-xs leading-relaxed text-texto-tenue">
                Una contraseña para todo el turno: esta consola todavía no sabe
                quién eres, y por eso no puede atribuirte ninguna decisión.
              </p>
              <div className="flex justify-start">
                <Secundario
                  onClick={() => {
                    setError(null);
                    setModo("actor");
                  }}
                >
                  Entrar con correo
                </Secundario>
              </div>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </PuertaPulso>
  );
}

// ── Fases ────────────────────────────────────────────────────────

/**
 * Caso límite 1 de multitenancy §7: un correo con actor en dos organizaciones.
 * No se elige por él ni se toma la primera — de eso depende de qué inquilino
 * son los datos que va a ver.
 */
function SelectorOrganizacion({
  organizaciones,
  alElegir,
  deshabilitado,
}: {
  organizaciones: Organizacion[];
  alElegir: (id: string) => void;
  deshabilitado: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-texto-tenue">
        Lo que veas y lo que puedas hacer depende de esta elección.
      </p>
      <ul className="flex flex-col gap-2">
        {organizaciones.map((org) => (
          <li key={org.id}>
            <button
              type="button"
              disabled={deshabilitado}
              onClick={() => alElegir(org.id)}
              className="flex min-h-14 w-full flex-col justify-center rounded-xl border border-borde bg-fondo/70 px-4 py-3 text-left transition-colors hover:border-info disabled:opacity-40"
            >
              {/* Los nombres del REPS son largos de verdad
                  ("E.S.E. Hospital Universitario…"): sin `break-words` uno
                  solo saca la tarjeta del ancho a 320 px. */}
              <span className="block break-words text-sm font-medium">
                {org.nombre ?? org.id}
              </span>
              {org.tipo && (
                <span className="block text-xs text-texto-tenue">{org.tipo}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * La consola que le toca a su rol todavía no existe. Hoy no la dispara nadie
 * —las seis rutas de `DESTINO` están construidas— pero se queda: es la red
 * bajo el próximo rol que se agregue antes que su pantalla. Mandarlo a un 404
 * justo después de un login correcto es la peor pantalla posible; mandarlo a
 * otra sin decírselo, la segunda peor.
 */
function ConsolaPendiente({
  suya,
  destino,
  alContinuar,
}: {
  suya: string;
  destino: string;
  alContinuar: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-texto-tenue">
        <code className="text-texto">{suya}</code> todavía no está construida.
        Mientras tanto puedes trabajar en{" "}
        <code className="text-texto">{destino}</code>.
      </p>
      <BotonPrimario type="button" onClick={alContinuar}>
        Continuar a {destino}
      </BotonPrimario>
    </div>
  );
}
