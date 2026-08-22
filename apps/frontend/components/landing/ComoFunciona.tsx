"use client";

/**
 * Los cuatro pasos del flujo, alternados como los proyectos del template.
 * Cada imagen vive en una cápsula y se revela como un círculo que crece
 * atado al scroll (clip-path en vez del shader WebGL del original),
 * con tilt magnético al pasar el mouse.
 */

import { useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useReducedMotion,
} from "motion/react";
import { ImagenSlot } from "./ImagenSlot";
import { CintaVelocidad } from "./CintaVelocidad";
import { IMAGENES } from "./config";

interface Paso {
  imagen: keyof typeof IMAGENES;
  tituloArriba: string;
  tituloAbajo: string;
  descripcion: string;
}

const PASOS: Paso[] = [
  {
    imagen: "dictado",
    tituloArriba: "Dictado",
    tituloAbajo: "en caliente",
    descripcion:
      "El paramédico habla como le habla al hospital: por voz, con las manos ocupadas. Si no hay micrófono o señal, el textarea es el plan B real — nada se bloquea.",
  },
  {
    imagen: "triage",
    tituloArriba: "Triage",
    tituloAbajo: "estructurado",
    descripcion:
      "Claude convierte el dictado en un caso clínico: código CIE-10, nivel de triage y los servicios REPS que el destino debe tener. Si la confianza es baja, la interfaz lo declara.",
  },
  {
    imagen: "ranking",
    tituloArriba: "Match",
    tituloAbajo: "en minutos",
    descripcion:
      "PostGIS + tráfico real de Mapbox puntúan cada sede en minutos, no en kilómetros. El filtro es duro: la clínica más cercana aparece tachada si no tiene hemodinamia.",
  },
  {
    imagen: "handshake",
    tituloArriba: "Handshake",
    tituloAbajo: "confirmado",
    descripcion:
      "El hospital recibe la tarjeta y responde con dos botones. Un rechazo re-despacha al siguiente y entrena la probabilidad de aceptación: el rechazo es el sensor.",
  },
];

function ImagenPaso({ imagen }: { imagen: keyof typeof IMAGENES }) {
  const marco = useRef<HTMLDivElement>(null);
  const sinMovimiento = useReducedMotion();

  // Revelado circular atado al scroll (reversible, como el scrub del template).
  const { scrollYProgress } = useScroll({
    target: marco,
    offset: ["start 90%", "start 25%"],
  });
  const radio = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const clip = useMotionTemplate`circle(${radio}% at 50% 50%)`;

  // Tilt magnético con springs.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const escala = useMotionValue(1.12);
  const sx = useSpring(mx, { stiffness: 150, damping: 20 });
  const sy = useSpring(my, { stiffness: 150, damping: 20 });
  const sEscala = useSpring(escala, { stiffness: 200, damping: 25 });

  return (
    <div
      ref={marco}
      className="relative aspect-[4/3] w-full overflow-hidden rounded-full md:w-3/5"
      onMouseMove={(e) => {
        if (sinMovimiento) return;
        const r = marco.current?.getBoundingClientRect();
        if (!r) return;
        mx.set(-((e.clientX - r.left) / r.width - 0.5) * 30);
        my.set(-((e.clientY - r.top) / r.height - 0.5) * 30);
      }}
      onMouseEnter={() => !sinMovimiento && escala.set(1.18)}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
        escala.set(1.12);
      }}
    >
      <motion.div
        className="absolute inset-0 h-full w-full"
        style={
          sinMovimiento
            ? undefined
            : { clipPath: clip, x: sx, y: sy, scale: sEscala, willChange: "transform" }
        }
      >
        <ImagenSlot
          id={imagen}
          className="h-full w-full"
          sizes="(min-width: 768px) 60vw, 100vw"
        />
      </motion.div>
    </div>
  );
}

function TarjetaPaso({ paso, indice }: { paso: Paso; indice: number }) {
  const par = indice % 2 === 0;
  const sinMovimiento = useReducedMotion();

  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-12">
        <div
          className={`flex flex-col gap-8 md:items-center md:gap-16 ${
            par ? "md:flex-row" : "md:flex-row-reverse"
          }`}
        >
          <ImagenPaso imagen={paso.imagen} />

          <div className={`flex flex-col md:w-2/5 ${par ? "" : "md:text-right"}`}>
            <motion.span
              initial={sinMovimiento ? false : { y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ margin: "-15% 0px" }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="mb-6 text-base font-medium uppercase tracking-widest text-texto-tenue"
            >
              0{indice + 1}
            </motion.span>
            <motion.h3
              initial={sinMovimiento ? false : { y: 60, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ margin: "-15% 0px" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="mb-8 text-[clamp(2.25rem,6vw,5rem)] leading-[1.05] tracking-tight text-texto"
            >
              <span className="font-medium">{paso.tituloArriba}</span>
              <br />
              <span className="font-serif italic">{paso.tituloAbajo}</span>
            </motion.h3>
            <motion.p
              initial={sinMovimiento ? false : { y: 40, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ margin: "-15% 0px" }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
              className={`max-w-lg text-xl leading-relaxed text-texto-tenue ${
                par ? "" : "md:ml-auto"
              }`}
            >
              {paso.descripcion}
            </motion.p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ComoFunciona() {
  return (
    <section id="como-funciona" className="relative bg-fondo py-24">
      <div className="pb-16">
        <CintaTitulo />
      </div>
      <div className="flex flex-col">
        {PASOS.map((paso, i) => (
          <TarjetaPaso key={paso.imagen} paso={paso} indice={i} />
        ))}
      </div>
    </section>
  );
}

function CintaTitulo() {
  return (
    <CintaVelocidad
      velocidadBase={80}
      className="px-8 text-[clamp(3.5rem,11vw,11rem)] font-medium italic uppercase tracking-tight text-texto"
    >
      Menos de <span className="font-serif font-thin">90 segundos</span>{" "}
      <span className="text-critico">·</span>{" "}
    </CintaVelocidad>
  );
}
