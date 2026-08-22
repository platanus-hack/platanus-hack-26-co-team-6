"use client";

/**
 * Bento grid de impacto (el "social proof" del template, adaptado a lo que
 * PULSO puede afirmar hoy): la cita normativa como pieza central, métricas
 * del demo y dos slots de imagen. Las celdas caen en cascada al entrar.
 */

import { motion, useReducedMotion, type Variants } from "motion/react";
import { ImagenSlot } from "./ImagenSlot";

const contenedor: Variants = {
  oculto: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const celda: Variants = {
  oculto: { y: 80, opacity: 0, scale: 0.95 },
  visible: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

export function Impacto() {
  const sinMovimiento = useReducedMotion();

  return (
    <section id="impacto" className="bg-fondo py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-12">
        {/* Cápsula panorámica, el gesto "About" del template */}
        <motion.div
          initial={sinMovimiento ? false : { scale: 0.92, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ margin: "-10% 0px" }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="mb-16 lg:mb-24"
        >
          <ImagenSlot
            id="panoramica"
            className="aspect-[21/9] w-full rounded-full lg:aspect-[3/1]"
            sizes="100vw"
          />
        </motion.div>

        <motion.div
          initial={sinMovimiento ? false : { y: 40, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ margin: "-10% 0px" }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="mb-12 flex items-center justify-between lg:mb-16"
        >
          <h2 className="text-3xl font-medium tracking-tight text-texto lg:text-4xl">
            Lo que cambia con PULSO
          </h2>
        </motion.div>

        <motion.div
          variants={sinMovimiento ? undefined : contenedor}
          initial="oculto"
          whileInView="visible"
          viewport={{ margin: "-10% 0px", once: true }}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[minmax(200px,auto)_minmax(200px,auto)_minmax(160px,auto)]"
        >
          {/* Columna de imágenes */}
          <motion.div variants={celda} className="row-span-2 flex flex-col gap-4">
            <ImagenSlot
              id="mapa"
              className="min-h-44 flex-1 w-full rounded-2xl"
              sizes="(min-width: 1024px) 25vw, 100vw"
            />
            <ImagenSlot
              id="equipo"
              className="min-h-44 flex-1 w-full rounded-full"
              sizes="(min-width: 1024px) 25vw, 100vw"
            />
          </motion.div>

          {/* Cita normativa: la tesis institucional */}
          <motion.div
            variants={celda}
            className="row-span-2 flex flex-col rounded-2xl bg-superficie p-8 lg:col-span-2"
          >
            <div>
              <span
                aria-hidden
                className="mb-6 block font-serif text-6xl leading-none text-texto/20"
              >
                “
              </span>
              <blockquote className="text-2xl font-medium leading-snug text-texto lg:text-3xl">
                PULSO propone; el CRUE regula. La decisión final siempre es de
                quien tiene la autoridad — nosotros solo hacemos que llegue en
                segundos y con evidencia.
              </blockquote>
              <div className="mt-6">
                <p className="font-semibold text-texto">Resolución 1220 de 2010</p>
                <p className="text-sm text-texto-tenue">
                  Centros Reguladores de Urgencias y Emergencias
                </p>
              </div>
            </div>
            <div className="mt-auto flex items-center justify-between pt-8">
              <span className="text-xl font-semibold text-texto">
                Triage Res. 5596/2015
              </span>
            </div>
          </motion.div>

          {/* Métricas */}
          <motion.div
            variants={celda}
            className="flex flex-col rounded-2xl bg-superficie p-6"
          >
            <div className="flex-1">
              <p className="tabular text-3xl font-semibold text-estable">
                45 → &lt;2 min
              </p>
              <p className="mt-1 text-sm text-texto-tenue">
                De coordinar por teléfono a destino confirmado
              </p>
            </div>
            <p className="mt-auto pt-4 text-sm font-medium text-texto">
              El cronómetro del demo no miente
            </p>
          </motion.div>

          <motion.div
            variants={celda}
            className="flex flex-col rounded-2xl bg-superficie p-6"
          >
            <div className="flex-1">
              <p className="tabular text-3xl font-semibold text-info">14 sedes</p>
              <p className="mt-1 text-sm text-texto-tenue">
                REPS reales de Bogotá, con sus servicios habilitados
              </p>
            </div>
            <p className="mt-auto pt-4 text-sm font-medium text-texto">
              Funciona incluso sin credenciales
            </p>
          </motion.div>

          <motion.div
            variants={celda}
            className="flex flex-col rounded-2xl bg-superficie p-8"
          >
            <div className="flex-1">
              <p className="text-3xl font-semibold text-critico lg:text-4xl">
                P(aceptación)
              </p>
              <p className="mt-2 text-texto-tenue">
                Cada rechazo entrena el modelo.
                <br />
                El rechazo es el sensor.
              </p>
            </div>
          </motion.div>

          {/* Caso ancho */}
          <motion.div
            variants={celda}
            className="flex flex-col rounded-2xl bg-superficie p-8 lg:col-span-3"
          >
            <p className="max-w-3xl flex-1 text-xl font-medium leading-relaxed text-texto lg:text-2xl">
              Un infarto en Kennedy: la clínica más cercana está a 10 minutos —
              pero no tiene hemodinamia. PULSO la tacha, propone la sede correcta
              a 14 minutos y el hospital acepta antes de que la ambulancia
              arranque.
            </p>
            <div className="mt-auto flex items-center justify-between pt-6">
              <span className="text-xl font-semibold text-texto">
                El contraste es el producto
              </span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
