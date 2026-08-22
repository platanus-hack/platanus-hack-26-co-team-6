"use client";

/**
 * El orbe del asistente de voz.
 *
 * Portado del asistente de `~/dev/Domu task` y adaptado al dominio: allá tenía
 * estados de llamada (hablando/silenciado/colgado) y aquí tiene estados de
 * dictado clínico.
 *
 * Todo el movimiento vive en CSS (`app/campo-orbe.css`); este componente solo
 * pone el estado y sigue el puntero. Es a propósito: una animación de 60 fps
 * conducida por React re-renderizaría el árbol entero cada frame.
 *
 * El nivel de voz NO entra por props. Lo escribe `useNivelVoz` directamente en
 * la variable CSS `--nivel-voz` del nodo, por la misma razón.
 */

import { useEffect, useRef, useState } from "react";

export type EstadoOrbe = "inactivo" | "escuchando" | "procesando" | "sin-senal";

/** Cuánto dura el guiño al tocarlo. Igual que la animación del CSS. */
const GUINO_MS = 650;

/** Sin puntero durante esto, los ojos vuelven al centro y miran solos. */
const QUIETO_MS = 4000;

export function OrbeVoz({
  estado = "inactivo",
  tam = "min(48vw, 15rem)",
  refExterna,
}: {
  estado?: EstadoOrbe;
  /** Cualquier medida CSS. En campo se quiere grande: se toca con guantes. */
  tam?: string;
  /** Lo usa useNivelVoz para escribir `--nivel-voz` sin pasar por React. */
  refExterna?: React.RefObject<HTMLDivElement | null>;
}) {
  const propio = useRef<HTMLDivElement>(null);
  const envoltura = refExterna ?? propio;
  const temporizador = useRef<number | null>(null);
  const [guina, setGuina] = useState(false);

  // Los ojos siguen el puntero. En un teléfono esto no ocurre nunca —el dedo
  // no genera `pointermove` continuo—, así que en campo el orbe mira solo. No
  // es una degradación: es el comportamiento normal en el dispositivo real, y
  // el seguimiento existe para cuando el demo se proyecta desde un portátil.
  useEffect(() => {
    const el = envoltura.current;
    if (!el) return;

    el.setAttribute("data-quieto", "1");
    const acotar = (v: number) => Math.max(-1, Math.min(1, v));

    const alMover = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      el.style.setProperty("--ojo-x", `${(acotar(dx) * 9).toFixed(2)}%`);
      el.style.setProperty("--ojo-y", `${(acotar(dy) * 7).toFixed(2)}%`);
      el.removeAttribute("data-quieto");

      if (temporizador.current) window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(() => {
        el.style.setProperty("--ojo-x", "0%");
        el.style.setProperty("--ojo-y", "0%");
        el.setAttribute("data-quieto", "1");
      }, QUIETO_MS);
    };

    window.addEventListener("pointermove", alMover);
    return () => {
      window.removeEventListener("pointermove", alMover);
      if (temporizador.current) window.clearTimeout(temporizador.current);
    };
  }, [envoltura]);

  function guinar() {
    if (guina) return;
    setGuina(true);
    window.setTimeout(() => setGuina(false), GUINO_MS);
  }

  return (
    <div
      ref={envoltura}
      onPointerDown={guinar}
      data-estado={estado}
      style={{ ["--orbe-tam" as string]: tam }}
      className={`orbe-envoltura select-none ${guina ? "guina" : ""}`}
      // Decorativo: lo que el orbe comunica se dice también en texto justo
      // debajo, así que un lector de pantalla no se pierde nada aquí.
      aria-hidden
    >
      <span className="orbe-onda" />
      <span className="orbe-onda o2" />
      <span className="orbe-onda o3" />
      <span className="orbe-halo" />
      <span className="orbe-halo h2" />
      <div className="orbe">
        <span className="orbe-mancha m1" />
        <span className="orbe-mancha m2" />
        <span className="orbe-mancha m3" />
        <span className="orbe-brillo" />
        <div className="orbe-ojos">
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
