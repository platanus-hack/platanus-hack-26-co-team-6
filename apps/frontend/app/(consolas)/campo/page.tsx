"use client";

/**
 * /campo — CARRIL DE JUAN
 *
 * Dictar → triage → match → despachar → ver la aceptación llegar.
 *
 * Esta página quedó como ORQUESTADOR: maneja el flujo (las cinco fases), el
 * cronómetro y el dictado por voz. Todo lo que se pinta vive en
 * components/campo/. Si vas a cambiar cómo se ve algo, es allá; si vas a
 * cambiar cuándo pasa algo, es acá.
 *
 * Lo que NO debes romper (lo consumen los otros tres):
 *   - los contratos de core: POST /triage, /match, /dispatch (ver lib/api.ts)
 *   - el cronómetro: el número que sale en el pitch sale de aquí
 *
 * Ver docs/juan-frontend.md para tu lista de tareas.
 */

import { useCallback, useEffect, useState } from "react";
import type { Caso, Candidato, Handshake } from "@/lib/types";
import type { CasoReal } from "@/lib/casos-reales.generado";
import { CASOS_REALES } from "@/lib/casos-reales.generado";
import { useGeolocalizacion } from "@/lib/useGeolocalizacion";
import { useDictadoVoz } from "@/lib/useDictadoVoz";
import { Cabecera } from "@/components/campo/Cabecera";
import { PanelDictado } from "@/components/campo/PanelDictado";
import { TarjetaCaso } from "@/components/campo/TarjetaCaso";
import { TarjetaCandidato } from "@/components/campo/TarjetaCandidato";
import * as api from "@/lib/api";

type Fase = "dictado" | "analizando" | "ranking" | "esperando" | "resuelto";

export default function Campo() {
  const [texto, setTexto] = useState("");
  const [fase, setFase] = useState<Fase>("dictado");
  const [caso, setCaso] = useState<Caso | null>(null);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [meta, setMeta] = useState({ evaluadas: 0, compatibles: 0 });
  const [handshake, setHandshake] = useState<Handshake | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Dónde está la ambulancia ───────────────────────────────────
  const geo = useGeolocalizacion();

  // ── Incidente real del 123 ─────────────────────────────────────
  //
  // Cuando el caso viene de un incidente real se guarda aquí para pintar su
  // procedencia y, sobre todo, para rutear DESDE la localidad donde ocurrió.
  const [casoReal, setCasoReal] = useState<CasoReal | null>(null);
  const [indiceReal, setIndiceReal] = useState(0);

  /**
   * Avanza al siguiente incidente real. Cíclico y no aleatorio a propósito:
   * el demo tiene que ser determinista, y elegir al azar durante el render
   * rompería la hidratación de la página estática.
   */
  function cargarCasoReal() {
    const c = CASOS_REALES[indiceReal % CASOS_REALES.length];
    setTexto(c.texto);
    setCasoReal(c);
    setIndiceReal((i) => i + 1);
    setError(null);
  }

  function cargarDictado(t: string) {
    setTexto(t);
    setCasoReal(null);
    setError(null);
  }

  // ── Cronómetro de hora dorada ──────────────────────────────────
  const [t0, setT0] = useState<number | null>(null);
  const [transcurrido, setTranscurrido] = useState(0);
  useEffect(() => {
    if (t0 === null || fase === "resuelto") return;
    const id = setInterval(() => setTranscurrido((Date.now() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, [t0, fase]);

  // ── Dictado por voz ────────────────────────────────────────────
  //
  // La Web Speech API vive tipada en useDictadoVoz. Aqui solo se conecta con
  // el textarea y se avisa si el navegador no la soporta.
  const anexarTranscrito = useCallback(
    (fragmento: string) => setTexto((t) => (t + " " + fragmento).trim()),
    [],
  );
  const voz = useDictadoVoz(anexarTranscrito);

  // ── Flujo ──────────────────────────────────────────────────────

  async function analizar() {
    setError(null);
    setFase("analizando");
    setT0(Date.now());
    try {
      // Prioridad del origen:
      //   1. el incidente real, si el caso salió de uno
      //   2. el GPS de la unidad
      //   3. undefined → core usa ORIGEN_DEMO
      // Sin esto todo se rutea desde el mismo punto y el ranking sale igual
      // salgas de donde salgas, que es lo contrario de lo que hace PULSO.
      const origen = casoReal?.origen ?? geo.origen ?? undefined;

      const { caso: c } = await api.triage({ texto, origen });
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
    setCasoReal(null);
    setT0(null);
    setTranscurrido(0);
    setFase("dictado");
  }

  // ── Render ─────────────────────────────────────────────────────

  const sedeAceptante = candidatos.find(
    (c) => c.sede.codigo === handshake?.sedeCodigo,
  )?.sede.nombre;

  return (
    <main className="min-h-screen max-w-lg mx-auto p-4 pb-24">
      <Cabecera
        transcurrido={transcurrido}
        corriendo={t0 !== null}
        estadoGeo={geo.estado}
        precisionM={geo.precisionM}
        onReubicar={geo.ubicar}
      />

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg bg-[color:var(--color-critico)]/15 border border-[color:var(--color-critico)]/40 text-sm"
        >
          {error}
        </div>
      )}

      {(fase === "dictado" || fase === "analizando") && (
        <PanelDictado
          texto={texto}
          onTexto={setTexto}
          onDictadoDemo={cargarDictado}
          onCasoReal={cargarCasoReal}
          casoReal={casoReal}
          escuchando={voz.escuchando}
          onMicrofono={voz.alternar}
          vozSoportada={voz.soportado}
          onAnalizar={analizar}
          analizando={fase === "analizando"}
        />
      )}

      {caso && fase !== "dictado" && fase !== "analizando" && (
        <TarjetaCaso caso={caso} />
      )}

      {fase === "ranking" && (
        <section>
          <p className="text-xs text-[color:var(--color-texto-tenue)] mb-3">
            {meta.evaluadas} sedes evaluadas · {meta.compatibles} con los servicios
            requeridos habilitados
          </p>
          <div className="space-y-2">
            {candidatos.map((c) => (
              <TarjetaCandidato
                key={c.sede.codigo}
                candidato={c}
                onDespachar={despachar}
              />
            ))}
          </div>
        </section>
      )}

      {fase === "esperando" && handshake && (
        <section className="p-6 rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] text-center">
          <div className="text-4xl mb-3 latido" aria-hidden>
            📲
          </div>
          <p className="font-semibold">Solicitud enviada</p>
          <p className="text-sm text-[color:var(--color-texto-tenue)] mt-1">
            Esperando confirmación del jefe de urgencias…
          </p>
        </section>
      )}

      {fase === "resuelto" && handshake && (
        <section className="p-6 rounded-xl border border-[color:var(--color-estable)]/50 bg-[color:var(--color-estable)]/10 text-center">
          <div className="text-4xl mb-3" aria-hidden>
            ✅
          </div>
          <p className="text-xl font-bold">Traslado aceptado</p>
          <p className="text-sm text-[color:var(--color-texto-tenue)] mt-1">
            {sedeAceptante}
          </p>
          <p className="mt-4 text-3xl font-bold tabular">{transcurrido.toFixed(0)}s</p>
          <p className="text-xs text-[color:var(--color-texto-tenue)]">
            del dictado a la cama confirmada
          </p>
          <button
            onClick={reiniciar}
            className="mt-6 px-6 min-h-12 rounded-xl border border-[color:var(--color-borde)]"
          >
            Nuevo caso
          </button>
        </section>
      )}
    </main>
  );
}
