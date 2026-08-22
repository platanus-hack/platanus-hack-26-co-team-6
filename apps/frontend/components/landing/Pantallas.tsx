"use client";

/**
 * Las tres pantallas del demo como filas gigantes (el menú de servicios del
 * template). Cada fila es un link real a /campo, /hospital o /crue — la
 * puerta de entrada del equipo ahora vive aquí. Hover: cortina que entra
 * por el lado por el que entra el mouse, letras con micro-rebote, y un
 * cursor circular "Entrar" que sigue al mouse estirándose con la velocidad.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
  useReducedMotion,
} from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { EASE_EXPO, EASE_REBOTE } from "./config";

const PANTALLAS = [
  {
    href: "/campo",
    titulo: "Campo",
    quien: "Paramédico — dicta, ve el ranking, despacha",
  },
  {
    href: "/hospital",
    titulo: "Urgencias",
    quien: "Jefe de urgencias — recibe la tarjeta, dos botones",
  },
  {
    href: "/crue",
    titulo: "CRUE",
    quien: "Regulador — ve todos los casos, puede forzar destino",
  },
];

type Lado = "arriba" | "abajo";

function ladoDeEntrada(e: React.MouseEvent, el: HTMLElement): Lado {
  const r = el.getBoundingClientRect();
  return e.clientY - r.top < r.height / 2 ? "arriba" : "abajo";
}

function FilaPantalla({
  pantalla,
  indice,
  onHover,
}: {
  pantalla: (typeof PANTALLAS)[number];
  indice: number;
  onHover: (v: boolean) => void;
}) {
  const fila = useRef<HTMLDivElement>(null);
  const sinMovimiento = useReducedMotion();
  const [estado, setEstado] = useState<{ dentro: boolean; lado: Lado }>({
    dentro: false,
    lado: "abajo",
  });

  const desplazamiento = (lado: Lado) => (lado === "arriba" ? "-101%" : "101%");

  return (
    <motion.div
      ref={fila}
      initial={sinMovimiento ? false : { x: -60, opacity: 0 }}
      whileInView={{ x: 0, opacity: 1 }}
      viewport={{ margin: "-10% 0px" }}
      transition={{ duration: 0.7, ease: "easeOut", delay: indice * 0.08 }}
      className="relative overflow-hidden border-t border-borde"
      onMouseEnter={(e) => {
        if (!fila.current) return;
        onHover(true);
        setEstado({ dentro: true, lado: ladoDeEntrada(e, fila.current) });
      }}
      onMouseLeave={(e) => {
        if (!fila.current) return;
        onHover(false);
        setEstado({ dentro: false, lado: ladoDeEntrada(e, fila.current) });
      }}
    >
      <Link
        href={pantalla.href}
        className="flex items-center justify-between gap-6 px-6 py-8 sm:px-10 md:py-10 lg:px-12"
      >
        <span className="text-[clamp(1.75rem,4.5vw,4rem)] font-light tracking-tight text-texto">
          {pantalla.titulo}
        </span>
        <span className="hidden max-w-xs text-right text-sm leading-snug text-texto-tenue sm:block">
          {pantalla.quien}
        </span>
      </Link>

      {/* Cortina invertida, direccional */}
      {!sinMovimiento && (
        <motion.div
          className="pointer-events-none absolute inset-0 overflow-hidden bg-texto"
          initial={false}
          animate={{
            y: estado.dentro
              ? [desplazamiento(estado.lado), "0%"]
              : desplazamiento(estado.lado),
          }}
          transition={{ duration: 0.5, ease: EASE_EXPO }}
        >
          <motion.div
            className="flex h-full items-center justify-between gap-6 px-6 sm:px-10 lg:px-12"
            initial={false}
            animate={{
              y: estado.dentro
                ? [desplazamiento(estado.lado === "arriba" ? "abajo" : "arriba"), "0%"]
                : desplazamiento(estado.lado === "arriba" ? "abajo" : "arriba"),
            }}
            transition={{ duration: 0.5, ease: EASE_EXPO }}
          >
            <span className="text-[clamp(1.75rem,4.5vw,4rem)] font-light tracking-tight text-fondo">
              {pantalla.titulo.split("").map((char, i) => (
                <motion.span
                  key={i}
                  className="inline-block"
                  style={{ whiteSpace: char === " " ? "pre" : undefined }}
                  animate={estado.dentro ? { y: [0, -14, 0] } : { y: 0 }}
                  transition={{
                    duration: 0.35,
                    delay: i * 0.015,
                    ease: "easeInOut",
                  }}
                >
                  {char}
                </motion.span>
              ))}
            </span>
            <ArrowUpRight
              className="h-8 w-8 text-fondo md:h-12 md:w-12"
              strokeWidth={1.5}
              aria-hidden
            />
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}

/** Cursor circular "Entrar" con squash & stretch según la velocidad. */
function CursorEntrar({ visible }: { visible: boolean }) {
  const mx = useMotionValue(-100);
  const my = useMotionValue(-100);
  const x = useSpring(mx, { damping: 30, stiffness: 400, mass: 0.2 });
  const y = useSpring(my, { damping: 30, stiffness: 400, mass: 0.2 });
  const vx = useVelocity(x);
  const vy = useVelocity(y);

  const rapidez = useTransform(() =>
    Math.sqrt(vx.get() ** 2 + vy.get() ** 2),
  );
  const scaleX = useTransform(rapidez, [0, 800, 2000], [1, 1.3, 1.6]);
  const scaleY = useTransform(rapidez, [0, 800, 2000], [1, 0.8, 0.65]);
  const angulo = useTransform(() =>
    Math.atan2(vy.get(), vx.get()) * (180 / Math.PI),
  );
  const anguloInverso = useTransform(angulo, (a) => -a);
  const inversoX = useTransform(scaleX, (v) => 1 / v);
  const inversoY = useTransform(scaleY, (v) => 1 / v);

  // Seguimos el mouse a nivel de window para no depender del layout.
  useEffect(() => {
    const mover = (e: MouseEvent) => {
      mx.set(e.clientX);
      my.set(e.clientY);
    };
    window.addEventListener("mousemove", mover, { passive: true });
    return () => window.removeEventListener("mousemove", mover);
  }, [mx, my]);

  return (
    <motion.div
      className="pointer-events-none fixed z-50 hidden items-center justify-center md:flex"
      style={{ left: x, top: y, x: "-50%", y: "-50%" }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: visible ? 1 : 0, scale: visible ? 1 : 0 }}
      transition={{
        opacity: { duration: 0.3, ease: "easeOut" },
        scale: { duration: 0.3, ease: EASE_REBOTE },
      }}
    >
      <motion.div style={{ rotate: angulo }}>
        <motion.div
          className="flex h-20 w-20 items-center justify-center rounded-full bg-texto"
          style={{ scaleX, scaleY }}
        >
          <motion.span
            className="text-sm font-medium uppercase tracking-wide text-fondo"
            style={{ rotate: anguloInverso, scaleX: inversoX, scaleY: inversoY }}
          >
            Entrar
          </motion.span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function Pantallas() {
  const [hover, setHover] = useState(false);
  const sinMovimiento = useReducedMotion();

  return (
    <section id="pantallas" className="relative overflow-hidden bg-fondo pb-24">
      {!sinMovimiento && <CursorEntrar visible={hover} />}

      <div className="mx-auto max-w-7xl px-6 pb-12 sm:px-10 lg:px-12">
        <motion.h2
          initial={sinMovimiento ? false : { y: 40, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ margin: "-10% 0px" }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="text-3xl font-medium tracking-tight text-texto lg:text-4xl"
        >
          Un caso, tres pantallas{" "}
          <span className="font-serif italic text-texto-tenue">
            — el mismo pulso.
          </span>
        </motion.h2>
      </div>

      <div className="w-full">
        {PANTALLAS.map((p, i) => (
          <FilaPantalla key={p.href} pantalla={p} indice={i} onHover={setHover} />
        ))}
        <div className="border-t border-borde" />
      </div>
    </section>
  );
}
