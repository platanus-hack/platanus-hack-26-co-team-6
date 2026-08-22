"use client";

/**
 * Marquee infinito reactivo a la velocidad del scroll (patrón del template):
 * avanza solo, se acelera cuando scrolleas rápido y se invierte cuando
 * scrolleas hacia arriba. Con prefers-reduced-motion queda estático.
 */

import { useLayoutEffect, useRef, useState } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  useReducedMotion,
} from "motion/react";

export function CintaVelocidad({
  children,
  velocidadBase = 80,
  className = "",
}: {
  children: React.ReactNode;
  velocidadBase?: number;
  className?: string;
}) {
  const base = useMotionValue(0);
  const sinMovimiento = useReducedMotion();

  const { scrollY } = useScroll();
  const velocidadScroll = useVelocity(scrollY);
  const velocidadSuave = useSpring(velocidadScroll, {
    damping: 50,
    stiffness: 400,
  });
  const factor = useTransform(velocidadSuave, [0, 1000], [0, 5], {
    clamp: false,
  });

  const primerTramo = useRef<HTMLSpanElement>(null);
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    const medir = () =>
      primerTramo.current && setAncho(primerTramo.current.offsetWidth);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  // Envuelve x en [-ancho, 0] para el loop perfecto.
  const x = useTransform(base, (v) => {
    if (ancho === 0) return "0px";
    const rango = ancho;
    return `${((((v - -rango) % rango) + rango) % rango) + -rango}px`;
  });

  const direccion = useRef(1);
  useAnimationFrame((_t, delta) => {
    if (sinMovimiento) return;
    let paso = direccion.current * velocidadBase * (delta / 1000);
    const f = factor.get();
    if (f < 0) direccion.current = -1;
    else if (f > 0) direccion.current = 1;
    paso += direccion.current * paso * f;
    base.set(base.get() + paso);
  });

  return (
    <div className="relative w-full overflow-hidden">
      <motion.div className="flex whitespace-nowrap" style={{ x }}>
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            ref={i === 0 ? primerTramo : null}
            className={`shrink-0 ${className}`}
            aria-hidden={i > 0}
          >
            {children}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
