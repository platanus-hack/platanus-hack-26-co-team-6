"use client";

/**
 * /campo — CARRIL DE JUAN
 *
 * Inicio → dictar → triage → match → despachar → ver la aceptación llegar.
 *
 * Esta página es el ORQUESTADOR: maneja las fases, el cronómetro, el dictado y
 * la identidad de la unidad. Todo lo que se pinta vive en components/campo/.
 * Si vas a cambiar cómo se ve algo, es allá; si vas a cambiar cuándo pasa
 * algo, es acá.
 *
 * Lo que NO debes romper (lo consumen los otros tres):
 *   - los contratos de core: POST /triage, /match, /dispatch (ver lib/api.ts)
 *   - el cronómetro: el número que sale en el pitch sale de aquí
 *
 * Estado de la reforma (ver docs/juan-campo-v2.md): están hechos §0 la barra
 * persistente, §1 el inicio y §2 la captura con el orbe. Siguen pendientes §3
 * la compuerta humana de revisión, §4 el estado de escalamiento, §5 la
 * solicitud con cronómetro de expiración, §6 la pantalla de ruta y §7 la
 * entrada manual.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Caso, Candidato, Handshake } from "@/lib/types";
import type { CasoReal } from "@/lib/casos-reales.generado";
import { CASOS_REALES } from "@/lib/casos-reales.generado";
import { useGeolocalizacion } from "@/lib/useGeolocalizacion";
import { useDictadoVoz } from "@/lib/useDictadoVoz";
import { useConectividad } from "@/lib/useConectividad";
import { useCapacidades } from "@/lib/useCapacidades";
import { useUnidad } from "@/lib/unidad";
import { FondoOperativo } from "@/components/campo/FondoOperativo";
import { BarraPersistente } from "@/components/campo/BarraPersistente";
import { SelectorUnidad } from "@/components/campo/SelectorUnidad";
import {
  PantallaInicio,
  type CasoActivo,
} from "@/components/campo/PantallaInicio";
import { PantallaCaptura } from "@/components/campo/PantallaCaptura";
import { TarjetaCaso } from "@/components/campo/TarjetaCaso";
import { TarjetaCandidato } from "@/components/campo/TarjetaCandidato";
import { RevisionRequerida } from "@/components/campo/RevisionRequerida";
import { FotoCalle } from "@/components/mapa/FotoCalle";
import * as api from "@/lib/api";
import { ErrorApi, type CodigoError } from "@/lib/api";

// mapbox-gl toca window al importarse: solo en el navegador.
const MapaDespacho = dynamic(() => import("@/components/campo/MapaDespacho"), {
  ssr: false,
  loading: () => (
    <div className="h-72 rounded-[2rem] bg-[color:var(--color-superficie)] border border-[color:var(--color-borde)] latido" />
  ),
});

const MapaUnidad = dynamic(() => import("@/components/campo/MapaUnidad"), {
  ssr: false,
  loading: () => (
    <div className="h-56 rounded-[1.75rem] bg-[color:var(--color-superficie)] border border-[color:var(--color-borde)] latido" />
  ),
});

type Fase =
  | "inicio"
  | "captura"
  | "analizando"
  | "ranking"
  | "esperando"
  | "resuelto"
  /** El motor se negó a rutear. No es un error: es una decisión suya. */
  | "revision";

