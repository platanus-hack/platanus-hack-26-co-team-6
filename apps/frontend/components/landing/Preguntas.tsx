"use client";

/**
 * FAQ en acordeón. La expansión usa grid-template-rows 0fr→1fr (sin medir
 * alturas) y el "+" rota a "×", como el template.
 */

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const PREGUNTAS = [
  {
    pregunta: "¿PULSO reemplaza al CRUE?",
    respuesta:
      "No. PULSO propone; el CRUE regula (Resolución 1220 de 2010). El regulador ve todos los casos activos en /crue y puede forzar el destino en cualquier momento. Lo que cambia es que la propuesta llega en segundos, estructurada y con evidencia, en lugar de una llamada telefónica a la vez.",
  },
  {
    pregunta: "¿Por qué minutos y no kilómetros?",
    respuesta:
      "Porque la ambulancia no viaja en línea recta. El score combina tiempo real de viaje (Mapbox Matrix con tráfico), congestión de la sede y probabilidad de aceptación. Y el filtro es duro: si la sede no tiene el servicio que el caso exige — hemodinamia, UCI, neurocirugía — queda descartada aunque esté al lado.",
  },
  {
    pregunta: "¿Qué pasa cuando un hospital rechaza?",
    respuesta:
      "El caso se re-despacha automáticamente al siguiente del ranking, y ese rechazo queda registrado: entrena la probabilidad de aceptación y la señal de congestión de la sede. El rechazo no es un fracaso del sistema — es el sensor que lo hace más inteligente.",
  },
  {
    pregunta: "¿Y si no hay señal, micrófono o credenciales?",
    respuesta:
      "Todo degrada con dignidad: sin API keys funciona con 14 sedes REPS reales de Bogotá y ETA por distancia; sin micrófono, el textarea es el plan B real (el dictado por voz requiere Chrome y HTTPS); sin el LLM, un extractor heurístico estructura el caso. El flujo del demo nunca se bloquea.",
  },
  {
    pregunta: "¿De dónde salen los datos de las sedes?",
    respuesta:
      "Del REPS — el Registro Especial de Prestadores de Servicios de Salud de MinSalud — y del CodeSystem FHIR REPShealthcareServices para el vocabulario de servicios. El triage sigue la Resolución 5596 de 2015. No inventamos hospitales ni capacidades.",
  },
];

function Pregunta({
  pregunta,
  respuesta,
}: {
  pregunta: string;
  respuesta: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const sinMovimiento = useReducedMotion();

  return (
    <motion.div
      initial={sinMovimiento ? false : { y: 40, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ margin: "-10% 0px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="overflow-hidden rounded-2xl border border-borde"
    >
      <button
        onClick={() => setAbierta(!abierta)}
        aria-expanded={abierta}
        className="flex w-full cursor-pointer items-center justify-between p-6 text-left"
      >
        <span className="pr-4 text-lg font-medium text-texto">{pregunta}</span>
        <span
          aria-hidden
          className="relative h-6 w-6 shrink-0 text-texto transition-transform duration-300"
          style={{ transform: abierta ? "rotate(45deg)" : "rotate(0deg)" }}
        >
          <span className="absolute left-1/2 top-1/2 h-[1.5px] w-4 -translate-x-1/2 -translate-y-1/2 bg-current" />
          <span className="absolute left-1/2 top-1/2 h-4 w-[1.5px] -translate-x-1/2 -translate-y-1/2 bg-current" />
        </span>
      </button>
      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: abierta ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="px-6 pb-6 leading-relaxed text-texto-tenue">{respuesta}</p>
        </div>
      </div>
    </motion.div>
  );
}

export function Preguntas() {
  const sinMovimiento = useReducedMotion();

  return (
    <section id="faq" className="bg-fondo py-24 lg:py-32">
      <div className="mx-auto max-w-4xl px-6 sm:px-10 lg:px-12">
        <motion.h2
          initial={sinMovimiento ? false : { y: 60, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ margin: "-10% 0px" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-12 text-center text-4xl font-medium tracking-tight text-texto lg:mb-16 lg:text-5xl"
        >
          Preguntas
          <br />
          <span className="font-serif italic">frecuentes</span>
        </motion.h2>
        <div className="flex flex-col gap-4">
          {PREGUNTAS.map((p) => (
            <Pregunta key={p.pregunta} {...p} />
          ))}
        </div>
      </div>
    </section>
  );
}
