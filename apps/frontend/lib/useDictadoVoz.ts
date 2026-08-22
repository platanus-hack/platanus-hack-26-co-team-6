"use client";

/**
 * Dictado por voz.
 *
 * ⚠️ La Web Speech API NO está en las typings del DOM de TypeScript: no es
 *    estándar, es un añadido de Chrome que otros navegadores copiaron. Por eso
 *    aquí se declara el mínimo que usamos en vez de tirar de `any`.
 *
 * Soporte real: Chrome y Edge de escritorio y Android. Safari de iOS solo con
 * `webkitSpeechRecognition` y de forma irregular. Si no hay soporte, el hook lo
 * dice y el textarea sigue siendo el camino — si niego el permiso del
 * micrófono, la app tiene que seguir funcionando.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  POR QUÉ ESTE HOOK ES MÁS COMPLICADO DE LO QUE PARECE
 * ═══════════════════════════════════════════════════════════════════
 * La versión ingenua —crear el reconocedor, `start()`, y apagar en `onend`—
 * falla de cuatro formas distintas, y las cuatro se veían como "el dictado no
 * funciona":
 *
 *  1. `continuous: true` NO significa continuo. Chrome corta la sesión sola
 *     tras unos segundos de silencio y dispara `onend`. Apagar ahí hace que el
 *     botón se desactive solo mientras el paramédico piensa qué decir. Aquí se
 *     reinicia mientras el usuario no haya pulsado detener.
 *
 *  2. `start()` LANZA si ya hay una sesión viva (`InvalidStateError`). Sin
 *     try/catch, la excepción se come el `setEscuchando(true)` y el botón deja
 *     de responder para siempre, sin un solo mensaje.
 *
 *  3. Los errores eran mudos. Permiso denegado, sin micrófono o sin red se
 *     trataban igual: apagar en silencio. El usuario pulsa, no pasa nada y no
 *     hay forma de saber por qué.
 *
 *  4. EL MICRÓFONO NO SE COMPARTE SOLO. El orbe necesita el volumen real, que
 *     exige `getUserMedia`, y la Web Speech API abre el micrófono por su
 *     cuenta sin dar acceso al audio. Pedir los dos a la vez lanza dos
 *     diálogos de permiso en paralelo, y el segundo aborta el reconocedor.
 *     Por eso aquí el permiso se pide UNA vez, primero, y el reconocedor
 *     arranca cuando ya está concedido.
 * ═══════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api";

// ── Lo mínimo de la Web Speech API que este hook usa ──────────────

interface ResultadoVoz {
  isFinal: boolean;
  0: { transcript: string };
}

interface EventoResultado {
  resultIndex: number;
  results: { length: number; [i: number]: ResultadoVoz };
}

interface EventoError {
  error: string;
}

interface Reconocedor {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoResultado) => void) | null;
  onerror: ((e: EventoError) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type ConstructorReconocedor = new () => Reconocedor;

interface VentanaConVoz {
  SpeechRecognition?: ConstructorReconocedor;
  webkitSpeechRecognition?: ConstructorReconocedor;
}

function constructorDisponible(): ConstructorReconocedor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as VentanaConVoz;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ── Errores, en cristiano ─────────────────────────────────────────

export type FalloDictado =
  | "sin-soporte"
  | "sin-permiso"
  | "sin-microfono"
  | "sin-red"
  | "desconocido";

export const MENSAJE_FALLO: Record<FalloDictado, string> = {
  "sin-soporte":
    "Este navegador no transcribe por su cuenta y el servidor de voz no responde. Escribe el caso: el flujo es idéntico.",
  "sin-permiso":
    "Sin permiso de micrófono. Actívalo en el candado de la barra de direcciones y vuelve a intentar.",
  "sin-microfono": "No se detecta ningún micrófono conectado.",
  "sin-red":
    "El dictado necesita conexión: el reconocimiento ocurre en el servidor del navegador.",
  desconocido: "No se pudo iniciar el dictado. Escribe el caso o reintenta.",
};

/** Traduce el código del navegador a algo que se le pueda decir a alguien. */
function traducirError(codigo: string): FalloDictado {
  switch (codigo) {
    case "not-allowed":
    case "service-not-allowed":
      return "sin-permiso";
    case "audio-capture":
      return "sin-microfono";
    case "network":
      return "sin-red";
    default:
      return "desconocido";
  }
}

