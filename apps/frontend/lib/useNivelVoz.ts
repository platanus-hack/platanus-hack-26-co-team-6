"use client";

/**
 * El volumen real del micrófono, escrito directo en una variable CSS.
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────
 * El orbe portado de Domu animaba solo por estado: se veía exactamente igual
 * con el paramédico gritando que en silencio absoluto. Eso es un adorno, y en
 * tarima se nota — un asistente de voz que no reacciona a la voz delata que la
 * animación es un GIF caro.
 *
 * ── POR QUÉ NO USA setState ───────────────────────────────────────
 * Esto mide 60 veces por segundo. Un `setState` por frame re-renderizaría el
 * árbol de /campo entero 60 veces por segundo para mover un `scale`. En vez de
 * eso escribe `--nivel-voz` en el nodo del orbe y deja que el CSS haga el
 * trabajo, que es donde el navegador lo hace bien.
 *
 * ── POR QUÉ UN STREAM APARTE ──────────────────────────────────────
 * La Web Speech API no da acceso al audio: te devuelve texto y se guarda el
 * PCM. Así que se abre un `getUserMedia` propio en paralelo. El navegador lo
 * permite —dos consumidores del mismo micrófono— y el permiso ya está
 * concedido porque el dictado lo pidió antes.
 *
 * Si el permiso se niega, esto no hace nada y el orbe se queda respirando. El
 * dictado sigue funcionando: son dos cosas independientes a propósito.
 */

import { useEffect, useRef } from "react";

/**
 * Suavizado exponencial del nivel. Sin esto el orbe tiembla con cada sílaba
 * y parece nervioso en vez de atento. 0.35 sube rápido y baja con inercia,
 * que es como se percibe la voz.
 */
const SUAVIZADO = 0.35;

/**
 * RMS que se considera "voz a volumen normal" y se mapea a 1.
 * Medido a un palmo del micrófono, hablando como en una ambulancia: alto.
 * Si se deja en 1 el orbe no se mueve nunca, porque el RMS de la voz humana
 * en un micrófono de portátil rara vez pasa de 0.15.
 */
const RMS_MAXIMO = 0.18;

export function useNivelVoz(
  activo: boolean,
  destino: React.RefObject<HTMLElement | null>,
) {
  // El ref evita que el efecto dependa del nodo: si el orbe se remonta, el
  // siguiente frame ya escribe en el nuevo sin reabrir el micrófono.
  const destinoRef = useRef(destino);
  useEffect(() => {
    destinoRef.current = destino;
  }, [destino]);

  useEffect(() => {
    if (!activo) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;

    let cancelado = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let animacion = 0;
    let nivel = 0;

    async function abrir() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        // Permiso negado o micrófono ocupado. El orbe se queda respirando y el
        // dictado sigue por su lado; no hay nada que reportar al usuario.
        return;
      }
      // Entre el await y aquí el usuario pudo cerrar el dictado.
      if (cancelado) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      ctx = new AudioContext();
      const fuente = ctx.createMediaStreamSource(stream);
      const analizador = ctx.createAnalyser();
      // 512 basta para medir volumen y cuesta poco. No estamos analizando
      // espectro, solo cuánta energía hay.
      analizador.fftSize = 512;
      fuente.connect(analizador);
      // Ojo: NO se conecta a ctx.destination. Hacerlo devolvería el micrófono
      // por los altavoces y provocaría acople en plena ambulancia.

      const muestras = new Float32Array(analizador.fftSize);

      const medir = () => {
        analizador.getFloatTimeDomainData(muestras);

        let suma = 0;
        for (const m of muestras) suma += m * m;
        const rms = Math.sqrt(suma / muestras.length);

        const crudo = Math.min(1, rms / RMS_MAXIMO);
        nivel += (crudo - nivel) * SUAVIZADO;

        destinoRef.current.current?.style.setProperty(
          "--nivel-voz",
          nivel.toFixed(3),
        );
        animacion = requestAnimationFrame(medir);
      };
      medir();
    }

    void abrir();

    return () => {
      cancelado = true;
      cancelAnimationFrame(animacion);
      // Cerrar el track es obligatorio: si no, el indicador de micrófono del
      // navegador se queda encendido y el usuario cree que lo seguimos oyendo.
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      destinoRef.current.current?.style.setProperty("--nivel-voz", "0");
    };
  }, [activo]);
}
