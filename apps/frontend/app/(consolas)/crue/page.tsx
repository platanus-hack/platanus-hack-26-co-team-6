"use client";

/**
 * /crue — consola de regulación del CRUE.
 *
 * PULSO propone; el CRUE regula (Res. 1220/2010). Esta pantalla es la sala
 * de control del regulador de turno: KPIs de la red, cola de casos priorizada
 * con estados derivados, panel de detalle con la extracción de la IA contra
 * el dictado crudo, mapa de red y congestión inferida.
 *
 * Layout geovisor: el mapa es el lienzo a pantalla completa y todo lo demás
 * flota encima como cards glass plegables (pointer-events-none en la capa,
 * auto en cada card — el mapa se arrastra entre tarjetas).
 *
 * Dueño de la capa de datos: Zaid. La consola no inventa números: congestión
 * siempre rotulada "estimada"; estados escalado/vencido son derivación del
 * front (ver components/crue/derivados.ts) hasta que core los produzca.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Ban, Bell, Check } from "lucide-react";
import type { CasoPublico, CongestionSede, Coordenada, Handshake } from "@/lib/types";
import { ETIQUETA_TRIAGE } from "@/lib/presentacion";
import * as api from "@/lib/api";
import { LogoPulso } from "@/components/LogoPulso";
import PanelCaso from "@/components/crue/PanelCaso";
import FichaSede from "@/components/crue/FichaSede";
import Registro from "@/components/crue/Registro";
import VistaCalle from "@/components/mapa/VistaCalle";
import {
  derivarAlertas,
  leerReconocidas,
  reconocer,
  type Reconocimiento,
} from "@/components/crue/alertas";
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
    <div className="h-full w-full bg-[color:var(--color-superficie)] latido" />
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
  // CasoPublico, no Caso: /estado ya no manda el dictado crudo ni las
  // coordenadas del paciente. El tablero nunca los pintó.
  const [casos, setCasos] = useState<CasoPublico[]>([]);
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

  // Paneles flotantes plegables: el mapa es el protagonista y cada card
  // puede quitarse de encima con un toque (patrón geovisor).
  const [colaVisible, setColaVisible] = useState(true);
  const [redVisible, setRedVisible] = useState(true);

  // ── Bandeja de alertas + ficha de sede + foco del mapa ─────────
  const [bandejaAbierta, setBandejaAbierta] = useState(false);
  const [fichaSedeCodigo, setFichaSedeCodigo] = useState<string | null>(null);
  const [focoMapa, setFocoMapa] = useState<Coordenada | null>(null);
  // Click en un punto vacío del mapa → explorar cómo se ve a nivel de calle.
  const [lugarExplorado, setLugarExplorado] = useState<Coordenada | null>(null);
  const [reconocidas, setReconocidas] = useState<Record<string, Reconocimiento>>({});
  useEffect(() => setReconocidas(leerReconocidas()), []);

  // ── Modo contingencia (marco declarado, lógica masiva en roadmap) ──
  const [contingencia, setContingencia] = useState(false);
  const [confirmandoContingencia, setConfirmandoContingencia] = useState(false);
  useEffect(() => {
    try {
      setContingencia(localStorage.getItem("crue-contingencia") === "1");
    } catch {}
  }, []);
  function alternarContingencia(valor: boolean) {
    setContingencia(valor);
    setConfirmandoContingencia(false);
    try {
      localStorage.setItem("crue-contingencia", valor ? "1" : "0");
    } catch {}
  }

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

  const alertas = useMemo(
    () => derivarAlertas(derivados, congestion, sinSenal),
    [derivados, congestion, sinSenal],
  );
  const alertasPendientes = alertas.filter((a) => !reconocidas[a.clave]).length;

  const fichaSede = congestion.find((s) => s.codigo === fichaSedeCodigo) ?? null;

  /** Alerta → acción directa: abrir el caso o la sede que la disparó. */
  function atenderAlerta(casoId?: string, sedeCodigo?: string) {
    if (casoId) setSeleccionadoId(casoId);
    if (sedeCodigo) setFichaSedeCodigo(sedeCodigo);
    if (casoId || sedeCodigo) setBandejaAbierta(false);
  }

  return (
    <main
      className={`fixed inset-0 overflow-hidden bg-[color:var(--color-fondo)] ${geist.className}`}
    >
      {/* ── El lienzo: el mapa ES la pantalla ── */}
      <div className="absolute inset-0">
        <MapaRed
          congestion={congestion}
          casos={casos}
          handshakes={handshakes}
          onSede={setFichaSedeCodigo}
          onCaso={setSeleccionadoId}
          foco={focoMapa}
          onLugar={setLugarExplorado}
          lugar={lugarExplorado}
          pantallaCompleta
          margenes={{ top: 190, bottom: 120, left: 420, right: 400 }}
        />
      </div>

      {/* ── Capa de consola: cards glass flotando sobre el mapa.
           pointer-events-none en la capa, auto en cada card: el mapa se
           arrastra en todo el espacio entre tarjetas. ── */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col gap-3 p-3 sm:p-4">
      {/* ── Barra superior ── */}
      <header className="pointer-events-auto flex items-center gap-3 flex-wrap px-4 py-2 rounded-2xl bg-neutral-900/75 backdrop-blur-lg border border-[color:var(--color-borde)]">
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

        <button
          onClick={() =>
            contingencia ? alternarContingencia(false) : setConfirmandoContingencia(true)
          }
          className={`px-3 py-1 rounded-full text-[11px] border font-medium ${
            contingencia
              ? "bg-[color:var(--color-critico)] border-transparent text-white"
              : "border-[color:var(--color-alerta)]/50 text-[color:var(--color-alerta)]"
          }`}
          style={{ minHeight: 0 }}
        >
          {contingencia ? "⬤ CONTINGENCIA ACTIVA — desactivar" : "Contingencia…"}
        </button>

        <div className="ml-auto flex items-center gap-3 flex-wrap">
          {/*
            La cobertura de flota (3.7) se construyo sin poder tocar este
            archivo. Sin esta entrada la vista existe y no la alcanza nadie.
          */}
          <Link
            href="/crue/cobertura"
            className="px-4 py-2 rounded-full border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] text-sm"
          >
            Cobertura de flota
          </Link>
          <button
            onClick={() => setBandejaAbierta((v) => !v)}
            className={`relative px-4 py-2 rounded-full border text-sm ${
              bandejaAbierta
                ? "border-[color:var(--color-info)] bg-[color:var(--color-superficie-alta)]"
                : "border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]"
            }`}
            aria-label={`Alertas: ${alertasPendientes} sin atender`}
          >
            <Bell size={16} aria-hidden />
            {alertasPendientes > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[color:var(--color-critico)] text-white text-[11px] font-bold flex items-center justify-center tabular latido">
                {alertasPendientes}
              </span>
            )}
          </button>
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

      {contingencia && (
        <div
          role="status"
          className="pointer-events-auto self-center max-w-2xl px-4 py-2 rounded-2xl border border-[color:var(--color-critico)]/60 bg-neutral-900/80 backdrop-blur-lg text-sm flex items-baseline gap-2 flex-wrap"
        >
          <span className="font-bold text-[color:var(--color-critico)]">
            MODO CONTINGENCIA · Bogotá D.C.
          </span>
          <span className="text-xs text-[color:var(--color-texto-tenue)]">
            Marco declarado: la asignación masiva por zonas y la activación de
            CRED están en el roadmap. Las reglas de asignación NO cambian aún.
          </span>
        </div>
      )}

      {/* ── Bandeja de alertas ── */}
      <AnimatePresence>
        {bandejaAbierta && (
          <motion.aside
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto fixed right-4 top-20 z-40 w-[min(24rem,calc(100vw-2rem))] max-h-[60vh] overflow-y-auto rounded-[2rem] bg-neutral-900/85 backdrop-blur-xl border border-[color:var(--color-borde)] p-4 space-y-2 shadow-2xl"
            aria-label="Bandeja de alertas"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
                Alertas ({alertas.length})
              </h2>
              <button
                onClick={() => setBandejaAbierta(false)}
                className="text-[11px] underline text-[color:var(--color-info)]"
                style={{ minHeight: 0 }}
              >
                cerrar
              </button>
            </div>

            {alertas.length === 0 && (
              <p className="text-sm text-[color:var(--color-texto-tenue)] py-2">
                Nada exige tu decisión ahora.
              </p>
            )}

            {alertas.map((a) => {
              const atendida = reconocidas[a.clave];
              return (
                <div
                  key={a.clave}
                  className={`p-3 rounded-2xl border text-xs space-y-2 ${
                    a.tipo === "escalado"
                      ? "border-[color:var(--color-critico)]/60 bg-[color:var(--color-critico)]/10"
                      : a.tipo === "saturacion"
                        ? "border-[color:var(--color-alerta)]/60 bg-[color:var(--color-alerta)]/10"
                        : "border-[color:var(--color-borde)]"
                  } ${atendida ? "opacity-60" : ""}`}
                >
                  <p className="leading-relaxed">{a.texto}</p>
                  <div className="flex items-center gap-2">
                    {(a.casoId || a.sedeCodigo) && (
                      <button
                        onClick={() => atenderAlerta(a.casoId, a.sedeCodigo)}
                        className="px-3 py-1 rounded-full bg-[color:var(--color-info)] text-[#04121f] font-semibold"
                        style={{ minHeight: 0 }}
                      >
                        {a.casoId ? "Ir al caso" : "Ver sede"}
                      </button>
                    )}
                    {atendida ? (
                      <span className="ml-auto text-[color:var(--color-texto-tenue)]">
                        atendida por {atendida.por}
                      </span>
                    ) : (
                      <button
                        onClick={() =>
                          setReconocidas(reconocer(a.clave, regulador, alertas))
                        }
                        className="ml-auto px-3 py-1 rounded-full border border-[color:var(--color-borde)]"
                        style={{ minHeight: 0 }}
                      >
                        Asignar a mí
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── KPIs: barra segmentada, un solo vidrio ── */}
      <section
        className="pointer-events-auto self-start flex flex-wrap rounded-2xl bg-neutral-900/75 backdrop-blur-lg border border-[color:var(--color-borde)] divide-x divide-[color:var(--color-borde)] overflow-hidden"
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

      {/* ── Cuerpo: cola a la izquierda · red a la derecha, mapa en medio ── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row lg:justify-between gap-3 items-start lg:items-stretch overflow-y-auto lg:overflow-visible">
        {/* ── Cola de casos ── */}
        {colaVisible ? (
          <section
            aria-label="Cola de casos"
            className="pointer-events-auto w-full lg:w-[360px] max-h-[38vh] lg:max-h-none flex flex-col min-h-0 rounded-2xl bg-neutral-900/75 backdrop-blur-lg border border-[color:var(--color-borde)]"
          >
            <div className="flex items-center gap-2 px-4 pt-3 pb-2">
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
              <button
                onClick={() => setColaVisible(false)}
                className="ml-auto text-[color:var(--color-texto-tenue)] px-1"
                style={{ minHeight: 0 }}
                aria-label="Plegar la cola de casos"
              >
                ⌄
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-2">
              {cola.length === 0 && (
                <p className="text-sm text-[color:var(--color-texto-tenue)] p-4 rounded-2xl border border-[color:var(--color-borde)]">
                  {casos.length === 0
                    ? "Sin casos en la red. Despacha uno desde /campo."
                    : "Nada coincide con el filtro."}
                </p>
              )}
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
        ) : (
          <button
            onClick={() => setColaVisible(true)}
            className="pointer-events-auto self-start px-4 py-2 rounded-full bg-neutral-900/75 backdrop-blur-lg border border-[color:var(--color-borde)] text-sm font-medium"
          >
            ▸ Cola ({cola.length})
          </button>
        )}

        {/* ── Carril derecho: congestión arriba, vista de calle abajo.
             Comparten ancho y se reparten la altura — no se solapan. ── */}
        <div className="pointer-events-none w-full lg:w-[350px] flex flex-col gap-3 min-h-0 items-stretch">
        {redVisible ? (
          <section
            aria-label="Congestión de la red"
            className="pointer-events-auto max-h-[38vh] lg:max-h-none flex-1 flex flex-col min-h-0 rounded-2xl bg-neutral-900/75 backdrop-blur-lg border border-[color:var(--color-borde)]"
          >
            <div className="flex items-center gap-2 px-4 pt-3 pb-1">
              <h2 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
                Congestión de la red · estimada
              </h2>
              <button
                onClick={() => setRedVisible(false)}
                className="ml-auto text-[color:var(--color-texto-tenue)] px-1"
                style={{ minHeight: 0 }}
                aria-label="Plegar el panel de congestión"
              >
                ⌄
              </button>
            </div>
            <p className="px-4 pb-2 text-[11px] text-[color:var(--color-texto-tenue)] leading-relaxed">
              Ninguna IPS reportó estos números: salen del snapshot REPS, la
              curva horaria y los rechazos registrados.
            </p>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3">
              <table className="w-full text-xs">
                <thead className="text-[color:var(--color-texto-tenue)] sticky top-0 bg-neutral-900/90 backdrop-blur-lg">
                  <tr className="text-left">
                    <th className="pb-2 font-normal">Sede</th>
                    <th className="pb-2 font-normal w-28">Índice</th>
                    <th className="pb-2 font-normal w-12">
                      <span
                        className="flex items-center justify-end gap-0.5"
                        title="aceptados / rechazados"
                      >
                        <Check size={11} className="text-[color:var(--color-estable)]" />
                        /
                        <Ban size={11} className="text-[color:var(--color-critico)]" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {congestion.map((s) => (
                    <tr key={s.codigo} className="border-t border-[color:var(--color-borde)]">
                      <td className="py-2 pr-2 max-w-[150px]">
                        <button
                          onClick={() => setFichaSedeCodigo(s.codigo)}
                          className="block w-full truncate text-left hover:underline"
                          style={{ minHeight: 0 }}
                        >
                          {s.nombre}
                        </button>
                      </td>
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
                          <span className="tabular w-7 text-right">
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
            </div>
          </section>
        ) : (
          <button
            onClick={() => setRedVisible(true)}
            className="pointer-events-auto self-end px-4 py-2 rounded-full bg-neutral-900/75 backdrop-blur-lg border border-[color:var(--color-borde)] text-sm font-medium"
          >
            ◂ Red ({congestion.length})
          </button>
        )}

        {/* ── Vista de calle del punto explorado (fondo del carril) ── */}
        <div className="mt-auto min-h-0 pointer-events-none">
          <VistaCalle
            coord={lugarExplorado}
            onCerrar={() => setLugarExplorado(null)}
          />
        </div>
        </div>
      </div>

      {/* ── Registro de la sesión (auditoría) ── */}
      <div className="pointer-events-auto self-start w-[min(52rem,100%)]">
        <Registro derivados={derivados} nombresSedes={nombresSedes} flotante />
      </div>
      </div>

      {/* ── Confirmación fuerte del modo contingencia ── */}
      <AnimatePresence>
        {confirmandoContingencia && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setConfirmandoContingencia(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 12 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-[2rem] bg-[color:var(--color-superficie)] border border-[color:var(--color-critico)]/60 p-5 space-y-4"
              role="dialog"
              aria-label="Activar modo contingencia"
            >
              <h3 className="font-bold text-[color:var(--color-critico)]">
                Activar modo contingencia
              </h3>
              <p className="text-sm leading-relaxed">
                Vas a declarar contingencia para Bogotá D.C. En operación real
                esto cambia las reglas de asignación a gestión de múltiples
                víctimas y notifica a los CRED (Res. 1220/2010).
              </p>
              <p className="text-xs p-2 rounded-lg bg-[color:var(--color-alerta)]/15 border border-[color:var(--color-alerta)]/40">
                En esta versión es un marco declarado: activa el aviso
                permanente en el tablero, pero la lógica de asignación masiva
                está en el roadmap.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setConfirmandoContingencia(false)}
                  className="rounded-full border border-[color:var(--color-borde)] font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => alternarContingencia(true)}
                  className="rounded-full font-semibold bg-[color:var(--color-critico)] text-white"
                >
                  Declarar contingencia
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Ficha de sede ── */}
      <FichaSede
        sede={fichaSede}
        handshakes={handshakes}
        derivados={derivados}
        onCerrar={() => setFichaSedeCodigo(null)}
        onVerEnMapa={
          fichaSede?.coord
            ? () => {
                setFocoMapa(fichaSede.coord!);
                setFichaSedeCodigo(null);
              }
            : null
        }
      />

      {/* ── Panel de detalle ── */}
      <AnimatePresence>
        {seleccionado && ahora !== null && (
          <PanelCaso
            key={seleccionado.caso.id}
            derivado={seleccionado}
            nombresSedes={nombresSedes}
            ahoraMs={ahora}
            regulador={regulador}
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
  // Segmento de una sola barra de vidrio (el contenedor pone fondo y
  // separadores): mínimo cromo, máximo dato.
  const clases = `px-4 py-1.5 text-left transition-colors ${
    activo
      ? "bg-[color:var(--color-superficie-alta)]"
      : alerta
        ? "bg-[color:var(--color-critico)]/15"
        : onClick
          ? "hover:bg-white/5"
          : ""
  }`;
  const contenido = (
    <>
      <div
        className={`text-xl font-bold tabular leading-tight ${
          alerta ? "text-[color:var(--color-critico)]" : ""
        }`}
      >
        {valor}
      </div>
      <div className="text-[9px] uppercase tracking-wide text-[color:var(--color-texto-tenue)] leading-tight whitespace-nowrap">
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
  // Señal preatentiva: la fila escalada ENTRA estampándose, no aparece.
  const reducirMovimiento = useReducedMotion();
  return (
    <motion.button
      layout={!reducirMovimiento}
      initial={
        reducirMovimiento
          ? false
          : escalado
            ? { opacity: 0, scale: 0.96, y: -10 }
            : { opacity: 0, y: -6 }
      }
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
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
    </motion.button>
  );
}