// ── Medición del volumen ──────────────────────────────────────────

/** Sube rápido y baja con inercia: así el orbe se ve atento y no nervioso. */
const SUAVIZADO = 0.35;

/**
 * RMS que se toma por "voz a volumen normal" y se mapea a 1. La voz humana en
 * el micrófono de un portátil rara vez pasa de 0.15, así que normalizar contra
 * 1 dejaría el orbe inmóvil.
 */
const RMS_MAXIMO = 0.18;

// ──────────────────────────────────────────────────────────────────

export function useDictadoVoz(alTranscribir: (fragmento: string) => void) {
  const [escuchando, setEscuchando] = useState(false);
  const [soportado, setSoportado] = useState(true);
  const [fallo, setFallo] = useState<FalloDictado | null>(null);
  /** Lo que se está oyendo AHORA, todavía sin confirmar. Ver `onresult`. */
  const [parcial, setParcial] = useState("");
  /** Solo en el camino de servidor: el audio ya se envió y se espera texto. */
  const [transcribiendo, setTranscribiendo] = useState(false);

  const recRef = useRef<Reconocedor | null>(null);
  /** Lo que el USUARIO quiere. Distinto de `escuchando`, que es lo que hay. */
  const deseadoRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  /** Nodo donde se escribe --nivel-voz. Lo fija el componente del orbe. */
  const medidorRef = useRef<HTMLElement | null>(null);

  // El callback cambia en cada render del padre; guardarlo en un ref evita
  // reconstruir el reconocedor —y perder el dictado en curso— por eso.
  const alTranscribirRef = useRef(alTranscribir);
  useEffect(() => {
    alTranscribirRef.current = alTranscribir;
  }, [alTranscribir]);

  // ── Nivel de voz ────────────────────────────────────────────────

  const pararMedidor = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    // Soltar el track es obligatorio: si no, el indicador de micrófono del
    // navegador se queda encendido y el usuario cree que seguimos oyéndole.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    medidorRef.current?.style.setProperty("--nivel-voz", "0");
  }, []);

  /**
   * Arranca el analizador sobre un stream ya concedido.
   *
   * Escribe en una variable CSS y no en el estado a propósito: esto corre 60
   * veces por segundo, y un `setState` por frame re-renderizaría la consola
   * entera para mover un `scale`.
   */
  const arrancarMedidor = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const analizador = ctx.createAnalyser();
    // 512 basta para medir energía; no estamos analizando espectro.
    analizador.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analizador);
    // NO se conecta a ctx.destination: devolvería el micrófono por los
    // altavoces y provocaría acople dentro de la ambulancia.

    const muestras = new Float32Array(analizador.fftSize);
    let nivel = 0;

    const medir = () => {
      analizador.getFloatTimeDomainData(muestras);
      let suma = 0;
      for (const m of muestras) suma += m * m;
      const crudo = Math.min(1, Math.sqrt(suma / muestras.length) / RMS_MAXIMO);
      nivel += (crudo - nivel) * SUAVIZADO;
      medidorRef.current?.style.setProperty("--nivel-voz", nivel.toFixed(3));
      rafRef.current = requestAnimationFrame(medir);
    };
    medir();
  }, []);

  // ── Grabación + transcripción en servidor ───────────────────────
  //
  // El camino para Firefox y Safari/iOS, que no tienen Web Speech API.

  const grabadoraRef = useRef<MediaRecorder | null>(null);

  /**
   * Elige un contenedor que este navegador sepa grabar Y que el proveedor de
   * STT sepa leer. El orden no es casual: webm/opus es lo que graba Chrome y
   * Firefox; mp4 es lo único que graba Safari.
   */
  const tipoGrabacion = useCallback((): string | undefined => {
    if (typeof MediaRecorder === "undefined") return undefined;
    const candidatos = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    return candidatos.find((t) => MediaRecorder.isTypeSupported(t));
  }, []);

  const arrancarGrabacion = useCallback((stream: MediaStream) => {
    const mime = tipoGrabacion();
    if (typeof MediaRecorder === "undefined" || !mime) {
      setSoportado(false);
      setFallo("sin-soporte");
      deseadoRef.current = false;
      pararMedidor();
      return;
    }

    const trozos: Blob[] = [];
    const grabadora = new MediaRecorder(stream, { mimeType: mime });

    grabadora.ondataavailable = (e) => {
      if (e.data.size > 0) trozos.push(e.data);
    };

    grabadora.onstop = async () => {
      pararMedidor();
      setEscuchando(false);
      if (trozos.length === 0) return;

      // El texto no aparece hasta que se suelta el botón: el proveedor
      // necesita el audio completo. Por eso se avisa de que está trabajando —
      // sin esto son varios segundos de pantalla muda, indistinguibles de que
      // no hubiera pasado nada.
      setTranscribiendo(true);
      try {
        const { texto } = await api.transcribir(
          new Blob(trozos, { type: mime }),
        );
        if (texto.trim()) alTranscribirRef.current(texto.trim());
      } catch (e) {
        // 503 = el servidor de voz no está disponible. No es culpa de quien
        // dicta, y el textarea sigue ahí.
        setFallo(
          (e as { status?: number })?.status === 503
            ? "sin-soporte"
            : "desconocido",
        );
      } finally {
        setTranscribiendo(false);
      }
    };

    grabadoraRef.current = grabadora;
    grabadora.start();
    setEscuchando(true);
    setFallo(null);
  }, [pararMedidor, tipoGrabacion]);

  // ── Reconocedor ─────────────────────────────────────────────────

  const crearYArrancar = useCallback(() => {
    const Reconocedor = constructorDisponible();
    if (!Reconocedor) {
      setSoportado(false);
      setFallo("sin-soporte");
      deseadoRef.current = false;
      setEscuchando(false);
      return;
    }

    const rec = new Reconocedor();
    rec.lang = "es-CO";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let final = "";
      let enCurso = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else enCurso += r[0].transcript;
      }
      // Lo interino se pinta aparte, en gris: da respuesta inmediata mientras
      // se habla sin ensuciar el texto real, que solo crece con lo confirmado.
      setParcial(enCurso);
      if (final) {
        alTranscribirRef.current(final);
        setParcial("");
      }
    };

    rec.onerror = (e) => {
      const tipo = traducirError(e?.error ?? "");

      // 'no-speech' y 'aborted' son ruido operativo, no fallos: el primero
      // salta con un silencio largo —normal mientras se piensa— y el segundo
      // al detener. Ninguno merece un mensaje ni apagar el dictado.
      if (e?.error === "no-speech" || e?.error === "aborted") return;

      setFallo(tipo);
      // Un permiso denegado no se arregla reintentando: pararlo evita un bucle
      // de reinicios contra una puerta cerrada.
      if (tipo === "sin-permiso" || tipo === "sin-microfono") {
        deseadoRef.current = false;
        setEscuchando(false);
        pararMedidor();
      }
    };

    rec.onend = () => {
      // Aquí está el arreglo del bug #1: `continuous` no es continuo. Si el
      // usuario no ha pulsado detener, se vuelve a levantar la sesión.
      if (deseadoRef.current) {
        try {
          rec.start();
          return;
        } catch {
          // Si no deja reiniciar, se cae con elegancia en vez de dejar el
          // botón encendido mintiendo sobre que sigue escuchando.
        }
      }
      setEscuchando(false);
      setParcial("");
      pararMedidor();
    };

    try {
      rec.start();
      recRef.current = rec;
      setEscuchando(true);
      setFallo(null);
    } catch {
      // Bug #2: `start()` lanza si ya hay sesión viva. Sin esto, la excepción
      // se comía el estado y el botón no volvía a responder nunca.
      deseadoRef.current = false;
      setEscuchando(false);
      setFallo("desconocido");
      pararMedidor();
    }
  }, [pararMedidor]);

  // ── Encendido y apagado ─────────────────────────────────────────

  const detener = useCallback(() => {
    deseadoRef.current = false;

    // Camino de servidor: `stop()` dispara `onstop`, que es quien envía el
    // audio. Ahí se apaga el medidor y el estado — aquí no, o se cortaría el
    // envío antes de empezar.
    if (grabadoraRef.current?.state === "recording") {
      grabadoraRef.current.stop();
      grabadoraRef.current = null;
      return;
    }
    grabadoraRef.current = null;

    // Camino del navegador: `stop()` procesa lo que quedaba en el buffer;
    // `abort()` lo tiraría.
    recRef.current?.stop();
    recRef.current = null;
    setEscuchando(false);
    setParcial("");
    pararMedidor();
  }, [pararMedidor]);

  const iniciar = useCallback(async () => {
    if (deseadoRef.current) return;
    deseadoRef.current = true;
    setFallo(null);

    // Bug #4: el permiso se pide UNA vez y antes que nada. Dos peticiones
    // simultáneas —una del reconocedor, otra del medidor— abren dos diálogos
    // y el segundo aborta al primero. Con el permiso ya concedido, arrancar
    // el reconocedor después es seguro.
    //
    // El medidor es opcional: si falla, el dictado sigue y el orbe se limita
    // a respirar. Lo que no puede fallar es el dictado.
    if (navigator?.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        // Entre el await y aquí el usuario pudo pulsar detener.
        if (!deseadoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        arrancarMedidor(stream);
      } catch (e) {
        const nombre = (e as DOMException)?.name;
        if (nombre === "NotAllowedError" || nombre === "SecurityError") {
          // Sin permiso no hay dictado posible: el reconocedor iba a fallar
          // igual, así que se dice ahora en vez de tras un silencio raro.
          setFallo("sin-permiso");
          deseadoRef.current = false;
          return;
        }
        if (nombre === "NotFoundError") {
          setFallo("sin-microfono");
          deseadoRef.current = false;
          return;
        }
        // Otro fallo (micrófono ocupado por otra app): el reconocedor a veces
        // sí puede. Se sigue sin medidor.
      }
    }

    // ── Qué motor transcribe ────────────────────────────────────
    //
    // Se prefiere el del navegador cuando existe: es instantáneo, gratis y
    // muestra el texto mientras se habla. Pero NO existe en Firefox ni en
    // Safari/iOS, que juntos son buena parte de los teléfonos reales — y ahí
    // el botón de dictar no hacía nada útil.
    //
    // Cuando falta, se graba y se manda a transcribir al servidor. Se pierde
    // el texto en vivo, pero se gana algo que el motor local no da: el audio
    // queda en un Blob, así que una zona muerta ya no se lleva lo dicho.
    if (constructorDisponible()) {
      crearYArrancar();
      return;
    }

    if (streamRef.current) {
      arrancarGrabacion(streamRef.current);
      return;
    }

    // Sin Web Speech y sin micrófono no queda nada que intentar.
    setSoportado(false);
    setFallo("sin-soporte");
    deseadoRef.current = false;
  }, [arrancarMedidor, arrancarGrabacion, crearYArrancar]);

  const alternar = useCallback(() => {
    if (deseadoRef.current) detener();
    else void iniciar();
  }, [detener, iniciar]);

  // Al desmontar: un reconocedor vivo deja el micrófono abierto.
  useEffect(() => {
    return () => {
      deseadoRef.current = false;
      recRef.current?.abort();
      // La grabación se descarta sin enviar: si el usuario salió de la
      // pantalla, ya no hay dónde poner ese texto.
      if (grabadoraRef.current?.state === "recording") {
        grabadoraRef.current.ondataavailable = null;
        grabadoraRef.current.onstop = null;
        grabadoraRef.current.stop();
      }
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void ctxRef.current?.close();
    };
  }, []);

  return {
    escuchando,
    soportado,
    /** null si todo va bien. Ver MENSAJE_FALLO para el texto. */
    fallo,
    /** Lo que se oye ahora mismo, sin confirmar. Se pinta en gris. */
    parcial,
    /** true mientras el servidor transcribe el audio ya grabado. */
    transcribiendo,
    alternar,
    detener,
    /** El componente del orbe registra aquí su nodo para recibir --nivel-voz. */
    medidorRef,
  };
}
