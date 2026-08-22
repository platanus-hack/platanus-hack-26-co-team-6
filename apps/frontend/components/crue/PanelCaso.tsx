"use client";

/**
 * PanelCaso — el detalle donde el regulador lee un caso completo.
 *
 * F1: solo lectura. Muestra lo que core sabe (encabezado, extracción clínica
 * con su confianza, dictado original, ranking re-puntuado, handshakes y línea
 * de tiempo). Las acciones del regulador (forzar, siguiente, ampliar) llegan
 * en F2 sobre este mismo panel.
 *
 * El ranking sale de re-ejecutar POST /match con el caso: es scoring puro,
 * idempotente, y es la única forma de ver candidatos de un caso ya creado
 * (core no los guarda). Si /match trae compatibles=0, este panel muestra el
 * escalamiento — el invariante del conjunto vacío, no una lista vacía muda.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Candidato } from "@/lib/types";
import { nombresServicios, ETIQUETA_TRIAGE } from "@/lib/presentacion";
import * as api from "@/lib/api";
import {
  type CasoDerivado,
  ETIQUETA_ESTADO,
  formatoCrono,
  TIMEOUT_HANDSHAKE_S,
} from "./derivados";
import {
  listarEventos,
  registrarEvento,
  type EventoBitacora,
} from "./bitacora";

const SUAVE = [0.22, 1, 0.36, 1] as const;

const COLOR_ESTADO: Record<CasoDerivado["estado"], string> = {
  buscando: "var(--color-info)",
  esperando: "var(--color-alerta)",
  aceptado: "var(--color-estable)",
  escalado: "var(--color-critico)",
};

interface Props {
  derivado: CasoDerivado;
  /** codigo → nombre, para pintar sedes que solo conocemos por handshake. */
  nombresSedes: ReadonlyMap<string, string>;
  ahoraMs: number;
  /** Quien firma los overrides. Vacío = no puede forzar. */
  regulador: string;
  onCerrar: () => void;
}

