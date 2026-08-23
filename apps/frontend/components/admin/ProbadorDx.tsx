"use client";

/**
 * El probador del mapa Dx→servicios. §7.2: **el LLM propone, la tabla decide.**
 *
 * Se teclea un CIE-10 y se ve qué exigiría PULSO — o se ve el hueco. Existe
 * porque una tabla de traducción que no se puede probar es una tabla que nadie
 * revisa: el error no aparece al editarla, aparece meses después en un caso
 * que escaló sin que nadie entendiera por qué.
 *
 * Resuelve **en el navegador**, con `resolverDx()` del modelo y las entradas
 * ya cargadas: contesta mientras se teclea, sin una petición por pulsación, y
 * con el mismo algoritmo que corre en core.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import {
  decidirServicios,
  resolverDx,
  type VersionEntrada,
} from "@/lib/catalogos-modelo";
import { nombreServicio } from "@/lib/presentacion";

export function ProbadorDx({ mapa }: { mapa: VersionEntrada[] }) {
  const [dx, setDx] = useState("");
  const [propuesto, setPropuesto] = useState("");

  const numeros = useMemo(
    () =>
      propuesto
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0),
    [propuesto],
  );

  const resolucion = useMemo(() => resolverDx(mapa, dx), [mapa, dx]);
  const decision = useMemo(
    () => decidirServicios(resolucion, numeros),
    [resolucion, numeros],
  );

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="probador-dx" className={etiquetaCampo}>
            Diagnóstico CIE-10
          </label>
          <input
            id="probador-dx"
            value={dx}
            onChange={(e) => setDx(e.target.value)}
            placeholder="I21.1"
            className="h-12 w-full rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-3.5 font-mono text-base outline-none placeholder:text-[color:var(--color-texto-tenue)]/50 focus:border-[color:var(--color-info)]"
          />
        </div>
        <div>
          <label htmlFor="probador-llm" className={etiquetaCampo}>
            Lo que propondría el LLM (opcional)
          </label>
          <input
            id="probador-llm"
            value={propuesto}
            onChange={(e) => setPropuesto(e.target.value)}
            placeholder="743, 110"
            className="h-12 w-full rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-3.5 font-mono text-base outline-none placeholder:text-[color:var(--color-texto-tenue)]/50 focus:border-[color:var(--color-info)]"
          />
        </div>
      </div>

      {dx.trim() === "" ? (
        <p className="mt-4 text-xs text-[color:var(--color-texto-tenue)]">
          Escribe un diagnóstico para ver qué exige la tabla. La subcategoría cae en su
          categoría: <code>I21.9</code> lo resuelve la fila <code>I21</code>.
        </p>
      ) : decision.estado === "escala-a-criterio-humano" ? (
        <div className="mt-4 rounded-xl border border-[color:var(--color-critico)]/50 bg-[color:var(--color-critico)]/8 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--color-critico)]">
            <AlertTriangle className="size-4" aria-hidden />
            Escala a criterio humano
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--color-texto-tenue)]">
            {decision.mensaje}
          </p>
          {decision.propuestoPorLlm.length > 0 && (
            <p className="mt-3 border-t border-[color:var(--color-critico)]/20 pt-3 text-xs text-[color:var(--color-texto-tenue)]">
              El modelo habría propuesto{" "}
              <strong className="text-[color:var(--color-texto)]">
                {decision.propuestoPorLlm.map(nombreServicio).join(" + ")}
              </strong>
              . No se exige: una sugerencia no se convierte en filtro duro sin que nadie la
              firme. Si crees que debería, agrega la fila al mapa.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie-alta)] p-4">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-[color:var(--color-texto-tenue)]">
              {resolucion.estado === "mapeado" ? resolucion.dx : ""}
            </span>
            <ArrowRight className="size-3.5 text-[color:var(--color-texto-tenue)]" aria-hidden />
            <strong>{decision.serviciosRequeridos.map(nombreServicio).join(" + ")}</strong>
          </p>

          {resolucion.estado === "mapeado" && (
            <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
              <Dato termino="Fila que respondió">
                {resolucion.codigo}@{resolucion.version} · {resolucion.etiqueta}
                {!resolucion.exacto && " (por categoría)"}
              </Dato>
              <Dato termino="Complejidad mínima">{resolucion.complejidadMinima}</Dato>
              <Dato termino="Móvil">
                {resolucion.requiereMedicoABordo ? "TAM (médico a bordo)" : "TAB o TAM"}
              </Dato>
              <Dato termino="Protocolo">{resolucion.protocolo ?? "—"}</Dato>
            </dl>
          )}

          {(decision.propuestosNoExigidos.length > 0 ||
            decision.exigidosNoPropuestos.length > 0) && (
            <div className="mt-3 border-t border-[color:var(--color-borde)] pt-3 text-xs text-[color:var(--color-texto-tenue)]">
              {decision.propuestosNoExigidos.length > 0 && (
                <p>
                  El modelo propuso además{" "}
                  {decision.propuestosNoExigidos.map(nombreServicio).join(", ")} — la tabla
                  no lo exige. Se reporta, no se descarta en silencio.
                </p>
              )}
              {decision.exigidosNoPropuestos.length > 0 && (
                <p className="mt-1">
                  La tabla exige {decision.exigidosNoPropuestos.map(nombreServicio).join(", ")}{" "}
                  y el modelo no lo vio. Se exige igual.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Dato({ termino, children }: { termino: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[color:var(--color-texto-tenue)]">{termino}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

const etiquetaCampo =
  "mb-1.5 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-texto-tenue)]";
