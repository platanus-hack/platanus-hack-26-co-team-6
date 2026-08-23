"use client";

/**
 * ═══════════════════════════════════════════════════════════════════
 *  LOS TRES RELOJES — Y POR QUÉ NO PUEDEN PARECERSE
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Miden cosas distintas y confundirlos es un error clínico:
 *
 *    ETA               cuándo llega la ambulancia
 *    VENTANA CLÍNICA   cuánto tiempo le queda al paciente
 *    PREPARACIÓN       qué falta en la sala
 *
 *  Un jefe de urgencias que lee "82" en el reloj equivocado prepara la sala
 *  para dentro de una hora y media cuando la camilla entra en siete minutos.
 *
 *  Por eso se distinguen por FORMA, no por color:
 *
 *    ETA          barra horizontal que se vacía   →  una línea que avanza
 *    VENTANA      anillo que se llena             →  un círculo
 *    PREPARACIÓN  casillas discretas, una por ítem → cuadrados contables
 *
 *  El color se usa encima, pero nunca solo: en un proyector desaturado, con la
 *  luz de un pasillo dándole a la pantalla, o para quien no distingue rojo de
 *  verde, la forma es lo único que sobrevive. Cada tarjeta lleva además su
 *  unidad escrita —mm:ss, minutos, ítems— porque tres números sin unidad son
 *  tres números iguales.
 */

import { Ambulance, ClipboardCheck, HeartPulse } from "lucide-react";
import type {
  CuentaLlegada,
  EstadoVentana,
  ProgresoPreparacion,
  RotuloEta,
  VentanaClinica,
} from "@/lib/recepcion-modelo";

export function TresRelojes({
  cuenta,
  rotulo,
  ventana,
  estado,
  progreso,
}: {
  cuenta: CuentaLlegada;
  rotulo: RotuloEta;
  ventana: VentanaClinica | null;
  estado: EstadoVentana | null;
  progreso: ProgresoPreparacion;
}) {
  return (
    <section
      aria-label="Los tres relojes"
      className="grid gap-3 sm:gap-4 md:grid-cols-3"
    >
      <RelojEta cuenta={cuenta} rotulo={rotulo} />
      <RelojVentana ventana={ventana} estado={estado} />
      <RelojPreparacion progreso={progreso} />
    </section>
  );
}

/** Marco común. Lo único que comparten los tres: el rótulo de qué miden. */
function Reloj({
  icono,
  nombre,
  mide,
  color,
  atenuado,
  children,
  pie,
}: {
  icono: React.ReactNode;
  nombre: string;
  mide: string;
  color: string;
  atenuado?: boolean;
  children: React.ReactNode;
  pie: React.ReactNode;
}) {
  return (
    <article
      className={`flex flex-col rounded-3xl p-4 sm:p-5 border ${
        atenuado
          ? "border-dashed border-[color:var(--color-borde)]"
          : "border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]"
      }`}
    >
      <div className="flex items-center gap-2" style={{ color }}>
        <span aria-hidden className="shrink-0">
          {icono}
        </span>
        <h3 className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em]">
          {nombre}
        </h3>
      </div>

      {/* Qué mide, en palabras. Es la línea que impide leer el número
          equivocado, y por eso no es un tooltip: está siempre. */}
      <p className="mt-0.5 text-[11px] sm:text-xs text-[color:var(--color-texto-tenue)]">
        {mide}
      </p>

      <div className="mt-3 flex-1">{children}</div>

      <div className="mt-3 text-[11px] sm:text-xs leading-snug">{pie}</div>
    </article>
  );
}

// ── 1. ETA · barra horizontal ────────────────────────────────────

