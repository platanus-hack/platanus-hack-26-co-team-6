"use client";

/**
 * La tesis del producto, pineada: la sección mide 250vh y la frase queda
 * sticky en pantalla mientras cada letra se despliega verticalmente
 * (scaleY desde la base), controlada 100% por el scroll — pausable y
 * reversible a mitad de palabra, como el pin+scrub del template.
 */

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "motion/react";

const FRASE = "El más cercano no siempre puede. PULSO encuentra el que sí.";

function Letra({
  char,
  progreso,
  desde,
  hasta,
  sinMovimiento,
}: {
  char: string;
  progreso: MotionValue<number>;
  desde: number;
  hasta: number;
  sinMovimiento: boolean;
}) {
  const scaleY = useTransform(progreso, [desde, hasta], [0, 1]);
  const opacity = useTransform(progreso, [desde, hasta], [0, 1]);
  return (
    <motion.span
      className="inline-block"
      style={
        sinMovimiento
          ? undefined
          : { scaleY, opacity, transformOrigin: "50% 100%", willChange: "transform" }
      }
    >
      {char}
    </motion.span>
  );
}

export function FraseAnclada() {
  const seccion = useRef<HTMLElement>(null);
  const sinMovimiento = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: seccion,
    offset: ["start start", "end end"],
  });

  const palabras = FRASE.split(" ");
  const totalLetras = FRASE.length;
  let indiceGlobal = 0;

  return (
    <section
      ref={seccion}
      id="tesis"
      className="relative bg-fondo"
      style={{ height: sinMovimiento ? "auto" : "250vh" }}
    >
      <div
        className={`flex items-center justify-center px-6 sm:px-10 lg:px-12 ${
          sinMovimiento ? "min-h-screen" : "sticky top-0 h-screen"
        }`}
      >
        <h2 className="max-w-6xl text-center text-[clamp(2.25rem,6.5vw,6rem)] font-medium leading-[1.12] tracking-tight text-texto">
          {palabras.map((palabra, wi) => {
            const inicio = indiceGlobal;
            indiceGlobal += palabra.length + 1; // +1 por el espacio
            return (
              <span key={wi} className="inline-block whitespace-nowrap">
                {palabra.split("").map((char, ci) => {
                  const i = inicio + ci;
                  const desde = (i / totalLetras) * 0.85;
                  return (
                    <Letra
                      key={ci}
                      char={char}
                      progreso={scrollYProgress}
                      desde={desde}
                      hasta={desde + 0.15}
                      sinMovimiento={!!sinMovimiento}
                    />
                  );
                })}
                {wi < palabras.length - 1 && (
                  <span className="inline-block">&nbsp;</span>
                )}
              </span>
            );
          })}
        </h2>
      </div>
    </section>
  );
}
