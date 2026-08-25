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
 * Estado de la reforma (ver docs/juan-campo-v2.md): hechos §0 la barra
 * persistente, §1 el inicio con mapa de la unidad en vivo, §2 la captura con
 * el orbe y §6 la pantalla de ruta con navegación. Pendientes §3 la compuerta
 * humana de revisión —hay una parada cuando el motor se niega a rutear, pero
 * no el editor de entidades—, §4 el estado de escalamiento, §5 el cronómetro
 * de expiración de la solicitud y §7 la entrada manual estructurada.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type {
  Caso,
  Candidato,
  Coordenada,
  Handshake,
  RutaResponse,
} from "@/lib/types";
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
import { PantallaInicio } from "@/components/campo/PantallaInicio";
import { EstadoHospitales } from "@/components/campo/EstadoHospitales";
import {
  armarTablero,
  type CasoTablero,
  type SedeEstado,
} from "@/lib/tablero-modelo";
import {
  MINIMO_CARACTERES,
  PantallaCaptura,
} from "@/components/campo/PantallaCaptura";
import { DetalleCaso } from "@/components/campo/DetalleCaso";
import { PantallaRuta } from "@/components/campo/PantallaRuta";
import { InformePaciente } from "@/components/campo/InformePaciente";
import { TarjetaCandidato } from "@/components/campo/TarjetaCandidato";
import { RevisionRequerida } from "@/components/campo/RevisionRequerida";
import { RevisionClinica } from "@/components/campo/RevisionClinica";
import { confirmar as confirmarRevision, type CamposRevision } from "@/lib/revision-clinica";
import { ChevronLeft, Send } from "lucide-react";
import { FotoCalle } from "@/components/mapa/FotoCalle";
import * as api from "@/lib/api";
import { ErrorApi, type CodigoError } from "@/lib/api";
import * as flota from "@/lib/api-moviles";
import {
  debeEnviar,
  decidirRastreo,
  INTERVALO_REPORTE_MS,
  MENSAJE_SIN_RASTREO,
} from "@/lib/posicion-modelo";

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

/**
 * Dos columnas en escritorio, apiladas en móvil.
 *
 * La izquierda es la decisión —lo que se toca—; la derecha, el contexto que
 * la sostiene: el mapa, el detalle del caso. En móvil `lateral` cae debajo,
 * que es exactamente donde estaba antes de que existiera este componente:
 * ningún orden cambia al encoger la pantalla.
 *
 * `lg:sticky` para que el mapa no se pierda mientras se recorre un ranking
 * largo — es lo que hace que la columna derecha valga la pena y no sea solo
 * relleno del ancho.
 */
function Columnas({
  principal,
  lateral,
}: {
  principal: React.ReactNode;
  lateral?: React.ReactNode;
}) {
  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
      <div className="min-w-0">{principal}</div>
      {/*
        La rejilla se mantiene aunque no haya nada a la derecha: si la columna
        izquierda se estirara a todo el ancho, una fila de caso mediría metro y
        medio y el botón principal se convertiría en una franja.
      */}
      {lateral && (
        <div className="mt-6 min-w-0 lg:sticky lg:top-6 lg:mt-0">{lateral}</div>
      )}
    </div>
  );
}

