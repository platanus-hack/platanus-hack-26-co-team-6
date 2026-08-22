"use client";

/**
 * El fondo de /campo: los mismos hilos de luz WebGL de la landing
 * (`components/landing/WebThreads.tsx`), atenuados.
 *
 * ── POR QUÉ ATENUADO Y NO IDÉNTICO ────────────────────────────────
 * En la landing el efecto ES el contenido: pantalla completa, brillante,
 * reactivo al mouse. Aquí es una consola de trabajo que se lee de un
 * vistazo, en un celular, dentro de una ambulancia, de noche — el criterio
 * de todo `globals.css` es "alto contraste, nada de gris sobre gris". Un
 * fondo que compitiera con esa legibilidad sería peor que no tener marca.
 *
 * Así que se usan los MISMOS colores y la MISMA técnica que la landing —
 * es la marca, y por eso se pidió— pero con brillo y opacidad bajos, sin
 * grano y sin reacción al mouse: en un teléfono no hay cursor, y encender
 * ese cálculo por nada es gastar batería sin que nadie lo vea.
 *
 * `fixed` y no `absolute`: el lienzo se dimensiona una sola vez contra el
 * viewport y no contra el alto total de la página, que en /campo crece con
 * el ranking. Vive detrás de todo (`z-0`); cada pantalla ya pone su propio
 * fondo sólido donde hay datos clínicos que leer.
 */

import { useReducedMotion } from "motion/react";
import WebThreads from "@/components/landing/WebThreads";

export function FondoOperativo() {
  const sinMovimiento = useReducedMotion();

  return (
    <div aria-hidden className="fixed inset-0 z-0 pointer-events-none">
      {sinMovimiento ? (
        // Mismo fallback que la landing: un degradado estático en vez de
        // WebGL, para quien pidió menos movimiento al sistema operativo.
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,43,39,0.10), transparent 70%)",
          }}
        />
      ) : (
        <WebThreads
          color1="#ff2b27"
          color2="#ec070a"
          color3="#FFFFFF"
          speed={0.45}
          threadCount={3}
          frequency={4}
          spread={0.22}
          taper={1.0}
          position={0.5}
          fanMode="center"
          glow={0.018}
          falloff={0.45}
          thickness={1.1}
          brightness={0.22}
          opacity={0.4}
          mirror
          shimmer={false}
          grain={false}
          grainIntensity={0}
          mouseInteraction={false}
        />
      )}
    </div>
  );
}