export default function PanelCaso({
  derivado,
  nombresSedes,
  ahoraMs,
  regulador,
  onCerrar,
}: Props) {
  const { caso, estado, vivo, handshakes, motivoEscalamiento } = derivado;

  // ── Ranking re-puntuado (solo cambia al cambiar de caso) ───────
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [compatibles, setCompatibles] = useState<number | null>(null);
  const [errorRanking, setErrorRanking] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setCandidatos(null);
    setCompatibles(null);
    setErrorRanking(null);
    api
      .match({ caso, limite: 5 })
      .then((m) => {
        if (!vigente) return;
        setCandidatos(m.candidatos);
        setCompatibles(m.compatibles);
      })
      .catch((e) => {
        if (vigente)
          setErrorRanking(e instanceof Error ? e.message : "core no respondió");
      });
    return () => {
      vigente = false;
    };
    // El caso completo no cambia tras crearse; su id basta como dependencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caso.id]);

  const [verDictado, setVerDictado] = useState(false);
  const [porQue, setPorQue] = useState<string | null>(null);

  const nombreSede = (codigo: string) =>
    nombresSedes.get(codigo) ??
    candidatos?.find((c) => c.sede.codigo === codigo)?.sede.nombre ??
    codigo;

  // ── Línea de tiempo derivada ───────────────────────────────────
  const eventos = useMemo(() => {
    const linea: { en: string; texto: string; critico: boolean }[] = [
      { en: caso.creadoEn, texto: "Caso creado desde dictado", critico: false },
    ];
    for (const h of handshakes) {
      linea.push({
        en: h.enviadoEn,
        texto: `Solicitud enviada a ${nombreSede(h.sedeCodigo)} (${h.canal})`,
        critico: false,
      });
      if (h.respondidoEn) {
        linea.push({
          en: h.respondidoEn,
          texto:
            h.estado === "aceptado"
              ? `${nombreSede(h.sedeCodigo)} aceptó en ${h.latenciaS}s`
              : `${nombreSede(h.sedeCodigo)} rechazó: ${h.motivoRechazo ?? "sin motivo"}`,
          critico: h.estado !== "aceptado",
        });
      }
    }
    if (motivoEscalamiento) {
      linea.push({
        en: new Date(ahoraMs).toISOString(),
        texto: `Escalado a regulación: ${motivoEscalamiento}`,
        critico: true,
      });
    }
    return linea.sort((a, b) => a.en.localeCompare(b.en));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handshakes, caso.creadoEn, motivoEscalamiento, candidatos]);

  const restanteVivo = vivo
    ? Math.max(0, TIMEOUT_HANDSHAKE_S - (ahoraMs - Date.parse(vivo.enviadoEn)) / 1000)
    : null;

  return (
    <motion.aside
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ duration: 0.45, ease: SUAVE }}
      className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto
                 bg-[color:var(--color-superficie)] border-l border-[color:var(--color-borde)]
                 p-5 space-y-5"
      aria-label={`Detalle del caso ${caso.id.slice(0, 8)}`}
    >
      {/* ── Encabezado ── */}
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[color:var(--color-texto-tenue)] tabular">
            {caso.id.slice(0, 8)}
          </span>
          <button
            onClick={onCerrar}
            className="px-4 rounded-full border border-[color:var(--color-borde)] text-sm"
          >
            Cerrar
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: COLOR_ESTADO[estado], color: "#04121f" }}
          >
            {ETIQUETA_ESTADO[estado]}
          </span>
          <span className="px-3 py-1 rounded-full text-xs border border-[color:var(--color-borde)]">
            Triage {ETIQUETA_TRIAGE[caso.triage]}
          </span>
          <span className="px-3 py-1 rounded-full text-xs border border-[color:var(--color-borde)]">
            {caso.tipoMovil}
          </span>
          <span className="ml-auto text-2xl font-bold tabular">
            {formatoCrono(derivado.transcurridoS)}
          </span>
        </div>
        {motivoEscalamiento && (
          <p className="text-xs text-[color:var(--color-critico)] font-medium">
            ⚠ {motivoEscalamiento}
          </p>
        )}
      </header>

      {/* ── Extracción clínica + anti-alucinación ── */}
      <section className="p-4 rounded-2xl bg-[color:var(--color-superficie-alta)] border border-[color:var(--color-borde)] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
            Extracción de la IA
          </h3>
          <span
            className={`text-xs tabular ${
              caso.confianza < 0.5
                ? "text-[color:var(--color-critico)] font-bold"
                : "text-[color:var(--color-texto-tenue)]"
            }`}
          >
            confianza {(caso.confianza * 100).toFixed(0)}%
          </span>
        </div>
        {caso.confianza < 0.5 && (
          <p className="text-xs p-2 rounded-lg bg-[color:var(--color-critico)]/15 border border-[color:var(--color-critico)]/40">
            Confianza baja: la extracción es una suposición. Contrasta con el
            dictado original antes de decidir.
          </p>
        )}
        <p className="text-sm">{caso.resumen}</p>
        <dl className="text-xs space-y-1 text-[color:var(--color-texto-tenue)]">
          <div>
            <span className="font-semibold text-[color:var(--color-texto)]">Dx:</span>{" "}
            {caso.dxDescripcion}
            {caso.dxCie10 && ` (${caso.dxCie10})`}
          </div>
          <div>
            <span className="font-semibold text-[color:var(--color-texto)]">
              Requiere:
            </span>{" "}
            {nombresServicios(caso.serviciosRequeridos)} · complejidad{" "}
            {caso.complejidadRequerida}
          </div>
          {caso.signosAlarma.length > 0 && (
            <div>
              <span className="font-semibold text-[color:var(--color-texto)]">
                Alarma:
              </span>{" "}
              {caso.signosAlarma.join(" · ")}
            </div>
          )}
          <div>
            {caso.edad !== null && `${caso.edad} años · `}
            {caso.sexo !== "desconocido" && `${caso.sexo} · `}
            {caso.requiereMedicoABordo ? "requiere médico a bordo" : "sin médico a bordo"}
          </div>
        </dl>
        <button
          onClick={() => setVerDictado(true)}
          className="w-full rounded-full border border-[color:var(--color-borde)] text-sm font-medium"
        >
          Ver dictado original
        </button>
      </section>

      {/* ── Ranking / conjunto vacío ── */}
      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
          Candidatos (re-puntuados ahora)
        </h3>

        {errorRanking && (
          <p className="text-xs text-[color:var(--color-alerta)]">
            No se pudo re-puntuar: {errorRanking}
          </p>
        )}
        {!candidatos && !errorRanking && (
          <div className="h-20 rounded-2xl bg-[color:var(--color-superficie-alta)] latido" />
        )}

        {compatibles === 0 && (
          <div className="p-4 rounded-2xl border border-[color:var(--color-critico)]/60 bg-[color:var(--color-critico)]/10 space-y-1">
            <p className="font-semibold text-sm">
              Ningún prestador <em className="italic">elegible</em> en el radio
            </p>
            <p className="text-xs text-[color:var(--color-texto-tenue)]">
              El caso queda escalado a regulación. Salidas: ampliar el
              perímetro de búsqueda o forzar asignación (disponibles en la
              siguiente fase de esta consola).
            </p>
          </div>
        )}

        {candidatos?.map((c) => {
          const descartada = c.motivoDescarte !== null;
          const abierto = porQue === c.sede.codigo;
          return (
            <article
              key={c.sede.codigo}
              className={`p-3 rounded-2xl border text-sm ${
                descartada
                  ? "border-[color:var(--color-borde)] opacity-60"
                  : "border-[color:var(--color-borde)] bg-[color:var(--color-superficie-alta)]"
              }`}
            >
              <div className="flex items-center gap-2">
                {!descartada && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-[color:var(--color-info)] text-[#04121f]">
                    #{c.rank}
                  </span>
                )}
                <span className="font-medium truncate flex-1">{c.sede.nombre}</span>
                <span className="tabular font-bold">{Math.round(c.etaMin)}′</span>
              </div>
              {descartada ? (
                <p className="mt-1 text-xs text-[color:var(--color-alerta)]">
                  ⛔ {c.motivoDescarte}
                </p>
              ) : (
                <>
                  <div className="mt-1 flex gap-3 text-[11px] text-[color:var(--color-texto-tenue)] tabular">
                    <span>{c.distKm} km</span>
                    <span>{Math.round(c.pAceptacion * 100)}% acepta</span>
                    <span>congestión est. {Math.round(c.congestion * 100)}%</span>
                    <button
                      onClick={() => setPorQue(abierto ? null : c.sede.codigo)}
                      className="ml-auto underline min-h-0 text-[color:var(--color-info)]"
                      style={{ minHeight: 0 }}
                    >
                      ¿Por qué?
                    </button>
                  </div>
                  {abierto && (
                    <dl className="mt-2 pt-2 border-t border-[color:var(--color-borde)] text-[11px] tabular grid grid-cols-2 gap-x-4 gap-y-0.5 text-[color:var(--color-texto-tenue)]">
                      <dt>ruta con tráfico</dt>
                      <dd className="text-right">{Math.round(c.desglose.ruta)}′</dd>
                      <dt>riesgo de rechazo</dt>
                      <dd className="text-right">+{Math.round(c.desglose.riesgoRechazo)}′</dd>
                      <dt>espera en puerta</dt>
                      <dd className="text-right">+{Math.round(c.desglose.espera)}′</dd>
                      <dt>bono por camas</dt>
                      <dd className="text-right">−{Math.round(Math.abs(c.desglose.bono))}′</dd>
                      <dt className="font-semibold text-[color:var(--color-texto)]">
                        costo total
                      </dt>
                      <dd className="text-right font-semibold text-[color:var(--color-texto)]">
                        {Math.round(c.score)}′
                      </dd>
                    </dl>
                  )}
                </>
              )}
            </article>
          );
        })}
      </section>

      {/* ── Handshakes ── */}
      {handshakes.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
            Solicitudes
          </h3>
          {handshakes.map((h) => (
            <div
              key={h.id}
              className="p-3 rounded-2xl border border-[color:var(--color-borde)] text-xs space-y-1"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium truncate flex-1">
                  {nombreSede(h.sedeCodigo)}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full font-semibold"
                  style={{
                    background:
                      h.estado === "aceptado"
                        ? "var(--color-estable)"
                        : h.estado === "enviado"
                          ? "var(--color-alerta)"
                          : "var(--color-critico)",
                    color: "#04121f",
                  }}
                >
                  {h.estado}
                </span>
              </div>
              {h.estado === "enviado" && restanteVivo !== null && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-[color:var(--color-borde)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(restanteVivo / TIMEOUT_HANDSHAKE_S) * 100}%`,
                        background:
                          restanteVivo < 15
                            ? "var(--color-critico)"
                            : "var(--color-alerta)",
                      }}
                    />
                  </div>
                  <span className="tabular">
                    {Math.ceil(restanteVivo)}s para vencer
                  </span>
                </div>
              )}
              {h.motivoRechazo && (
                <p className="text-[color:var(--color-alerta)]">⛔ {h.motivoRechazo}</p>
              )}
              {h.latenciaS !== null && <p>respondió en {h.latenciaS}s</p>}
            </div>
          ))}
        </section>
      )}

      {/* ── Línea de tiempo ── */}
      <section className="space-y-2 pb-6">
        <h3 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
          Línea de tiempo
        </h3>
        <ol className="space-y-1.5">
          {eventos.map((e, i) => (
            <li key={i} className="flex gap-2 text-xs items-baseline">
              <span className="tabular text-[color:var(--color-texto-tenue)] shrink-0">
                {new Date(e.en).toLocaleTimeString("es-CO", { hour12: false })}
              </span>
              <span
                className={
                  e.critico ? "text-[color:var(--color-critico)]" : undefined
                }
              >
                {e.texto}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Pop-up: dictado original vs. extracción ── */}
      <AnimatePresence>
        {verDictado && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setVerDictado(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 12 }}
              transition={{ duration: 0.3, ease: SUAVE }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-[2rem] bg-[color:var(--color-superficie)] border border-[color:var(--color-borde)] p-5 space-y-4"
              role="dialog"
              aria-label="Dictado original contra extracción"
            >
              <h3 className="font-bold">Dictado original vs. extracción</h3>
              <div className="space-y-3">
                <div className="p-3 rounded-2xl bg-[color:var(--color-superficie-alta)] border border-[color:var(--color-borde)]">
                  <p className="text-[10px] uppercase tracking-wide text-[color:var(--color-texto-tenue)] mb-1">
                    Lo que dijo el paramédico (crudo, para auditoría)
                  </p>
                  <p className="text-sm leading-relaxed">{caso.textoCrudo}</p>
                </div>
                <div className="p-3 rounded-2xl border border-[color:var(--color-info)]/40">
                  <p className="text-[10px] uppercase tracking-wide text-[color:var(--color-texto-tenue)] mb-1">
                    Lo que extrajo la IA · confianza {(caso.confianza * 100).toFixed(0)}%
                  </p>
                  <p className="text-sm mb-1">{caso.resumen}</p>
                  <p className="text-xs text-[color:var(--color-texto-tenue)]">
                    {caso.dxDescripcion}
                    {caso.dxCie10 && ` (${caso.dxCie10})`} ·{" "}
                    {nombresServicios(caso.serviciosRequeridos)}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-[color:var(--color-texto-tenue)]">
                La IA propone; el sistema audita. Los servicios exigidos salen
                de la tabla de reglas de core, no del modelo.
              </p>
              <button
                onClick={() => setVerDictado(false)}
                className="w-full rounded-full border border-[color:var(--color-borde)] font-medium"
              >
                Cerrar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
