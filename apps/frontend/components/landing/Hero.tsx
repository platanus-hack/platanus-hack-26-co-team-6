"use client";

/**
 * Hero pantalla completa. El fondo es WebThreads (React Bits, OGL): hilos
 * de luz rojos con núcleo blanco que reaccionan al mouse, y que se apagan
 * suavemente con el primer scroll. El titular entra con el flip 3D desde
 * máscara, línea por línea.
 */

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "motion/react";
import WebThreads from "./WebThreads";
import { EASE_FIRMA, EASE_SUAVE } from "./config";

const LINEAS_TITULO = [
  { texto: "Del dictado", serif: false },
  { texto: "al hospital correcto,", serif: false },
  { texto: "en menos de 90 s.", serif: true },
];

const CHIPS = ["Triage IA · CIE-10", "REPS · filtro duro", "Minutos, no kilómetros"];

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const sinMovimiento = useReducedMotion();

  // Reactividad al scroll del primer viewport: los hilos se apagan al bajar.
  const { scrollY } = useScroll();
  const apagado = useTransform(scrollY, [0, 700], [1, 0.15]);

  return (
    <section
      ref={ref}
      id="inicio"
      className="relative h-svh w-full overflow-hidden bg-fondo"
    >
      {/* ── Fondo WebThreads ──────────────────────────────────────── */}
      <motion.div
        aria-hidden
        style={sinMovimiento ? undefined : { opacity: apagado }}
        className="absolute inset-0 z-0"
      >
        {sinMovimiento ? (
          // Fallback estático para prefers-reduced-motion
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 60% 45% at 50% 45%, rgba(255,43,39,0.18), transparent 70%)",
            }}
          />
        ) : (
          <WebThreads
            color1="#ff2b27"
            color2="#ec070a"
            color3="#FFFFFF"
            speed={1.05}
            threadCount={6}
            frequency={4}
            spread={0.29}
            taper={1.0}
            position={0.5}
            fanMode="center"
            glow={0.033}
            falloff={0.3}
            thickness={1.1}
            brightness={0.6}
            opacity={1.0}
            mirror
            shimmer={false}
            grain={false}
            grainIntensity={0}
            mouseInteraction
            mouseStrength={1}
          />
        )}
      </motion.div>

      {/* Degradado hacia el contenido siguiente */}
      <div className="absolute inset-x-0 bottom-0 z-0 h-40 bg-gradient-to-b from-transparent to-fondo" />

      {/* ── Contenido ─────────────────────────────────────────────── */}
      <div
        className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-start pt-36 px-6 text-left sm:px-10 sm:pt-44 md:justify-center md:pt-0 lg:px-12"
        style={{ perspective: "1200px" }}
      >
        <h1 className="text-[clamp(2.75rem,8vw,8.5rem)] leading-[1.05] tracking-tight text-texto">
          {LINEAS_TITULO.map((linea, i) => (
            <span key={linea.texto} className="block overflow-hidden pb-[0.1em]">
              <motion.span
                className="block"
                initial={
                  sinMovimiento
                    ? false
                    : { y: "120%", rotateX: -90, z: -200, opacity: 0 }
                }
                animate={{ y: 0, rotateX: 0, z: 0, opacity: 1 }}
                transition={{
                  duration: 1.6,
                  ease: EASE_FIRMA,
                  delay: 0.3 + i * 0.2,
                }}
                style={{
                  transformOrigin: "center bottom",
                  transformStyle: "preserve-3d",
                }}
              >
                {linea.serif ? (
                  <em className="font-serif">{linea.texto}</em>
                ) : (
                  linea.texto
                )}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.p
          initial={sinMovimiento ? false : { y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, ease: EASE_SUAVE, delay: 1.2 }}
          className="mt-8 max-w-md text-[clamp(1.05rem,1.5vw,1.5rem)] leading-relaxed text-texto/80 lg:max-w-lg"
        >
          PULSO convierte el dictado de voz del paramédico en un caso
          estructurado, encuentra la sede que sí puede recibirlo y confirma el
          destino — antes de que la ambulancia arranque.
        </motion.p>

        <motion.ul
          initial={sinMovimiento ? false : { y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, ease: EASE_SUAVE, delay: 1.5 }}
          className="mt-8 flex flex-wrap gap-2.5"
        >
          {CHIPS.map((chip) => (
            <li
              key={chip}
              className="rounded-full border border-borde bg-superficie/70 px-4 py-2 text-sm font-medium text-texto-tenue backdrop-blur"
            >
              {chip}
            </li>
          ))}
        </motion.ul>
      </div>

      <motion.div
        initial={sinMovimiento ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 2 }}
        className="absolute bottom-8 left-0 right-0 z-10 mx-auto max-w-7xl px-6 sm:px-10 lg:px-12"
      >
        <span className="text-lg tracking-tight font-medium text-texto/70">
          Scroll
        </span>
      </motion.div>
    </section>
  );
}
