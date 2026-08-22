"use client";

/**
 * Dictado por voz con Web Speech API.
 *
 * ⚠️ La Web Speech API NO está en las typings del DOM de TypeScript: no es
 *    estándar, es un añadido de Chrome que otros navegadores copiaron. Por eso
 *    aquí se declara el mínimo que usamos en vez de tirar de `any`. Es la
 *    diferencia entre "no sabemos qué es esto" y "sabemos exactamente qué le
 *    pedimos al navegador".
 *
 * Soporte real: Chrome y Edge de escritorio y Android. Safari de iOS solo con
 * `webkitSpeechRecognition` y de forma irregular. Si no hay soporte, el hook
 * lo dice y el textarea sigue siendo el camino — que es la regla del carril de
 * Juan: si niego el permiso del micrófono, la app sigue funcionando.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── Lo mínimo de la Web Speech API que este hook usa ──────────────

interface ResultadoVoz {
  isFinal: boolean;
  0: { transcript: string };
}

interface EventoResultado {
  resultIndex: number;
  results: { length: number; [i: number]: ResultadoVoz };
}

interface Reconocedor {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoResultado) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
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

// ──────────────────────────────────────────────────────────────────

export function useDictadoVoz(alTranscribir: (fragmento: string) => void) {
  const [escuchando, setEscuchando] = useState(false);
  const [soportado, setSoportado] = useState(true);
  const recRef = useRef<Reconocedor | null>(null);

  // El callback cambia en cada render de la página; guardarlo en un ref evita
  // tener que reconstruir el reconocedor —y perder el dictado en curso— solo
  // porque el padre se volvió a renderizar.
  const alTranscribirRef = useRef(alTranscribir);
  useEffect(() => {
    alTranscribirRef.current = alTranscribir;
  }, [alTranscribir]);

  // Detener al desmontar: un reconocedor vivo deja el micrófono abierto.
  useEffect(() => {
    return () => recRef.current?.stop();
  }, []);

  const alternar = useCallback(() => {
    if (escuchando) {
      recRef.current?.stop();
      setEscuchando(false);
      return;
    }

    const Reconocedor = constructorDisponible();
    if (!Reconocedor) {
      setSoportado(false);
      return;
    }

    const rec = new Reconocedor();
    rec.lang = "es-CO";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
      }
      if (final) alTranscribirRef.current(final);
    };
    rec.onerror = () => setEscuchando(false);
    rec.onend = () => setEscuchando(false);
    rec.start();

    recRef.current = rec;
    setEscuchando(true);
  }, [escuchando]);

  return { escuchando, soportado, alternar };
}