export default function Campo() {
  const [texto, setTexto] = useState("");
  const [fase, setFase] = useState<Fase>("inicio");
  const [caso, setCaso] = useState<Caso | null>(null);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [meta, setMeta] = useState({ evaluadas: 0, compatibles: 0 });
  const [handshake, setHandshake] = useState<Handshake | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bloqueo, setBloqueo] = useState<{ codigo: CodigoError; detalle: string } | null>(
    null,
  );
  const [ubicacionDemo, setUbicacionDemo] = useState(false);

  // ── Contexto de la unidad ──────────────────────────────────────
  const geo = useGeolocalizacion();
  const conexion = useConectividad();
  const { capacidades } = useCapacidades();
  const { unidad, declarar } = useUnidad();
  const [pidiendoUnidad, setPidiendoUnidad] = useState(false);

  const sinSenal = conexion.estado === "sin-senal";

  // ── Incidente real del 123 ─────────────────────────────────────
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
    setBloqueo(null);
  }

  function cargarDictado(t: string) {
    setTexto(t);
    setCasoReal(null);
    setError(null);
    setBloqueo(null);
  }

  // ── Cronómetro de hora dorada ──────────────────────────────────
  const [t0, setT0] = useState<number | null>(null);
  const [transcurrido, setTranscurrido] = useState(0);
  useEffect(() => {
    if (t0 === null || fase === "resuelto") return;
    const id = setInterval(
      () => setTranscurrido((Date.now() - t0) / 1000),
      100,
    );
    return () => clearInterval(id);
  }, [t0, fase]);

  // ── Casos activos del inicio ───────────────────────────────────
  //
  // Se piden solo mientras la pantalla de inicio está a la vista: es la única
  // que los muestra, y dejar el polling corriendo durante un dictado gastaría
  // datos en una zona donde puede que no haya.
  const [activos, setActivos] = useState<CasoActivo[]>([]);
  useEffect(() => {
    if (fase !== "inicio") return;

    let vivo = true;
    const cargar = async () => {
      const d = await api.estado().catch(() => null);
      if (!vivo || !d) return;

      const ahora = Date.now();
      const abiertos = d.casos
        .map((c) => {
          // El más reciente manda: es el que refleja dónde está el caso ahora.
          const h =
            d.handshakes
              .filter((x) => x.casoId === c.id)
              .sort((a, b) => b.enviadoEn.localeCompare(a.enviadoEn))[0] ??
            null;
          return {
            caso: c,
            handshake: h,
            transcurridoS: (ahora - new Date(c.creadoEn).getTime()) / 1000,
          };
        })
        // Un caso aceptado ya no está "en curso": el paramédico va en camino y
        // no necesita verlo compitiendo con el botón de caso nuevo.
        .filter((x) => x.handshake?.estado !== "aceptado");

      setActivos(abiertos);
    };

    void cargar();
    const id = setInterval(() => void cargar(), 3000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [fase]);

  // ── Dictado por voz ────────────────────────────────────────────
  const anexarTranscrito = useCallback(
    (fragmento: string) => setTexto((t) => (t + " " + fragmento).trim()),
    [],
  );
  const voz = useDictadoVoz(anexarTranscrito);

  // ── Flujo ──────────────────────────────────────────────────────

  function nuevoCaso() {
    reiniciar();
    setFase("captura");
    // Sin unidad declarada, este es el momento de preguntarlo: antes de que
    // haya un paciente esperando y con la pantalla todavía vacía.
    if (!unidad) setPidiendoUnidad(true);
  }

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
      setUbicacionDemo(!origen);

      const { caso: c } = await api.triage({
        texto,
        origen,
        unidad: unidad ?? undefined,
      });
      setCaso(c);

      const m = await api.match({ caso: c, limite: 5 });
      setCandidatos(m.candidatos);
      setMeta({ evaluadas: m.evaluadas, compatibles: m.compatibles });
      setFase("ranking");
    } catch (e) {
      // Un rechazo del motor de ruteo NO es un fallo técnico: tiene su propia
      // pantalla, porque el paramédico puede hacer algo distinto en cada caso.
      if (e instanceof ErrorApi && e.codigo) {
        setBloqueo({ codigo: e.codigo, detalle: e.message });
        setFase("revision");
        return;
      }
      setError(e instanceof Error ? e.message : "Error inesperado");
      setFase("captura");
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
    setBloqueo(null);
    setT0(null);
    setTranscurrido(0);
    setUbicacionDemo(false);
    setError(null);
  }

  function volverAlInicio() {
    reiniciar();
    setFase("inicio");
  }

  // ── Render ─────────────────────────────────────────────────────

  const sedeAceptada = useMemo(
    () => candidatos.find((c) => c.sede.codigo === handshake?.sedeCodigo)?.sede,
    [candidatos, handshake],
  );

  return (
    <div className="relative min-h-screen">
      <FondoOperativo />

      <main className="relative z-10 max-w-lg mx-auto p-4 pb-24">
        <BarraPersistente
          unidad={unidad}
          onCambiarUnidad={() => setPidiendoUnidad(true)}
          conexion={conexion.estado}
          transcurrido={transcurrido}
          corriendo={t0 !== null}
          estadoGeo={geo.estado}
          precisionM={geo.precisionM}
          onReubicar={geo.ubicar}
          capacidades={capacidades}
        />

      {fase === "revision" && bloqueo && (
        <RevisionRequerida
          codigo={bloqueo.codigo}
          detalle={bloqueo.detalle}
          onVolver={() => {
            setBloqueo(null);
            setT0(null);
            setFase("captura");
          }}
        />
      )}

      {pidiendoUnidad && (
        <SelectorUnidad
          actual={unidad}
          onGuardar={(id, tripulante) => {
            declarar(id, tripulante);
            setPidiendoUnidad(false);
          }}
          onCerrar={() => setPidiendoUnidad(false)}
        />
      )}

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-lg bg-[color:var(--color-critico)]/15 border border-[color:var(--color-critico)]/40 text-sm"
          >
            {error}
          </div>
        )}

        {fase === "inicio" && (
          <>
            <PantallaInicio
              casos={activos}
              onNuevo={nuevoCaso}
              // Reabrir un caso previo todavía no restaura su punto exacto del
              // flujo — eso llega con §1 completo. Por ahora lleva a la captura,
              // que es donde el paramédico puede actuar.
              onAbrir={() => setFase("captura")}
            />

            {/* Dónde está la unidad, en vivo. Va al final y no arriba a
                propósito: es contexto, no la acción. Lo primero que tiene que
                encontrar el pulgar sigue siendo el botón de caso nuevo. */}
            <section className="mt-6">
              <MapaUnidad
                posicion={geo.origen}
                estado={geo.estado}
                precisionM={geo.precisionM}
              />
            </section>
          </>
        )}

        {(fase === "captura" || fase === "analizando") && (
          <PantallaCaptura
            texto={texto}
            onTexto={setTexto}
            onDictadoDemo={cargarDictado}
            onCasoReal={cargarCasoReal}
            casoReal={casoReal}
            escuchando={voz.escuchando}
            onMicrofono={voz.alternar}
            vozSoportada={voz.soportado}
            falloDictado={voz.fallo}
            parcial={voz.parcial}
            medidorRef={voz.medidorRef}
            onAnalizar={analizar}
            analizando={fase === "analizando"}
            sinSenal={sinSenal}
            onCancelar={volverAlInicio}
          />
        )}

        {caso &&
          fase !== "inicio" &&
          fase !== "captura" &&
          fase !== "analizando" && <TarjetaCaso caso={caso} />}

        {/* ── Mapa de despacho ── */}
        {caso &&
          (fase === "ranking" ||
            fase === "esperando" ||
            fase === "resuelto") && (
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
              {meta.evaluadas} sedes evaluadas · {meta.compatibles} con los
              servicios requeridos habilitados
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
              {sedeAceptada?.nombre}
            </p>
            <p className="mt-4 text-3xl font-bold tabular">
              {transcurrido.toFixed(0)}s
            </p>
            <p className="text-xs text-[color:var(--color-texto-tenue)]">
              del dictado a la cama confirmada
            </p>
            {sedeAceptada && (
              <FotoCalle
                coord={sedeAceptada.coord}
                titulo={sedeAceptada.nombre}
              />
            )}
            <button
              onClick={volverAlInicio}
              className="mt-6 px-6 min-h-12 rounded-xl border border-[color:var(--color-borde)]"
            >
              Nuevo caso
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
