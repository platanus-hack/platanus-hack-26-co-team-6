"use client";

/**
 * Lo que ya se respondió, con su latencia.
 *
 * Se llama auditoría y no "historial" porque eso es lo que es: cada fila es
 * una declaración de capacidad fechada, y esa trazabilidad es lo que permite
 * defender el producto frente a la Ley 1751/2015. La latencia no está de
 * adorno — es el número que el pitch compara contra los 45 minutos de una
 * llamada telefónica.
 *
 * Los vencidos aparecen: una solicitud sin respuesta también es información
 * sobre la red, y esconderla dejaría el registro incompleto justo donde más
 * importa. Por eso los filtros RECORTAN LA VISTA, nunca el registro: los
 * conteos de las cápsulas se calculan siempre sobre el total.
 *
 * La forma es la de la landing: cápsulas `rounded-full` glass para filtros y
 * búsqueda, la misma gama de tokens. La fila muestra lo mínimo; el resto
 * (horas exactas, canal, motivo completo, de qué caso era) vive en un panel
 * que aparece al posarse sobre la fila — o al enfocarla con el teclado.
 */

import { useMemo, useState } from "react";
import type { CasoPublico, Handshake } from "@/lib/types";
import { ETIQUETA_TRIAGE } from "@/lib/presentacion";

const MARCA: Record<string, { icono: string; color: string; texto: string }> = {
  aceptado: { icono: "✓", color: "var(--color-estable)", texto: "Aceptado" },
  rechazado: { icono: "✕", color: "var(--color-alerta)", texto: "Sin capacidad" },
  timeout: { icono: "◷", color: "var(--color-texto-tenue)", texto: "Sin respuesta" },
};

const CANAL: Record<string, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  consola: "Consola de urgencias",
};

type Filtro = "todas" | "aceptado" | "rechazado" | "timeout";

const FILTROS: { clave: Filtro; etiqueta: string; icono?: string; color?: string }[] = [
  { clave: "todas", etiqueta: "Todas" },
  { clave: "aceptado", etiqueta: "aceptadas", icono: "✓", color: "var(--color-estable)" },
  { clave: "rechazado", etiqueta: "sin capacidad", icono: "✕", color: "var(--color-alerta)" },
  { clave: "timeout", etiqueta: "sin respuesta", icono: "◷", color: "var(--color-texto-tenue)" },
];

