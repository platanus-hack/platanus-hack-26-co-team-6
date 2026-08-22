"use client";

/**
 * §1 — La pantalla de arranque.
 *
 * Deliberadamente vacía salvo lo esencial. Un botón enorme y, si hay casos
 * abiertos, la lista para volver a ellos. Nada más compite por la atención.
 *
 * ── POR QUÉ EL BOTÓN ES TAN GRANDE ────────────────────────────────
 * Se toca de pie, dentro de un vehículo en movimiento, posiblemente con
 * guantes y con una mano ocupada. El mínimo tocable del proyecto son 44px;
 * este es el gesto principal de todo el módulo, así que se lleva mucho más.
 */

import type { CasoPublico, Handshake } from "@/lib/types";
import { ETIQUETA_TRIAGE, esHoraDorada } from "@/lib/presentacion";

/** Un caso abierto, ya emparejado con el estado de su última solicitud. */
export interface CasoActivo {
  caso: CasoPublico;
  handshake: Handshake | null;
  /** Segundos desde que se creó. Lo calcula la página, que tiene el reloj. */
  transcurridoS: number;
}

export function PantallaInicio({
  casos,
  onNuevo,
  onAbrir,
}: {
  casos: CasoActivo[];
  onNuevo: () => void;
  onAbrir: (casoId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-6">
      <button
        onClick={onNuevo}
        className="w-full min-h-[7rem] rounded-3xl font-bold text-xl
                   flex flex-col items-center justify-center gap-1
                   bg-[color:var(--color-critico)] text-white
                   shadow-lg shadow-[color:var(--color-critico)]/20
                   active:scale-[0.98] transition-transform"
      >
        <span className="text-3xl leading-none" aria-hidden>
          🎙
        </span>
        Nuevo caso
        <span className="text-xs font-normal opacity-80">
          dicta y el sistema busca destino
        </span>
      </button>

      {casos.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
            {casos.length === 1 ? "Caso en curso" : `${casos.length} casos en curso`}
          </h2>
          <ul className="space-y-2">
            {casos.map((c) => (
              <li key={c.caso.id}>
                <TarjetaActivo activo={c} onAbrir={onAbrir} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Cómo va este caso, en una palabra. Ver `estadoDe`. */
type Etapa = "buscando" | "esperando" | "aceptado" | "rechazado";

const ETIQUETA_ETAPA: Record<Etapa, string> = {
  buscando: "Buscando destino",
  esperando: "Esperando confirmación",
  aceptado: "Aceptado · en ruta",
  rechazado: "Sin respuesta · reintentando",
};

const COLOR_ETAPA: Record<Etapa, string> = {
  buscando: "var(--color-info)",
  esperando: "var(--color-alerta)",
  aceptado: "var(--color-estable)",
  rechazado: "var(--color-critico)",
};

function etapaDe(h: Handshake | null): Etapa {
  if (!h) return "buscando";
  if (h.estado === "aceptado") return "aceptado";
  if (h.estado === "enviado") return "esperando";
  return "rechazado";
}

function TarjetaActivo({
  activo,
  onAbrir,
}: {
  activo: CasoActivo;
  onAbrir: (casoId: string) => void;
}) {
  const { caso, handshake, transcurridoS } = activo;
  const etapa = etapaDe(handshake);
  const critico = esHoraDorada(caso.triage);

  return (
    <button
      onClick={() => onAbrir(caso.id)}
      className={`w-full p-4 rounded-2xl text-left border ${
        critico
          ? "border-[color:var(--color-critico)]/50 bg-[color:var(--color-critico)]/10"
          : "border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{caso.dxDescripcion}</p>
          <p className="mt-0.5 text-xs text-[color:var(--color-texto-tenue)]">
            Triage {ETIQUETA_TRIAGE[caso.triage]} · {caso.tipoMovil}
          </p>
        </div>

        {/* El cronómetro vivo: es lo que convierte una lista en una urgencia. */}
        <div className="shrink-0 text-right tabular">
          <div className="text-2xl font-bold leading-none">
            {formatoReloj(transcurridoS)}
          </div>
          <div className="text-[10px] text-[color:var(--color-texto-tenue)]">
            en curso
          </div>
        </div>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
            etapa === "esperando" || etapa === "buscando" ? "latido" : ""
          }`}
          style={{ background: COLOR_ETAPA[etapa] }}
          aria-hidden
        />
        <span style={{ color: COLOR_ETAPA[etapa] }}>{ETIQUETA_ETAPA[etapa]}</span>
      </p>
    </button>
  );
}

/** mm:ss mientras tenga sentido; a partir de una hora, hh:mm:ss. */
function formatoReloj(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const seg = t % 60;
  const dosCifras = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${h}:${dosCifras(m)}:${dosCifras(seg)}`
    : `${m}:${dosCifras(seg)}`;
}
