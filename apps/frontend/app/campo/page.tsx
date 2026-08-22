"use client";

/**
 * /campo — CARRIL DE JUAN
 *
 * Esta pantalla YA CORRE end-to-end: dictar → triage → match → despachar
 * → ver la aceptación llegar. Es fea a propósito. Tu trabajo, Juan, no es
 * hacerla desde cero: es hacerla ver como algo que un paramédico usaría a
 * las 3 de la mañana con guantes puestos, y meterle el mapa.
 *
 * Lo que NO debes romper (lo consumen los otros tres):
 *   - los contratos de core: POST /triage, /match, /dispatch (ver lib/api.ts)
 *   - el cronómetro: el número que sale en el pitch sale de aquí
 *
 * Ver docs/juan-frontend.md para tu lista de tareas.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Caso, Candidato, Coordenada, Handshake } from "@/lib/types";
import { DICTADOS_DEMO } from "@/lib/demo";
import { nombresServicios, ETIQUETA_TRIAGE, esHoraDorada } from "@/lib/presentacion";
import * as api from "@/lib/api";

// mapbox-gl toca window al importarse: solo en el navegador.
const MapaDespacho = dynamic(() => import("@/components/campo/MapaDespacho"), {
  ssr: false,
  loading: () => (
    <div className="h-72 rounded-[2rem] bg-[color:var(--color-superficie)] border border-[color:var(--color-borde)] latido" />
  ),
});

/** Ubicación real del paramédico, o null (permiso negado / sin señal / timeout). */
function obtenerUbicacion(): Promise<Coordenada | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 2500, maximumAge: 60_000 },
    );
  });
}

type Fase = "dictado" | "analizando" | "ranking" | "esperando" | "resuelto";