function RelojEta({
  cuenta,
  rotulo,
}: {
  cuenta: CuentaLlegada;
  rotulo: RotuloEta;
}) {
  const sinDato = cuenta.restanteS === null;
  const color = rotulo.enVivo && !rotulo.aproximado
    ? "var(--color-estable)"
    : "var(--color-alerta)";

  return (
    <Reloj
      icono={<Ambulance className="size-4 sm:size-5" strokeWidth={2.4} />}
      nombre="ETA"
      mide="Cuándo llega la ambulancia"
      color={sinDato ? "var(--color-texto-tenue)" : color}
      atenuado={sinDato}
      pie={
        <span
          style={{
            color: rotulo.enVivo && !rotulo.aproximado
              ? "var(--color-texto-tenue)"
              : "var(--color-alerta)",
          }}
        >
          {rotulo.detalle}
        </span>
      }
    >
      <p className="tabular font-black leading-none text-[clamp(2rem,7vw,3.25rem)]">
        {cuenta.reloj}
        <span className="ml-1.5 text-[0.32em] font-bold uppercase tracking-widest text-[color:var(--color-texto-tenue)]">
          mm:ss
        </span>
      </p>

      {/* La forma: una LÍNEA que se vacía de derecha a izquierda. */}
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[color:var(--color-superficie-alta)]"
        role="progressbar"
        aria-label="Tiempo restante para la llegada"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((cuenta.fraccion ?? 0) * 100)}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${(cuenta.fraccion ?? 0) * 100}%`,
            background: color,
          }}
        />
      </div>
    </Reloj>
  );
}

// ── 2. Ventana clínica · anillo ──────────────────────────────────

/** 2·π·r con r = 42 en un viewBox de 100. */
const PERIMETRO = 2 * Math.PI * 42;

function RelojVentana({
  ventana,
  estado,
}: {
  ventana: VentanaClinica | null;
  estado: EstadoVentana | null;
}) {
  if (!ventana || !estado) {
    return (
      <Reloj
        icono={<HeartPulse className="size-4 sm:size-5" strokeWidth={2.4} />}
        nombre="Ventana clínica"
        mide="Cuánto tiempo le queda al paciente"
        color="var(--color-texto-tenue)"
        atenuado
        pie={
          <span className="text-[color:var(--color-alerta)]">
            Los umbrales (door-to-balloon 90 min, door-to-needle 60 min) los fija
            el catálogo versionado de protocolos, tarea 4.4. PULSO no los inventa
            en la pantalla.
          </span>
        }
      >
        <p className="text-[clamp(1.1rem,3vw,1.5rem)] font-bold leading-tight text-[color:var(--color-texto-tenue)]">
          Sin ventana definida
        </p>
      </Reloj>
    );
  }

  const color = estado.vencida
    ? "var(--color-critico)"
    : estado.critica
      ? "var(--color-alerta)"
      : "var(--color-estable)";

  return (
    <Reloj
      icono={<HeartPulse className="size-4 sm:size-5" strokeWidth={2.4} />}
      nombre={ventana.nombre}
      mide="Cuánto tiempo le queda al paciente"
      color={color}
      pie={
        <span className="text-[color:var(--color-texto-tenue)]">
          Cuenta desde el primer contacto médico, no desde la llegada.
          {ventana.version ? ` Catálogo ${ventana.version}.` : ""}
        </span>
      }
    >
      {/* La forma: un CÍRCULO que se llena. Nada más en esta pantalla es
          redondo, así que no se puede confundir con la barra del ETA. */}
      <div className="flex items-center gap-4">
        <svg
          viewBox="0 0 100 100"
          className="size-20 sm:size-24 shrink-0 -rotate-90"
          role="img"
          aria-label={`${Math.round(estado.consumida * 100)} por ciento de la ventana consumido`}
        >
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="12"
            stroke="var(--color-superficie-alta)"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            stroke={color}
            strokeDasharray={PERIMETRO}
            strokeDashoffset={PERIMETRO * (1 - estado.consumida)}
            className="transition-[stroke-dashoffset]"
          />
        </svg>

        <div className="min-w-0">
          <p
            className={`tabular font-black leading-none text-[clamp(1.75rem,6vw,2.75rem)] ${
              estado.vencida ? "latido" : ""
            }`}
            style={{ color }}
          >
            {estado.vencida
              ? `+${Math.abs(estado.restanteMin)}`
              : estado.restanteMin}
          </p>
          <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
            {estado.vencida ? "min de más" : "min restantes"}
          </p>
          <p className="tabular text-[11px] sm:text-xs text-[color:var(--color-texto-tenue)]">
            de {estado.totalMin} min
          </p>
        </div>
      </div>
    </Reloj>
  );
}

// ── 3. Preparación · casillas ────────────────────────────────────

function RelojPreparacion({ progreso }: { progreso: ProgresoPreparacion }) {
  if (progreso.total === 0) {
    return (
      <Reloj
        icono={<ClipboardCheck className="size-4 sm:size-5" strokeWidth={2.4} />}
        nombre="Preparación"
        mide="Qué falta en la sala"
        color="var(--color-texto-tenue)"
        atenuado
        pie={
          <span className="text-[color:var(--color-alerta)]">
            El checklist lo arma el catálogo de protocolos al aceptar (tarea
            4.1). Sin él no hay nada que confirmar desde aquí.
          </span>
        }
      >
        <p className="text-[clamp(1.1rem,3vw,1.5rem)] font-bold leading-tight text-[color:var(--color-texto-tenue)]">
          Sin checklist
        </p>
      </Reloj>
    );
  }

  const color = progreso.completo
    ? "var(--color-estable)"
    : progreso.urgente
      ? "var(--color-critico)"
      : "var(--color-alerta)";

  return (
    <Reloj
      icono={<ClipboardCheck className="size-4 sm:size-5" strokeWidth={2.4} />}
      nombre="Preparación"
      mide="Qué falta en la sala"
      color={color}
      pie={
        progreso.urgente ? (
          <span className="font-semibold text-[color:var(--color-critico)]">
            ▲ La ambulancia está a menos de 5 minutos y la preparación no está
            confirmada. Queda registrado; el caso no se le quita a nadie.
          </span>
        ) : (
          <span className="text-[color:var(--color-texto-tenue)]">
            {progreso.completo
              ? "Sala lista. Cada ítem quedó firmado con su actor y su hora."
              : `Falta confirmar: ${progreso.pendientes.map((i) => i.etiqueta).join(" · ")}`}
          </span>
        )
      }
    >
      <p className="tabular font-black leading-none text-[clamp(2rem,7vw,3.25rem)]">
        {progreso.confirmados}
        <span className="text-[0.5em] text-[color:var(--color-texto-tenue)]">
          /{progreso.total}
        </span>
        <span className="ml-2 text-[0.28em] font-bold uppercase tracking-widest text-[color:var(--color-texto-tenue)]">
          ítems
        </span>
      </p>

      {/* La forma: CASILLAS discretas, una por ítem. Se pueden contar de un
          vistazo, que es lo que hace alguien mirando desde la puerta. */}
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-hidden>
        {Array.from({ length: progreso.total }, (_, i) => (
          <li
            key={i}
            className="h-5 w-5 rounded-[6px] border-2"
            style={
              i < progreso.confirmados
                ? { background: color, borderColor: color }
                : { borderColor: "var(--color-borde)" }
            }
          />
        ))}
      </ul>
    </Reloj>
  );
}
