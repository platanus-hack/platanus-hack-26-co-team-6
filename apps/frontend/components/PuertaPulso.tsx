"use client";

/**
 * El marco de las pantallas de acceso: `/entrar` y `/entrar/recuperar`.
 *
 * Existe para que las dos sean **la misma puerta**. Un login y su recuperación
 * que no se parecen son la señal clásica de phishing, y quien entra aquí lo
 * hace de madrugada y con prisa.
 *
 * Encima del fondo va una viñeta. No es estética: sin ella la rejilla compite
 * con el texto del formulario justo donde hay que leer una contraseña.
 */

import { motion, useReducedMotion } from "motion/react";
import { LogoPulso } from "@/components/LogoPulso";
import { RejillaPulso } from "@/components/RejillaPulso";

/** El easing firma de Pulsewave. */
const SUAVE = [0.22, 1, 0.36, 1] as const;

export function PuertaPulso({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo: string;
  children: React.ReactNode;
}) {
  const sinMovimiento = useReducedMotion();

  return (
    <main className="relative min-h-dvh overflow-hidden bg-fondo">
      {/*
        Suelo CSS: la misma rejilla, quieta, dibujada con un degradado repetido.
        Existe para el caso sin WebGL — un navegador viejo, la GPU bloqueada, un
        portátil de hospital. La pantalla de acceso no puede depender de una
        tarjeta gráfica. Cuando el canvas monta se pone `data-webgl` y este
        suelo se apaga para no duplicar la trama.
      */}
      <RejillaPulso className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(120,140,168,0.22)_1.5px,transparent_1.5px)] bg-[length:22px_22px] data-[webgl]:bg-none" />

      {/* Viñeta: apaga los bordes y deja el centro para el formulario. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(10,14,20,0.15)_0%,rgba(10,14,20,0.72)_58%,rgba(10,14,20,0.96)_100%)]"
      />

      <div className="relative grid min-h-dvh place-items-center px-4 py-10">
        <motion.div
          initial={sinMovimiento ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: SUAVE }}
          className="w-full max-w-[26rem] rounded-2xl border border-borde/70 bg-neutral-900/70 p-7 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-lg sm:p-8"
        >
          <header className="mb-7 flex flex-col items-center text-center">
            <span className="mb-4 grid size-12 place-items-center rounded-full border border-borde bg-fondo/80 text-critico">
              <LogoPulso className="h-5 w-auto" decorativo />
            </span>
            <h1 className="text-[clamp(1.25rem,1.1rem+0.6vw,1.5rem)] font-semibold tracking-tight">
              {titulo}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-texto-tenue">
              {subtitulo}
            </p>
          </header>

          {children}
        </motion.div>
      </div>
    </main>
  );
}

// ── Piezas compartidas por las dos pantallas ─────────────────────

/**
 * Campo de texto.
 *
 * 48 px de alto. La regla de `/campo` (44 px mínimo) no aplica literalmente a
 * una pantalla de escritorio, pero quien entra desde la ambulancia usa esta
 * misma, y con guantes.
 */
export function Campo({
  id,
  etiqueta,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  etiqueta: string;
  error?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-texto-tenue"
      >
        {etiqueta}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`h-12 w-full rounded-xl border bg-fondo/70 px-3.5 text-base outline-none transition-colors placeholder:text-texto-tenue/50 focus:border-info ${
          error ? "border-alerta" : "border-borde"
        }`}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-alerta">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Acción principal. 56 px, ancho completo, sin ambigüedad de dónde tocar.
 *
 * Es la medida de primario de `/campo` y no la de escritorio, por lo mismo que
 * el campo de arriba: la ambulancia entra por esta pantalla.
 */
export function BotonPrimario({
  cargando,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { cargando?: boolean }) {
  return (
    <button
      className="inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-marca px-4 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      disabled={cargando || props.disabled}
      {...props}
    >
      {cargando ? "Un momento…" : children}
    </button>
  );
}

/**
 * Enlace o acción secundaria: mismo peso visual, nunca compite con la primaria.
 *
 * Pesa poco a la vista y 44 px al dedo. Las dos cosas a la vez: el `-mx-2`
 * devuelve el área de toque al margen para que el texto siga alineado con el
 * formulario en vez de quedar sangrado dos píxeles.
 */
export function Secundario({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="-mx-2 inline-flex min-h-11 items-center rounded-lg px-2 text-xs text-texto-tenue underline-offset-4 transition-colors hover:text-texto hover:underline"
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * La forma de `Secundario` para un `<Link>` de Next, que no puede ser `<button>`.
 *
 * Sin color: cada sitio pone el suyo. Lo que comparten —y lo que no puede
 * quedarse corto en ninguno— son los 44 px de área de toque.
 */
export const ENLACE_SECUNDARIO =
  "-mx-2 inline-flex min-h-11 items-center rounded-lg px-2 text-xs underline-offset-4 transition-colors hover:underline";

/** Un fallo que el usuario tiene que ver. `role="alert"` para el lector. */
export function Alerta({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-critico/40 bg-critico/10 px-3.5 py-3 text-sm text-critico"
    >
      {children}
    </p>
  );
}

/**
 * Una capacidad que no está: el aviso que exige la regla 2 del repo.
 *
 * Ámbar y no rojo a propósito: no es un error de quien lo lee, es el sistema
 * diciendo qué parte de sí mismo todavía no existe.
 */
export function Degradado({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-alerta/40 bg-alerta/10 px-3.5 py-3 text-xs leading-relaxed text-alerta">
      {children}
    </p>
  );
}