/** Ventana entre el fin del dictado y el análisis automático. */
const VENTANA_AUTO_MS = 3000;

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

  // ── Posición del móvil hacia el CRUE (tarea 3.7) ───────────────
  //
  // SOLO CON UN CASO ABIERTO. Un turno de 12 h con el GPS encendido de punta a
  // punta es una batería muerta y, peor, el rastreo continuo de alguien que no
  // está atendiendo a nadie: se rastrea el traslado, no al trabajador. La
  // decisión vive en `decidirRastreo` —sin React y probada— y la pantalla dice
  // por qué cuando no se está reportando.
  const rastreo = decidirRastreo({
    casoAbierto: caso !== null,
    movilId: unidad?.id ?? null,
    estadoGeo: geo.estado,
  });
  const [avisoPosicion, setAvisoPosicion] = useState<string | null>(null);
  // Ref y no dependencias: `geo.origen` cambia con cada arreglo del GPS (uno o
  // dos por segundo) y meterlo en el efecto reiniciaría el temporizador tan a
  // menudo que el throttle no existiría.
  const contextoRef = useRef({ geo, unidad });
  // En un efecto sin dependencias —igual que `analizarRef` más abajo—: escribir
  // un ref mientras se pinta es lo que React desaconseja, y así se refresca
  // tras cada render, antes de que ningún temporizador lo lea.
  useEffect(() => {
    contextoRef.current = { geo, unidad };
  });
  const ultimoReporteRef = useRef<number | null>(null);

  useEffect(() => {
    if (!rastreo.rastreando) return;
    let vivo = true;

    const reportar = async () => {
      const { geo: g, unidad: u } = contextoRef.current;
      if (!vivo || !g.origen || !u) return;
      // El temporizador solo despierta; quien decide si sale un reporte es
      // `debeEnviar`. Así un GPS que parpadea (y reinicia este efecto) no
      // puede convertirse en una ráfaga de peticiones.
      if (!debeEnviar(ultimoReporteRef.current, Date.now())) return;
      ultimoReporteRef.current = Date.now();

      try {
        await flota.reportarEstado(u.id, {
          lat: g.origen.lat,
          lng: g.origen.lng,
          // El radio de error viaja: en interiores son cientos de metros y el
          // mapa del CRUE tiene que poder dibujar esa duda.
          precisionM: g.precisionM,
          // Con un caso abierto el móvil está ocupado. Es lo único que este
          // dispositivo puede afirmar sin inventarse nada.
          disponible: false,
        });
        if (vivo) setAvisoPosicion(null);
      } catch (e) {
        // Un 4xx no se arregla repitiéndolo cada 15 s durante todo el turno.
        if (flota.esDefinitivo(e)) {
          vivo = false;
          setAvisoPosicion(flota.mensajeDeError(e));
        }
      }
    };

    void reportar();
    const id = setInterval(() => void reportar(), INTERVALO_REPORTE_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [rastreo.rastreando]);

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

  // ── Los casos del turno ────────────────────────────────────────
  //
  // Se piden solo mientras la pantalla de inicio está a la vista: es la única
  // que los muestra, y dejar el polling corriendo durante un dictado gastaría
  // datos en una zona donde puede que no haya.
  //
  // Agrupar, ordenar y filtrar es de `lib/tablero-modelo.ts`. Aquí solo se
  // trae la foto y se le pone la hora.
  const [tablero, setTablero] = useState<CasoTablero[]>([]);
  /** La congestión de las 84 sedes, que ya venía en /estado y nadie pintaba. */
  const [red, setRed] = useState<SedeEstado[]>([]);

  useEffect(() => {
    if (fase !== "inicio") return;

    let vivo = true;
    const cargar = async () => {
      const d = await api.estado().catch(() => null);
      if (!vivo || !d) return;
      setTablero(armarTablero(d.casos, d.handshakes, Date.now()));
      setRed(d.congestion);
    };

    void cargar();
    const id = setInterval(() => void cargar(), 3000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [fase]);

  // ── Dónde está el paciente ─────────────────────────────────────
  //
  // `GET /estado` NO devuelve `origen`: es uno de los dos campos que no salen
  // del servidor (ver la lista blanca de `estado.service.ts`). Pero cuando
  // este dispositivo dicta un caso, las coordenadas SÍ llegan en la respuesta
  // de `POST /triage` — ya están en este navegador.
  //
  // Guardarlas aquí no expone nada nuevo: es memoria del proceso, no se
  // persiste y muere al recargar. Es lo que permite que el detalle de un caso
  // dictado en este turno enseñe dónde se recogió al paciente, sin inventarse
  // un endpoint que todavía no existe.
  // Estado y no `useRef`: un ref leído durante el render no vuelve a pintar
  // cuando cambia, así que el detalle de un caso recién dictado se quedaría
  // sin mapa hasta el siguiente render por otra causa.
  // `null` = ya se le preguntó a core y no lo tiene (caso reiniciado, 404).
  // Distinguirlo de "todavía no se pregunta" es lo que evita re-pedir en bucle
  // y lo que le permite al detalle decir "consultando" vs "no disponible".
  const [origenes, setOrigenes] = useState<ReadonlyMap<string, Coordenada | null>>(
    () => new Map(),
  );

  /** Qué caso está abierto en el panel de detalle del inicio. */
  const [abierto, setAbierto] = useState<string | null>(null);

  const detalle = useMemo(
    () => tablero.find((t) => t.caso.id === abierto) ?? null,
    [abierto, tablero],
  );

  // Los casos que este dispositivo no dictó (el turno sintético, WhatsApp,
  // otra tripulación) no traen origen en /estado — y no es un olvido. Se pide
  // por caso a GET /casos/:id/origen, el endpoint con autorización propia que
  // el contrato dejó previsto, y solo para el caso que el paramédico abrió:
  // mirar uno deja rastro; raspar el listado no es posible.
  useEffect(() => {
    if (!abierto || origenes.has(abierto)) return;
    const id = abierto;
    let vivo = true;
    api
      .origenCaso(id)
      .then((r) => {
        if (vivo) setOrigenes((previo) => new Map(previo).set(id, r.origen));
      })
      .catch(() => {
        // 404 o core caído: se anota el "no" para no re-preguntar en bucle.
        if (vivo) setOrigenes((previo) => new Map(previo).set(id, null));
      });
    return () => {
      vivo = false;
    };
  }, [abierto, origenes]);

  // ── Dictado por voz ────────────────────────────────────────────
  const anexarTranscrito = useCallback(
    (fragmento: string) => setTexto((t) => (t + " " + fragmento).trim()),
    [],
  );

  /**
   * ── EL ANÁLISIS ARRANCA SOLO AL TERMINAR DE DICTAR ───────────────
   *
   * Tocar «Analizar y rutear» después de dictar era un gesto de más en la
   * única parte del flujo donde los segundos se cuentan de verdad. El dictado
   * termina, el sistema busca: CIE-10, servicios REPS y ranking, sin que nadie
   * toque nada.
   *
   * Lo que NO cambia: **esto no despacha**. Extrae y rankea; elegir la sede y
   * pulsar despachar sigue siendo del paramédico. La regla 6 del repo — PULSO
   * propone, el humano decide — se aplica a lo que tiene consecuencia, y una
   * lista ordenada no la tiene. Quitar un toque antes de la decisión es
   * exactamente lo contrario de decidir por él.
   *
   * ── POR QUÉ HAY UNA VENTANA DE GRACIA ────────────────────────────
   * Tres segundos, con la cuenta a la vista y un botón para cancelar:
   *
   *   1. `stop()` del reconocedor todavía puede entregar un último fragmento.
   *      Analizar en el mismo tick se comería la última frase dictada.
   *   2. Es la ventana para corregir una palabra mal entendida antes de que
   *      viaje al modelo. Escribir en el textarea la cancela sola.
   *
   * Se mide contra un instante objetivo y no descontando de un número, igual
   * que `useCuentaAtras`: si el navegador retrasa un tick, la cuenta no se
   * queda corta.
   */
  const [autoFin, setAutoFin] = useState<number | null>(null);
  const [autoRestaS, setAutoRestaS] = useState(0);

  const alTerminarDictado = useCallback(
    () => setAutoFin(Date.now() + VENTANA_AUTO_MS),
    [],
  );
  const cancelarAuto = useCallback(() => setAutoFin(null), []);

  const voz = useDictadoVoz(anexarTranscrito, alTerminarDictado);

  // `analizar` se recrea en cada render; el ref evita que el temporizador se
  // reinicie por eso y que dispare con un `texto` viejo.
  const analizarRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (autoFin === null) return;

    const id = setInterval(() => {
      const restanteMs = autoFin - Date.now();
      setAutoRestaS(Math.max(0, Math.ceil(restanteMs / 1000)));
      if (restanteMs <= 0) {
        clearInterval(id);
        setAutoFin(null);
        analizarRef.current();
      }
    }, 200);

    return () => clearInterval(id);
  }, [autoFin]);


  // ── Flujo ──────────────────────────────────────────────────────

  function nuevoCaso() {
    reiniciar();
    setFase("captura");
    // Sin unidad declarada, este es el momento de preguntarlo: antes de que
    // haya un paciente esperando y con la pantalla todavía vacía.
    if (!unidad) setPidiendoUnidad(true);
  }

  async function analizar() {
    // El disparo automático puede llegar con un dictado que no se entendió
    // (ruido, un "eh" suelto). El mismo mínimo que deshabilita el botón.
    if (texto.trim().length < MINIMO_CARACTERES) return;

    setAutoFin(null);
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

      const { caso: c, revision } = await api.triage({
        texto,
        origen,
        unidad: unidad ?? undefined,
        // Aquí hay un humano delante: si la extracción no alcanza, queremos
        // el caso para revisarlo, no un error. Regla 6 en acción.
        permitirRevision: true,
      });
      setCaso(c);
      // Lo guarda para que el detalle del inicio pueda enseñarlo después.
      setOrigenes((previo) => new Map(previo).set(c.id, c.origen));

      if (revision?.requerida) {
        setBloqueo({ codigo: revision.motivo, detalle: "confianza del parser: " + c.confianza });
        setFase("revision");
        return;
      }

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

  // En un efecto y no en el cuerpo del render: escribir un ref mientras se
  // pinta es justo lo que React desaconseja. Sin array de dependencias corre
  // tras cada render, que es lo que mantiene fresco el `texto` del cierre.
  useEffect(() => {
    analizarRef.current = () => void analizar();
  });

  /**
   * El paramédico corrigió los campos y confirmó: el caso sale con
   * `revisionHumana` y con eso la política de core lo deja pasar a /match.
   * La confianza del parser no se toca — 0.35 queda en la auditoría.
   */
  async function confirmarYRutear(campos: CamposRevision) {
    if (!caso) return;
    const revisado = confirmarRevision(
      caso,
      campos,
      unidad?.tripulante ?? unidad?.id ?? "paramedico-sin-identificar",
      new Date().toISOString(),
    );
    setCaso(revisado);
    setBloqueo(null);
    setFase("analizando");
    try {
      const m = await api.match({ caso: revisado, limite: 5 });
      setCandidatos(m.candidatos);
      setMeta({ evaluadas: m.evaluadas, compatibles: m.compatibles });
      setFase("ranking");
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo) {
        // p. ej. NO_ELIGIBLE_DESTINATION: se entendió bien y aun así no hay
        // sede. Esa pantalla ya existe y dice qué hacer (escalar al CRUE).
        setBloqueo({ codigo: e.codigo, detalle: e.message });
        setFase("revision");
        return;
      }
      setError(e instanceof Error ? e.message : "No se pudo rutear");
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
    // Salir de la captura cancela la cuenta: no puede dispararse un análisis
    // sobre una pantalla que ya no está.
    setAutoFin(null);
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

  const candidatoAceptado = useMemo(
    () => candidatos.find((c) => c.sede.codigo === handshake?.sedeCodigo) ?? null,
    [candidatos, handshake],
  );
  const sedeAceptada = candidatoAceptado?.sede;

  // ── Ruta hasta la sede aceptada ────────────────────────────────
  //
  // Se pide UNA vez, al aceptar. No se recalcula con cada arreglo del GPS:
  // Directions cuesta una llamada por invocación y el trazado completo no
  // cambia porque la ambulancia avance cien metros. Lo que sí se mueve en
  // vivo es el marcador de la unidad sobre el mapa.
  const [ruta, setRuta] = useState<RutaResponse | null>(null);
  const [cargandoRuta, setCargandoRuta] = useState(false);

  useEffect(() => {
    if (fase !== "resuelto" || !caso || !sedeAceptada) return;

    let vivo = true;
    // En un microtask: un setState síncrono dentro del efecto encadena un
    // render extra en cada montaje. Mismo patrón que useConectividad.
    queueMicrotask(() => vivo && setCargandoRuta(true));
    api
      .ruta({ origen: caso.origen, sedeCodigo: sedeAceptada.codigo })
      // Sin MAPBOX_TOKEN esto es un 503: no hay ruta que trazar. No es un
      // error que mostrar — la pantalla cae al botón de navegación externa.
      .catch(() => null)
      .then((r) => {
        if (!vivo) return;
        setRuta(r);
        setCargandoRuta(false);
      });

    return () => {
      vivo = false;
    };
  }, [fase, caso, sedeAceptada]);

  return (
    <div className="relative min-h-screen">
      <FondoOperativo />

      {/*
        El ancho crece con la pantalla. Antes era `max-w-lg` siempre: en un
        portátil quedaba una columna de teléfono centrada y dos tercios de
        pantalla negra. La consola de campo se usa en el móvil, pero también en
        el del CRUE y en el proyector del demo.
      */}
      <main className="relative z-10 mx-auto max-w-lg p-4 pb-24 lg:max-w-7xl lg:p-6 2xl:max-w-[96rem]">
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

        {/* Rastreo: se dice SIEMPRE, esté activo o no. Un mapa que no reporta
            y no lo explica hace creer al paramédico que el CRUE lo está
            viendo. Ver MENSAJE_SIN_RASTREO en lib/posicion-modelo.ts. */}
        <p className="-mt-2 mb-4 px-1 text-[11px] text-[color:var(--color-texto-tenue)]">
          {avisoPosicion ? (
            <span className="text-[color:var(--color-alerta)]">
              Posición no reportada — {avisoPosicion}
            </span>
          ) : rastreo.rastreando ? (
            <>Reportando posición al CRUE cada 15 s</>
          ) : (
            MENSAJE_SIN_RASTREO[rastreo.motivo]
          )}
        </p>

        {fase !== "inicio" && (
          <button
            onClick={volverAlInicio}
            className="mb-4 -ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm text-[color:var(--color-texto-tenue)] transition-colors hover:text-[color:var(--color-texto)]"
          >
            <ChevronLeft className="size-4" strokeWidth={2.5} aria-hidden />
            Inicio
          </button>
        )}

      {fase === "revision" &&
        bloqueo &&
        // Los dos motivos que un humano puede resolver aquí mismo abren el
        // formulario; el resto (p. ej. ninguna sede cumple) conserva su
        // pantalla, porque corregir campos no los arregla.
        (caso &&
        (bloqueo.codigo === "PULSO_LOW_CONFIDENCE" ||
          bloqueo.codigo === "PULSO_INCONSISTENT_TRIAGE") ? (
          <RevisionClinica
            caso={caso}
            detalle={bloqueo.detalle}
            onConfirmar={(campos) => void confirmarYRutear(campos)}
            onVolver={() => {
              setBloqueo(null);
              setT0(null);
              setFase("captura");
            }}
          />
        ) : (
          <RevisionRequerida
            codigo={bloqueo.codigo}
            detalle={bloqueo.detalle}
            onVolver={() => {
              setBloqueo(null);
              setT0(null);
              setFase("captura");
            }}
          />
        ))}

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
          <Columnas
            principal={
              <PantallaInicio
                items={tablero}
                seleccionado={abierto}
                onNuevo={nuevoCaso}
                onSeleccionar={(id) => setAbierto((a) => (a === id ? null : id))}
              />
            }
            // Sin caso abierto, la columna derecha no se queda vacía: enseña
            // cómo está la red. Es la pregunta que hoy se hace por radio.
            lateral={
              !detalle ? (
                <EstadoHospitales sedes={red} />
              ) : (
                <DetalleCaso
                  caso={detalle.caso}
                  handshake={detalle.handshake}
                  origen={origenes.get(detalle.caso.id) ?? null}
                  origenResuelto={origenes.has(detalle.caso.id)}
                  posicionUnidad={geo.origen}
                  mapa={
                    !!origenes.get(detalle.caso.id) && (
                      <MapaDespacho
                        origen={origenes.get(detalle.caso.id)!}
                        candidatos={[]}
                        sedeSeleccionada={null}
                        unidad={geo.origen}
                        ubicacionDemo={false}
                      />
                    )
                  }
                  // Reabrir un caso previo todavía no restaura su punto exacto
                  // del flujo — eso llega con §1 completo. Por ahora lleva a la
                  // captura, que es donde el paramédico puede actuar.
                  onContinuar={
                    detalle.etapa === "aceptado"
                      ? undefined
                      : () => setFase("captura")
                  }
                  onCerrar={() => setAbierto(null)}
                />
              )
            }
          />
        )}

        {(fase === "captura" || fase === "analizando") && (
          <Columnas
            principal={
              <PantallaCaptura
                texto={texto}
                // Escribir es corregir: cancela el disparo automático para que
                // nadie vea salir su caso a medio arreglar.
                onTexto={(t) => {
                  cancelarAuto();
                  setTexto(t);
                }}
                onDictadoDemo={cargarDictado}
                onCasoReal={cargarCasoReal}
                casoReal={casoReal}
                escuchando={voz.escuchando}
                onMicrofono={() => {
                  cancelarAuto();
                  voz.alternar();
                }}
                vozSoportada={voz.soportado}
                falloDictado={voz.fallo}
                parcial={voz.parcial}
                transcribiendo={voz.transcribiendo}
                medidorRef={voz.medidorRef}
                onAnalizar={analizar}
                analizando={fase === "analizando"}
                sinSenal={sinSenal}
                onCancelar={volverAlInicio}
                autoRestaS={autoFin === null ? null : autoRestaS}
                onCancelarAuto={cancelarAuto}
              />
            }
            // Va en esta pantalla y no en el inicio porque aquí SÍ se puede
            // hacer algo con él: este punto es el `origen` que alimenta el
            // ranking. Un GPS desviado se ve y se corrige antes de analizar;
            // después ya viajó dentro de la decisión.
            lateral={
              <section>
                <p className="mb-2 text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
                  El destino se busca desde aquí
                </p>
                <MapaUnidad
                  posicion={geo.origen}
                  estado={geo.estado}
                  precisionM={geo.precisionM}
                />
              </section>
            }
          />
        )}

        {/*
          ── RANKING, ESPERA Y RUTA ──────────────────────────────────
          Las tres comparten forma: a la izquierda la decisión, a la derecha el
          mapa. En móvil se apilan en ese mismo orden, que es el de siempre.
        */}
        {caso && (fase === "ranking" || fase === "esperando") && (
          <Columnas
            principal={
              <>
                <InformePaciente caso={caso} />

                {fase === "ranking" && (
                  <section>
                    <p className="text-xs text-[color:var(--color-texto-tenue)] mb-3">
                      {meta.evaluadas} sedes evaluadas · {meta.compatibles} con
                      los servicios requeridos habilitados
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
                    <div className="mb-3 flex justify-center latido" aria-hidden>
                      <Send className="size-8 text-[color:var(--color-info)]" strokeWidth={2} />
                    </div>
                    <p className="font-semibold">Solicitud enviada</p>
                    <p className="text-sm text-[color:var(--color-texto-tenue)] mt-1">
                      Esperando confirmación del jefe de urgencias…
                    </p>
                  </section>
                )}
              </>
            }
            lateral={
              <MapaDespacho
                origen={caso.origen}
                candidatos={candidatos}
                sedeSeleccionada={handshake?.sedeCodigo ?? null}
                ubicacionDemo={ubicacionDemo}
              />
            }
          />
        )}

        {fase === "resuelto" && handshake && caso && (
          <Columnas
            principal={
              <>
                <PantallaRuta
                  caso={caso}
                  candidato={candidatoAceptado}
                  ruta={ruta}
                  cargandoRuta={cargandoRuta}
                  transcurrido={transcurrido}
                  onEntregado={volverAlInicio}
                  // Reabrir el ruteo con el evento de auditoría es §6 completo
                  // y todavía no está: por ahora se vuelve al ranking, que es
                  // donde el paramédico puede elegir otra sede.
                  onNovedad={() => setFase("ranking")}
                />

                {/* El número del pitch: del dictado a la cama confirmada. */}
                <p className="mt-4 text-center text-xs text-[color:var(--color-texto-tenue)]">
                  <span className="text-2xl font-bold tabular text-[color:var(--color-texto)]">
                    {transcurrido.toFixed(0)}s
                  </span>
                  <br />
                  del dictado a la cama confirmada
                </p>
              </>
            }
            lateral={
              <>
                <MapaDespacho
                  origen={caso.origen}
                  candidatos={candidatos}
                  sedeSeleccionada={handshake.sedeCodigo}
                  ubicacionDemo={ubicacionDemo}
                />

                {/* La llegada, a nivel de calle: para reconocer la entrada de
                    urgencias antes de estar delante de ella. */}
                {sedeAceptada && (
                  <FotoCalle
                    coord={sedeAceptada.coord}
                    titulo={sedeAceptada.nombre}
                  />
                )}
              </>
            }
          />
        )}
      </main>
    </div>
  );
}
