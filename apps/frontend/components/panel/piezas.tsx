/**
 * Las piezas del panel de administración.
 *
 * ── POR QUÉ NO SHADCN ──────────────────────────────────────────────
 * shadcn/ui entra en `/panel` con la tarea 2.7, que es la dueña del shell y
 * de esa decisión. Esta tarea cuelga una página de ese shell y no puede
 * adelantarla: instalar shadcn desde aquí metería un `components.json`, un
 * `tailwind.config` y una carpeta `ui/` que después 2.7 tendría que deshacer.
 *
 * Así que estas piezas son Tailwind pelado sobre los tokens que ya existen en
 * `app/globals.css` (`--color-superficie`, `--color-borde`, `--color-marca`…).
 * No inventan lenguaje visual: son la misma paleta de las consolas, en la
 * densidad de una pantalla de escritorio. Cuando 2.7 aterrice, este archivo se
 * cambia por sus primitivas y las páginas no se enteran.
 *
 * ── LAS REGLAS QUE SÍ APLICAN AQUÍ ─────────────────────────────────
 * `/panel` no es consola de campo, pero tres reglas no dependen de eso:
 * área táctil ≥ 44 px (un administrador de IPS pequeña entra desde el
 * celular), nada de scroll horizontal a 320 px, y `prefers-reduced-motion`
 * respetado — que aquí sale gratis porque no hay una sola animación.
 */

import type { ReactNode } from "react";

/** El marco de la página. Existe hasta que 2.7 traiga el layout de verdad. */
export function Pagina({
  titulo,
  bajada,
  children,
}: {
  titulo: string;
  bajada: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-fondo px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8">
          <h1 className="text-[clamp(1.375rem,1.2rem+0.8vw,1.75rem)] font-semibold tracking-tight">
            {titulo}
          </h1>
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-texto-tenue">
            {bajada}
          </p>
        </header>
        {children}
      </div>
    </main>
  );
}

export function Seccion({
  titulo,
  cuenta,
  children,
}: {
  titulo: string;
  cuenta?: number;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-texto-tenue">
        {titulo}
        {cuenta !== undefined && (
          <span className="tabular text-xs font-normal">({cuenta})</span>
        )}
      </h2>
      {children}
    </section>
  );
}

export function Tarjeta({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
      {children}
    </div>
  );
}

/**
 * Estado vacío con acción. Un vacío mudo obliga a adivinar si la pantalla
 * falló o si de verdad no hay nada.
 */
export function Vacio({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-borde px-4 py-6 text-center text-sm leading-relaxed text-texto-tenue">
      {children}
    </p>
  );
}

const TONO = {
  neutro: "border-borde text-texto-tenue",
  info: "border-info/40 bg-info/10 text-info",
  estable: "border-estable/40 bg-estable/10 text-estable",
  alerta: "border-alerta/40 bg-alerta/10 text-alerta",
  critico: "border-critico/40 bg-critico/10 text-critico",
} as const;

export type Tono = keyof typeof TONO;

/** Cápsula de estado. Nunca lleva texto largo: es un estado, no una frase. */
export function Pildora({
  tono = "neutro",
  children,
}: {
  tono?: Tono;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONO[tono]}`}
    >
      {children}
    </span>
  );
}

/**
 * Botón de acción. 44 px de alto: el mínimo del repo, también aquí.
 *
 * `peligro` no es rojo por drama — es el color de "esto le quita el acceso a
 * una persona", y tiene que distinguirse de "guardar" a la velocidad a la que
 * se pulsa un botón en una tabla.
 */
export function Boton({
  variante = "secundario",
  cargando,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario" | "peligro";
  cargando?: boolean;
}) {
  const estilo = {
    primario: "bg-marca text-white hover:opacity-90",
    secundario:
      "border border-borde bg-transparent text-texto hover:border-info",
    peligro:
      "border border-critico/50 bg-transparent text-critico hover:bg-critico/10",
  }[variante];

  return (
    <button
      {...props}
      disabled={cargando || props.disabled}
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium transition-colors disabled:opacity-40 ${estilo} ${props.className ?? ""}`}
    >
      {cargando ? "Un momento…" : children}
    </button>
  );
}

/** Un fallo que hay que ver. `role="alert"` para el lector de pantalla. */
export function Alerta({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-critico/40 bg-critico/10 px-3.5 py-3 text-sm leading-relaxed text-critico"
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
export function Degradado({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-alerta/40 bg-alerta/10 px-3.5 py-3 text-xs leading-relaxed text-alerta">
      {children}
    </p>
  );
}

/** Confirmación de que algo pasó. `role="status"`: se anuncia sin interrumpir. */
export function Aviso({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-xl border border-estable/40 bg-estable/10 px-3.5 py-3 text-sm leading-relaxed text-estable"
    >
      {children}
    </div>
  );
}

/** Nombre legible de cada rol. Los identificadores van sin tildes; esto no. */
export const NOMBRE_ROL: Record<string, string> = {
  paramedico: "Paramédico",
  jefe_urgencias: "Jefe de urgencias",
  admin_organizacion: "Administrador de la organización",
  regulador_crue: "Regulador del CRUE",
  auditor: "Auditor",
  admin_plataforma: "Administrador de plataforma",
  servicio: "Servicio",
};

export function nombreRol(rol: string): string {
  return NOMBRE_ROL[rol] ?? rol;
}

/**
 * Fecha corta y legible. `undefined` de `locale` a propósito: la del navegador,
 * que es la del hospital, no la que adivine el servidor.
 */
export function fecha(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t)
    ? null
    : new Date(t).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** "en 2 d 4 h" / "hace 3 h". Un ISO crudo no se lee de un vistazo. */
export function relativo(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;

  const min = Math.round((t - Date.now()) / 60000);
  const abs = Math.abs(min);
  const magnitud =
    abs < 60
      ? `${abs} min`
      : abs < 60 * 24
        ? `${Math.round(abs / 60)} h`
        : `${Math.round(abs / (60 * 24))} d`;

  return min >= 0 ? `en ${magnitud}` : `hace ${magnitud}`;
}