/** Hora local corta. La fecha completa sería ruido: la lista es del turno. */
function hora(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Busca sin que las tildes ni las mayúsculas se interpongan. */
function plegar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function HistorialAuditoria({
  handshakes,
  nombreSede,
  caso,
}: {
  handshakes: Handshake[];
  nombreSede: (codigo: string) => string | undefined;
  /** Para que el panel diga de qué caso era la solicitud, si aún está en /estado. */
  caso?: (casoId: string) => CasoPublico | undefined;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busqueda, setBusqueda] = useState("");

  const cuentas = useMemo(() => {
    const c: Record<string, number> = { aceptado: 0, rechazado: 0, timeout: 0 };
    for (const h of handshakes) c[h.estado in c ? h.estado : "timeout"] += 1;
    return c;
  }, [handshakes]);

  const visibles = useMemo(() => {
    const aguja = plegar(busqueda.trim());
    return handshakes.filter((h) => {
      if (filtro !== "todas" && h.estado !== filtro) return false;
      if (!aguja) return true;
      const c = caso?.(h.casoId);
      const pajar = plegar(
        [
          nombreSede(h.sedeCodigo) ?? "",
          h.sedeCodigo,
          h.motivoRechazo ?? "",
          c?.dxDescripcion ?? "",
        ].join(" "),
      );
      return pajar.includes(aguja);
    });
  }, [handshakes, filtro, busqueda, nombreSede, caso]);

  if (handshakes.length === 0) return null;

  return (
    <section className="mt-8">
      <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 className="text-xs uppercase tracking-wide text-texto-tenue">
          Auditoría · {handshakes.length}{" "}
          {handshakes.length === 1 ? "respuesta" : "respuestas"}
        </h2>

        {/* Los filtros son las mismas cápsulas del hero de la landing. El
            conteo va sobre el TOTAL, no sobre lo visible: filtrar no puede
            hacer parecer que la red respondió distinto de como respondió. */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {FILTROS.map((f) => {
            const activo = filtro === f.clave;
            const cuenta =
              f.clave === "todas" ? handshakes.length : cuentas[f.clave];
            return (
              <button
                key={f.clave}
                type="button"
                aria-pressed={activo}
                onClick={() => setFiltro(f.clave)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5
                            font-medium backdrop-blur transition-colors
                            ${
                              activo
                                ? "border-critico/60 bg-critico/15 text-texto"
                                : "border-borde bg-superficie/70 text-texto-tenue hover:text-texto"
                            }`}
              >
                {f.icono && (
                  <span aria-hidden className="font-bold" style={{ color: f.color }}>
                    {f.icono}
                  </span>
                )}
                {cuenta} {f.clave === "todas" ? "todas" : f.etiqueta}
              </button>
            );
          })}
        </div>

        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar sede, motivo o caso…"
          aria-label="Buscar en la auditoría"
          className="ml-auto h-11 w-full rounded-full border border-borde
                     bg-superficie/70 px-4 text-sm backdrop-blur
                     placeholder:text-texto-tenue sm:w-72"
        />
      </header>

      {/* Sin contenedor con overflow a propósito: el panel de detalle se
          posiciona fuera de la fila y un scroll container lo recortaría. */}
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-texto-tenue">
            {/* Pegajoso: con 200 filas, perder de vista qué columna es qué
                obliga a subir a mirar. bg-fondo para que las filas no se
                transparenten debajo al pasar. */}
            <th scope="col" className="sticky top-0 z-10 w-36 border-b border-borde bg-fondo py-2.5 pr-3 font-medium">Respuesta</th>
            <th scope="col" className="sticky top-0 z-10 border-b border-borde bg-fondo py-2.5 pr-3 font-medium">Sede</th>
            <th scope="col" className="sticky top-0 z-10 hidden border-b border-borde bg-fondo py-2.5 pr-3 font-medium md:table-cell">Motivo</th>
            <th scope="col" className="sticky top-0 z-10 hidden w-72 border-b border-borde bg-fondo py-2.5 pr-3 font-medium lg:table-cell">Caso</th>
            <th scope="col" className="sticky top-0 z-10 hidden w-24 border-b border-borde bg-fondo py-2.5 pr-3 font-medium sm:table-cell">Hora</th>
            <th scope="col" className="sticky top-0 z-10 w-16 border-b border-borde bg-fondo py-2.5 text-right font-medium">Lat.</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((h) => {
            const marca = MARCA[h.estado] ?? MARCA.timeout;
            const c = caso?.(h.casoId);

            return (
              <tr
                key={h.id}
                tabIndex={0}
                className="group relative border-b border-borde
                           hover:bg-superficie-alta/50
                           focus-visible:outline-none
                           focus-visible:bg-superficie-alta/50"
              >
                <td className="py-2.5 pr-3 whitespace-nowrap" style={{ color: marca.color }}>
                  <span aria-hidden className="mr-1.5 font-bold">{marca.icono}</span>
                  {marca.texto}

                  {/* El panel de detalle vive DENTRO de una celda normal y se
                      ancla al tr (relative): un td absoluto participa del
                      cálculo de columnas y hace saltar la tabla en cada hover.
                      `pointer-events-none` para que no intercepte el mouse:
                      es informativo, no interactivo, y si capturara hover
                      taparía las filas de abajo. */}
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute left-0 right-0 top-full z-20
                               hidden text-texto
                               group-hover:block group-focus-within:block"
                  >
                    <div
                      className="mt-1 rounded-md border border-borde
                                 bg-superficie-alta p-4
                                 shadow-xl shadow-black/50"
                    >
                      <p className="text-sm font-semibold">
                        {nombreSede(h.sedeCodigo) ?? h.sedeCodigo}
                        <span className="ml-2 font-normal text-texto-tenue">
                          {h.sedeCodigo}
                        </span>
                      </p>

                      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:grid-cols-4">
                        <Dato etiqueta="Decisión" valor={marca.texto} color={marca.color} />
                        <Dato etiqueta="Motivo" valor={h.motivoRechazo ?? "—"} ancho />
                        <Dato etiqueta="Canal" valor={CANAL[h.canal] ?? h.canal} />
                        <Dato etiqueta="Enviado" valor={hora(h.enviadoEn)} />
                        <Dato etiqueta="Respondido" valor={hora(h.respondidoEn)} />
                        <Dato
                          etiqueta="Latencia"
                          valor={h.latenciaS !== null ? `${h.latenciaS} s` : "Sin respuesta"}
                        />
                        {c && (
                          <>
                            <Dato etiqueta="Caso" valor={c.dxDescripcion} ancho />
                            <Dato etiqueta="Triage" valor={ETIQUETA_TRIAGE[c.triage]} />
                          </>
                        )}
                      </dl>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 pr-3">
                  <p className="truncate font-medium">
                    {nombreSede(h.sedeCodigo) ?? h.sedeCodigo}
                  </p>
                </td>
                <td className="hidden py-2.5 pr-3 text-texto-tenue md:table-cell">
                  <p className="truncate">{h.motivoRechazo ?? "—"}</p>
                </td>
                <td className="hidden py-2.5 pr-3 text-texto-tenue lg:table-cell">
                  <p className="truncate">
                    {c
                      ? `${c.dxDescripcion} · ${ETIQUETA_TRIAGE[c.triage]}`
                      : "—"}
                  </p>
                </td>
                <td className="hidden py-2.5 pr-3 tabular text-texto-tenue sm:table-cell">
                  {hora(h.respondidoEn ?? h.enviadoEn)}
                </td>
                {/* Sin respuesta no tiene latencia que mostrar: un guion dice
                    eso mejor que un cero, que se leería como "instantáneo". */}
                <td className="py-2.5 text-right tabular text-texto-tenue">
                  {h.latenciaS !== null ? `${h.latenciaS}s` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {visibles.length === 0 && (
        <p className="rounded-md border border-dashed border-borde p-8 text-center text-sm text-texto-tenue">
          Ninguna respuesta coincide con el filtro. El registro completo sigue
          aquí: cambia el filtro o borra la búsqueda.
        </p>
      )}
    </section>
  );
}

function Dato({
  etiqueta,
  valor,
  color,
  ancho,
}: {
  etiqueta: string;
  valor: string;
  color?: string;
  /** Motivo y diagnóstico pueden ser largos: dos columnas y que envuelvan. */
  ancho?: boolean;
}) {
  return (
    <div className={`min-w-0 ${ancho ? "col-span-2" : ""}`}>
      <dt className="text-[10px] uppercase tracking-wide text-texto-tenue">
        {etiqueta}
      </dt>
      <dd className="break-words" style={color ? { color } : undefined}>
        {valor}
      </dd>
    </div>
  );
}
