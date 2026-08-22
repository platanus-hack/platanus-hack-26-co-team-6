"use client";

/**
 * /crue — consola de regulación del CRUE.
 *
 * PULSO propone; el CRUE regula (Res. 1220/2010). Esta pantalla es la sala
 * de control del regulador de turno: KPIs de la red, cola de casos priorizada
 * con estados derivados, panel de detalle con la extracción de la IA contra
 * el dictado crudo, mapa de red y congestión inferida.
 *
 * F1 (actual): solo lectura — todo se deriva de GET /estado + re-match.
 * F2 agrega las acciones del regulador (forzar, siguiente, ampliar perímetro).
 *
 * Dueño de la capa de datos: Zaid. La consola no inventa números: congestión
 * siempre rotulada "estimada"; estados escalado/vencido son derivación del
 * front (ver components/crue/derivados.ts) hasta que core los produzca.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Geist, Geist_Mono } from "next/font/google";
import { AnimatePresence } from "motion/react";
import type { Caso, CongestionSede, Handshake } from "@/lib/types";
import { ETIQUETA_TRIAGE } from "@/lib/presentacion";
import * as api from "@/lib/api";
import { LogoPulso } from "@/components/LogoPulso";
import PanelCaso from "@/components/crue/PanelCaso";
import {
  calcularKpis,
  derivarCasos,
  ETIQUETA_ESTADO,
  formatoCrono,
  ordenarCola,
  type CasoDerivado,
  type EstadoCaso,
} from "@/components/crue/derivados";

const geist = Geist({ subsets: ["latin"] });
const geistMono = Geist_Mono({ subsets: ["latin"] });

// mapbox-gl toca window al importarse: solo en el navegador.
const MapaRed = dynamic(() => import("@/components/crue/MapaRed"), {
  ssr: false,
  loading: () => (
    <div className="h-[380px] rounded-[2rem] bg-[color:var(--color-superficie)] border border-[color:var(--color-borde)] latido" />
  ),
});

const PUNTO_ESTADO: Record<EstadoCaso, string> = {
  buscando: "var(--color-info)",
  esperando: "var(--color-alerta)",
  aceptado: "var(--color-estable)",
  escalado: "var(--color-critico)",
};

type FiltroKpi = "activos" | "esperando" | "escalados" | null;

export default function Crue() {
  const [casos, setCasos] = useState<Caso[]>([]);
  const [handshakes, setHandshakes] = useState<Handshake[]>([]);
  const [congestion, setCongestion] = useState<CongestionSede[]>([]);

  // Reloj de consola: un solo tick de 1s alimenta todos los cronómetros.
  // Arranca en null para que el HTML del servidor y el primer render
  // del cliente coincidan (nada dinámico hasta montar).
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Última señal buena de core, para el semáforo de la barra superior.
  const ultimaSenalRef = useRef<number | null>(null);

  useEffect(() => {
    // Tablero de sala: si core parpadea, el siguiente tick lo recupera solo.
    const cargar = async () => {
      const d = await api.estado().catch(() => null);
      if (!d) return;
      ultimaSenalRef.current = Date.now();
      setCasos(d.casos);
      setHandshakes(d.handshakes);
      setCongestion([...d.congestion].sort((a, b) => b.indice - a.indice));
    };
    cargar();
    const id = setInterval(cargar, 2500);
    return () => clearInterval(id);
  }, []);

  // Identidad del regulador de turno. Sin auth (demo): se declara y persiste
  // localmente — es quien firma los overrides en F2.
  const [regulador, setRegulador] = useState("");
  useEffect(() => {
    try {
      setRegulador(localStorage.getItem("crue-regulador") ?? "");
    } catch {}
  }, []);
  const cambiarRegulador = (v: string) => {
    setRegulador(v);
    try {
      localStorage.setItem("crue-regulador", v);
    } catch {}
  };

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroKpi>(null);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);

  // ── Derivación (pura, cada tick) ───────────────────────────────
  const derivados = useMemo(
    () => derivarCasos(casos, handshakes, ahora ?? 0),
    [casos, handshakes, ahora],
  );
  const kpis = useMemo(
    () => calcularKpis(derivados, congestion),
    [derivados, congestion],
  );
  const nombresSedes = useMemo(
    () => new Map(congestion.map((s) => [s.codigo, s.nombre])),
    [congestion],
  );

  const cola = useMemo(() => {
    let lista = ordenarCola(derivados);
    if (filtro === "activos") lista = lista.filter((d) => d.estado !== "aceptado");
    if (filtro === "esperando") lista = lista.filter((d) => d.estado === "esperando");
    if (filtro === "escalados") lista = lista.filter((d) => d.estado === "escalado");
    const q = busqueda.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (d) =>
          d.caso.id.toLowerCase().includes(q) ||
          d.caso.resumen.toLowerCase().includes(q) ||
          d.caso.dxDescripcion.toLowerCase().includes(q),
      );
    }
    return lista;
  }, [derivados, filtro, busqueda]);

  const seleccionado = derivados.find((d) => d.caso.id === seleccionadoId) ?? null;

  const sinSenal =
    ahora !== null &&
    (ultimaSenalRef.current === null || ahora - ultimaSenalRef.current > 7000);

  return (
    <main className={`min-h-screen max-w-7xl mx-auto p-4 pb-16 ${geist.className}`}>
      {/* ── Barra superior ── */}
      <header className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <LogoPulso className="w-6 h-6 text-[color:var(--color-marca)]" decorativo />
          <span className="font-bold text-lg">PULSO</span>
          <span className="text-xs text-[color:var(--color-texto-tenue)]">
            CRUE · regulación · Bogotá D.C.
          </span>
        </div>

        <span
          className={`px-3 py-1 rounded-full text-[11px] border ${
            sinSenal
              ? "border-[color:var(--color-critico)]/60 text-[color:var(--color-critico)] latido"
              : "border-[color:var(--color-borde)] text-[color:var(--color-texto-tenue)]"
          }`}
        >
          {sinSenal ? "● core sin señal" : "● red en vivo"}
        </span>

        <div className="ml-auto flex items-center gap-3 flex-wrap">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar caso, dx…"
            className="px-4 py-2 rounded-full bg-[color:var(--color-superficie)] border border-[color:var(--color-borde)] text-sm w-44 focus:outline-none focus:border-[color:var(--color-info)]"
            aria-label="Búsqueda global"
          />
          <input
            value={regulador}
            onChange={(e) => cambiarRegulador(e.target.value)}
            placeholder="Regulador de turno"
            className="px-4 py-2 rounded-full bg-[color:var(--color-superficie)] border border-[color:var(--color-borde)] text-sm w-40 focus:outline-none focus:border-[color:var(--color-info)]"
            aria-label="Nombre del regulador de turno"
          />
          <span className={`text-xl font-bold tabular ${geistMono.className}`}>
            {ahora
              ? new Date(ahora).toLocaleTimeString("es-CO", { hour12: false })
              : "--:--:--"}
          </span>
        </div>
      </header>

      {/* ── KPIs ── */}
      <section
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5"
        aria-label="Indicadores de la red"
      >
        <Kpi
          etiqueta="casos activos"
          valor={kpis.activos}
          activo={filtro === "activos"}
          onClick={() => setFiltro(filtro === "activos" ? null : "activos")}
        />
        <Kpi
          etiqueta="esperando confirmación"
          valor={kpis.esperando}
          activo={filtro === "esperando"}
          onClick={() => setFiltro(filtro === "esperando" ? null : "esperando")}
        />
        <Kpi
          etiqueta="requieren regulación"
          valor={kpis.escalados}
          alerta={kpis.escalados > 0}
          activo={filtro === "escalados"}
          onClick={() => setFiltro(filtro === "escalados" ? null : "escalados")}
        />
        <Kpi
          etiqueta="mediana coordinación"
          valor={kpis.tMedioS === null ? "—" : formatoCrono(kpis.tMedioS)}
        />
        <Kpi
          etiqueta="tasa de aceptación"
          valor={
            kpis.tasaAceptacion === null
              ? "—"
              : `${Math.round(kpis.tasaAceptacion * 100)}%`
          }
        />
        <Kpi
          etiqueta="sedes saturadas"
          valor={kpis.saturadas}
          alerta={kpis.saturadas > 0}
        />
      </section>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* ── Cola de casos ── */}
        <section className="lg:col-span-2" aria-label="Cola de casos">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
              Cola de casos ({cola.length})
            </h2>
            {filtro && (
              <button
                onClick={() => setFiltro(null)}
                className="text-[11px] underline text-[color:var(--color-info)]"
                style={{ minHeight: 0 }}
              >
                quitar filtro
              </button>
            )}
          </div>

          {cola.length === 0 && (
            <p className="text-sm text-[color:var(--color-texto-tenue)] p-4 rounded-2xl border border-[color:var(--color-borde)]">
              {casos.length === 0
                ? "Sin casos en la red. Despacha uno desde /campo."
                : "Nada coincide con el filtro."}
            </p>
          )}

          <div className="space-y-2">
            {cola.map((d) => (
              <FilaCaso
                key={d.caso.id}
                d={d}
                nombresSedes={nombresSedes}
                seleccionado={seleccionadoId === d.caso.id}
                onVer={() => setSeleccionadoId(d.caso.id)}
                monoClase={geistMono.className}
              />
            ))}
          </div>
        </section>

        {/* ── Mapa + congestión ── */}
        <div className="lg:col-span-3 space-y-6">
          <section aria-label="Mapa de la red">
            <MapaRed congestion={congestion} casos={casos} handshakes={handshakes} />
          </section>

          <section aria-label="Congestión de la red">
            <h2 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)] mb-2">
              Congestión de la red · estimada
            </h2>
            <p className="text-[11px] text-[color:var(--color-texto-tenue)] mb-3 leading-relaxed">
              Ninguna IPS reportó estos números. Salen del snapshot estructural
              del REPS, la curva horaria de demanda, y sobre todo de los
              rechazos registrados: cada rechazo es una observación etiquetada.
            </p>
            <table className="w-full text-xs">
              <thead className="text-[color:var(--color-texto-tenue)]">
                <tr className="text-left">
                  <th className="pb-2 font-normal">Sede</th>
                  <th className="pb-2 font-normal w-32">Índice</th>
                  <th className="pb-2 font-normal w-16 text-right">✅ / ⛔</th>
                </tr>
              </thead>
              <tbody>
                {congestion.slice(0, 14).map((s) => (
                  <tr key={s.codigo} className="border-t border-[color:var(--color-borde)]">
                    <td className="py-2 pr-2 truncate max-w-[220px]">{s.nombre}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-[color:var(--color-borde)] overflow-hidden">
                          <div
                            className="h-full"
                            style={{
                              width: `${s.indice * 100}%`,
                              background:
                                s.indice > 0.85
                                  ? "var(--color-critico)"
                                  : s.indice > 0.7
                                    ? "var(--color-alerta)"
                                    : "var(--color-estable)",
                            }}
                          />
                        </div>
                        <span className="tabular w-8 text-right">
                          {Math.round(s.indice * 100)}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 text-right tabular text-[color:var(--color-texto-tenue)]">
                      {s.aceptados}/{s.rechazados}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>

      {/* ── Panel de detalle ── */}
      <AnimatePresence>
        {seleccionado && ahora !== null && (
          <PanelCaso
            key={seleccionado.caso.id}
            derivado={seleccionado}
            nombresSedes={nombresSedes}
            ahoraMs={ahora}
            onCerrar={() => setSeleccionadoId(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────

function Kpi({
  etiqueta,
  valor,
  alerta = false,
  activo = false,
  onClick,
}: {
  etiqueta: string;
  valor: number | string;
  alerta?: boolean;
  activo?: boolean;
  onClick?: () => void;
}) {
  const clases = `p-3 rounded-2xl border text-left w-full ${
    activo
      ? "border-[color:var(--color-info)] bg-[color:var(--color-superficie-alta)]"
      : alerta
        ? "border-[color:var(--color-critico)]/60 bg-[color:var(--color-critico)]/10"
        : "border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]"
  }`;
  const contenido = (
    <>
      <div
        className={`text-2xl font-bold tabular ${
          alerta ? "text-[color:var(--color-critico)]" : ""
        }`}
      >
        {valor}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-[color:var(--color-texto-tenue)] leading-tight">
        {etiqueta}
      </div>
    </>
  );
  // Solo los KPIs que filtran son botones; los informativos no fingen serlo.
  return onClick ? (
    <button onClick={onClick} className={clases}>
      {contenido}
    </button>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}

function FilaCaso({
  d,
  nombresSedes,
  seleccionado,
  onVer,
  monoClase,
}: {
  d: CasoDerivado;
  nombresSedes: ReadonlyMap<string, string>;
  seleccionado: boolean;
  onVer: () => void;
  monoClase: string;
}) {
  const escalado = d.estado === "escalado";
  return (
    <button
      onClick={onVer}
      className={`w-full text-left p-3 rounded-2xl border transition-colors ${
        seleccionado
          ? "border-[color:var(--color-info)] bg-[color:var(--color-superficie-alta)]"
          : escalado
            ? "border-[color:var(--color-critico)]/60 bg-[color:var(--color-critico)]/10"
            : "border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]"
      }`}
      style={escalado ? { borderLeftWidth: 3 } : undefined}
    >
      <div className="flex items-center gap-2 text-xs mb-1">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: PUNTO_ESTADO[d.estado] }}
        />
        <span className="text-[color:var(--color-texto-tenue)]">
          {ETIQUETA_ESTADO[d.estado]}
        </span>
        {d.rechazos > 0 && (
          <span className="px-1.5 rounded bg-[color:var(--color-alerta)]/20 text-[color:var(--color-alerta)]">
            {d.rechazos} rechazo{d.rechazos > 1 ? "s" : ""}
          </span>
        )}
        <span className={`ml-auto font-bold text-sm tabular ${monoClase}`}>
          {formatoCrono(d.transcurridoS)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold shrink-0">
          {ETIQUETA_TRIAGE[d.caso.triage]}
        </span>
        <span className="text-sm truncate flex-1">{d.caso.resumen}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-[color:var(--color-texto-tenue)]">
        <span className="tabular">{d.caso.id.slice(0, 8)}</span>
        <span>{d.caso.tipoMovil}</span>
        <span className="truncate ml-auto">
          {d.destinoCodigo
            ? `→ ${nombresSedes.get(d.destinoCodigo) ?? d.destinoCodigo}`
            : "SIN DESTINO"}
        </span>
      </div>
    </button>
  );
}