export default function Campo() {
  const [texto, setTexto] = useState("");
  const [fase, setFase] = useState<Fase>("dictado");
  const [caso, setCaso] = useState<Caso | null>(null);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [meta, setMeta] = useState({ evaluadas: 0, compatibles: 0 });
  const [handshake, setHandshake] = useState<Handshake | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ubicacionDemo, setUbicacionDemo] = useState(false);

  // ── Cronómetro de hora dorada ──────────────────────────────────
  const [t0, setT0] = useState<number | null>(null);
  const [transcurrido, setTranscurrido] = useState(0);
  useEffect(() => {
    if (t0 === null || fase === "resuelto") return;
    const id = setInterval(() => setTranscurrido((Date.now() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, [t0, fase]);

  // ── Dictado por voz (Web Speech API) ───────────────────────────
  const [escuchando, setEscuchando] = useState(false);
  const recRef = useRef<any>(null);

  const alternarMicrofono = useCallback(() => {
    // Web Speech API no está en las typings del DOM: va con any a propósito.
    const SR =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Este navegador no soporta dictado por voz. Usa Chrome, o escribe.");
      return;
    }
    if (escuchando) {
      recRef.current?.stop();
      setEscuchando(false);
      return;
    }
    const rec = new SR();
    rec.lang = "es-CO";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
      }
      if (final) setTexto((t) => (t + " " + final).trim());
    };
    rec.onerror = () => setEscuchando(false);
    rec.onend = () => setEscuchando(false);
    rec.start();
    recRef.current = rec;
    setEscuchando(true);
  }, [escuchando]);

  // ── Flujo ──────────────────────────────────────────────────────

  async function analizar() {
    setError(null);
    setFase("analizando");
    setT0(Date.now());
    try {
      // Geolocalización real con fallback: si no hay permiso o hay timeout,
      // core usa su origen demo (Plaza de Bolívar) y la UI lo declara.
      const ubicacion = await obtenerUbicacion();
      setUbicacionDemo(ubicacion === null);

      const { caso: c } = await api.triage({
        texto,
        ...(ubicacion ? { origen: ubicacion } : {}),
      });
      setCaso(c);

      const m = await api.match({ caso: c, limite: 5 });
      setCandidatos(m.candidatos);
      setMeta({ evaluadas: m.evaluadas, compatibles: m.compatibles });
      setFase("ranking");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setFase("dictado");
    }
  }

  async function despachar(c: Candidato) {
    if (!caso) return;
    setFase("esperando");
    try {
      const { handshake: h } = await api.dispatch({
        casoId: caso.id,
        sedeCodigo: c.sede.codigo,
      });
      setHandshake(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo despachar");
      setFase("ranking");
    }
  }

  // Polling del estado del handshake. Juan: si sobra tiempo después de H20,
  // cambiar a Supabase Realtime. Se ve igual, pero es más elegante.
  useEffect(() => {
    if (fase !== "esperando" || !handshake) return;
    const id = setInterval(async () => {
      // Un fallo de red aquí no puede matar el polling: el siguiente tick
      // reintenta. Sin este catch, core reiniciando deja la pantalla colgada.
      const d = await api.estado(handshake.casoId).catch(() => null);
      const actual = d?.handshakes.find((x) => x.id === handshake.id);
      if (actual && actual.estado !== "enviado") {
        setHandshake(actual);
        if (actual.estado === "aceptado") setFase("resuelto");
        else setFase("ranking"); // rechazado → volver al ranking, ya re-scoreado
      }
    }, 1500);
    return () => clearInterval(id);
  }, [fase, handshake]);

  function reiniciar() {
    setTexto("");
    setCaso(null);
    setCandidatos([]);
    setHandshake(null);
    setT0(null);
    setTranscurrido(0);
    setUbicacionDemo(false);
    setFase("dictado");
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <main className="min-h-screen max-w-lg mx-auto p-4 pb-24">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🫀</span>
          <span className="font-bold text-lg">PULSO</span>
          <span className="text-xs text-[color:var(--color-texto-tenue)]">campo</span>
        </div>
        {t0 !== null && (
          <div className="text-right tabular">
            <div
              className={`text-2xl font-bold ${
                transcurrido > 90 ? "text-[color:var(--color-critico)]" : ""
              }`}
            >
              {transcurrido.toFixed(1)}s
            </div>
            <div className="text-[10px] text-[color:var(--color-texto-tenue)] uppercase tracking-wide">
              hora dorada
            </div>
          </div>
        )}
      </header>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[color:var(--color-critico)]/15 border border-[color:var(--color-critico)]/40 text-sm">
          {error}
        </div>
      )}

      {/* ── Dictado ── */}
      {(fase === "dictado" || fase === "analizando") && (
        <section className="space-y-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Dicta o escribe el caso. Ej: masculino de 54 años, dolor precordial opresivo, supra ST en DII DIII aVF, hemodinámicamente inestable."
            rows={7}
            className="w-full p-4 rounded-xl bg-[color:var(--color-superficie)]
                       border border-[color:var(--color-borde)] text-base leading-relaxed
                       focus:outline-none focus:border-[color:var(--color-info)]"
          />

          <div className="flex gap-2">
            <button
              onClick={alternarMicrofono}
              className={`flex-1 rounded-xl font-semibold border transition-colors ${
                escuchando
                  ? "bg-[color:var(--color-critico)] border-transparent latido"
                  : "bg-[color:var(--color-superficie)] border-[color:var(--color-borde)]"
              }`}
            >
              {escuchando ? "⏹ Detener" : "🎙 Dictar"}
            </button>
            <button
              onClick={analizar}
              disabled={texto.trim().length < 10 || fase === "analizando"}
              className="flex-[2] rounded-xl font-semibold bg-[color:var(--color-info)]
                         text-[#04121f] disabled:opacity-40"
            >
              {fase === "analizando" ? "Analizando…" : "Analizar y rutear"}
            </button>
          </div>

          <div className="pt-4">
            <p className="text-xs text-[color:var(--color-texto-tenue)] mb-2 uppercase tracking-wide">
              Casos de prueba
            </p>
            <div className="flex flex-wrap gap-2">
              {DICTADOS_DEMO.map((d) => (
                <button
                  key={d.etiqueta}
                  onClick={() => setTexto(d.texto)}
                  className="px-3 py-2 text-xs rounded-lg bg-[color:var(--color-superficie)]
                             border border-[color:var(--color-borde)]"
                >
                  {d.etiqueta}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Caso extraído ── */}
      {caso && fase !== "dictado" && fase !== "analizando" && (
        <section
          className={`mb-4 p-4 rounded-xl border ${
            esHoraDorada(caso.triage)
              ? "border-[color:var(--color-critico)]/50 bg-[color:var(--color-critico)]/10"
              : "border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold">
              Triage {ETIQUETA_TRIAGE[caso.triage]}
            </span>
            <span className="text-xs text-[color:var(--color-texto-tenue)]">
              {caso.tipoMovil} · confianza {(caso.confianza * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-sm mb-2">{caso.resumen}</p>
          <dl className="text-xs space-y-1 text-[color:var(--color-texto-tenue)]">
            <div>
              <span className="font-semibold">Dx:</span> {caso.dxDescripcion}
              {caso.dxCie10 && ` (${caso.dxCie10})`}
            </div>
            <div>
              <span className="font-semibold">Requiere:</span>{" "}
              {nombresServicios(caso.serviciosRequeridos)}
            </div>
            {caso.signosAlarma.length > 0 && (
              <div>
                <span className="font-semibold">Alarma:</span>{" "}
                {caso.signosAlarma.join(" · ")}
              </div>
            )}
          </dl>
        </section>
      )}

      {/* ── Mapa de despacho ── */}
      {caso &&
        (fase === "ranking" || fase === "esperando" || fase === "resuelto") && (
          <section className="mb-4">
            <MapaDespacho
              origen={caso.origen}
              candidatos={candidatos}
              sedeSeleccionada={handshake?.sedeCodigo ?? null}
              ubicacionDemo={ubicacionDemo}
            />
          </section>
        )}

      {/* ── Ranking ── */}
      {fase === "ranking" && (
        <section>
          <p className="text-xs text-[color:var(--color-texto-tenue)] mb-3">
            {meta.evaluadas} sedes evaluadas · {meta.compatibles} con los servicios
            requeridos habilitados
          </p>
          <div className="space-y-2">
            {candidatos.map((c) => (
              <TarjetaCandidato key={c.sede.codigo} c={c} onDespachar={despachar} />
            ))}
          </div>
        </section>
      )}

      {/* ── Esperando respuesta ── */}
      {fase === "esperando" && handshake && (
        <section className="p-6 rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] text-center">
          <div className="text-4xl mb-3 latido">📲</div>
          <p className="font-semibold">Solicitud enviada</p>
          <p className="text-sm text-[color:var(--color-texto-tenue)] mt-1">
            Esperando confirmación del jefe de urgencias…
          </p>
        </section>
      )}

      {/* ── Resuelto ── */}
      {fase === "resuelto" && handshake && (
        <section className="p-6 rounded-xl border border-[color:var(--color-estable)]/50 bg-[color:var(--color-estable)]/10 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-xl font-bold">Traslado aceptado</p>
          <p className="text-sm text-[color:var(--color-texto-tenue)] mt-1">
            {candidatos.find((c) => c.sede.codigo === handshake.sedeCodigo)?.sede.nombre}
          </p>
          <p className="mt-4 text-3xl font-bold tabular">{transcurrido.toFixed(0)}s</p>
          <p className="text-xs text-[color:var(--color-texto-tenue)]">
            del dictado a la cama confirmada
          </p>
          <button
            onClick={reiniciar}
            className="mt-6 px-6 rounded-xl border border-[color:var(--color-borde)]"
          >
            Nuevo caso
          </button>
        </section>
      )}
    </main>
  );
}

function TarjetaCandidato({
  c,
  onDespachar,
}: {
  c: Candidato;
  onDespachar: (c: Candidato) => void;
}) {
  const descartada = c.motivoDescarte !== null;

  return (
    <article
      className={`p-4 rounded-xl border ${
        descartada
          ? "border-[color:var(--color-borde)] bg-transparent opacity-50"
          : c.rank === 1
            ? "border-[color:var(--color-estable)]/60 bg-[color:var(--color-superficie-alta)]"
            : "border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {!descartada && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-[color:var(--color-info)] text-[#04121f]">
                #{c.rank}
              </span>
            )}
            <h3 className="font-semibold truncate">{c.sede.nombre}</h3>
          </div>
          <p className="text-xs text-[color:var(--color-texto-tenue)] mt-0.5">
            {c.sede.localidad} · {c.distKm} km
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold tabular">{Math.round(c.etaMin)}</div>
          <div className="text-[10px] text-[color:var(--color-texto-tenue)]">min ruta</div>
        </div>
      </div>

      {descartada ? (
        <p className="mt-3 text-xs text-[color:var(--color-alerta)]">
          ⛔ {c.motivoDescarte}
        </p>
      ) : (
        <>
          {/* El desglose en minutos es el argumento del producto: que se vea. */}
          <div className="mt-3 flex gap-3 text-[11px] text-[color:var(--color-texto-tenue)] tabular">
            <span>ruta {Math.round(c.desglose.ruta)}′</span>
            <span>rechazo +{Math.round(c.desglose.riesgoRechazo)}′</span>
            <span>espera +{Math.round(c.desglose.espera)}′</span>
            <span className="ml-auto font-semibold text-[color:var(--color-texto)]">
              = {Math.round(c.score)}′
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <span className="text-[color:var(--color-texto-tenue)]">congestión</span>
            <div className="flex-1 h-1.5 rounded-full bg-[color:var(--color-borde)] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${c.congestion * 100}%`,
                  background:
                    c.congestion > 0.85
                      ? "var(--color-critico)"
                      : c.congestion > 0.7
                        ? "var(--color-alerta)"
                        : "var(--color-estable)",
                }}
              />
            </div>
            <span className="tabular">{Math.round(c.pAceptacion * 100)}% acepta</span>
          </div>
          <button
            onClick={() => onDespachar(c)}
            className="mt-3 w-full rounded-lg font-semibold bg-[color:var(--color-estable)] text-[#04231d]"
          >
            Despachar aquí
          </button>
        </>
      )}
    </article>
  );
}
