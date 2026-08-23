"use client";

/**
 * Header flotante estilo Pulsewave: dos píldoras glass. La derecha muestra
 * la sección activa y se expande con los anclajes de la landing más los
 * accesos directos a las tres pantallas del demo (la vieja "puerta de
 * entrada" vive aquí ahora).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { EASE_FIRMA } from "./config";
import { LogoPulso } from "@/components/LogoPulso";

const SECCIONES = [
  { id: "inicio", label: "Inicio" },
  { id: "como-funciona", label: "Cómo funciona" },
  { id: "tesis", label: "La tesis" },
  { id: "pantallas", label: "Pantallas" },
  { id: "impacto", label: "Impacto" },
  { id: "faq", label: "FAQ" },
  { id: "contacto", label: "Contacto" },
];

const APPS = [
  { href: "/campo", label: "Campo", quien: "paramédico" },
  { href: "/hospital", label: "Urgencias", quien: "hospital" },
  { href: "/crue", label: "CRUE", quien: "regulador" },
];

/**
 * Las consolas que no son del demo: no se despacha ni se acepta nada en
 * ellas, y core las cierra por rol. Van en su propio bloque y **apuntan al
 * login con `?destino=`, no a la ruta directa**: quien las abra desde una
 * landing pública casi nunca trae sesión, y un 403 en blanco es peor
 * pantalla que el login que ya sabe volver aquí.
 */
const INTERNAS = [
  { href: "/admin", label: "Admin", quien: "plataforma" },
  { href: "/equipo", label: "Equipo", quien: "organización" },
];

// Auditoría no está aquí: su única ruta es `/auditoria/casos/:id` y no hay
// índice que ofrecer. Se entra por el enlace del caso, desde el CRUE.

const alLogin = (destino: string) =>
  `/entrar?destino=${encodeURIComponent(destino)}`;

export function HeaderLanding() {
  const [activa, setActiva] = useState("Inicio");
  const [abierto, setAbierto] = useState(false);
  const [movil, setMovil] = useState(false);
  const sinMovimiento = useReducedMotion();

  useEffect(() => {
    const medir = () => setMovil(window.innerWidth < 640);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  useEffect(() => {
    const alScroll = () => {
      const y = window.scrollY + window.innerHeight / 3;
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 100) {
        setActiva("Contacto");
        return;
      }
      for (let i = SECCIONES.length - 1; i >= 0; i--) {
        const s = SECCIONES[i];
        const el = document.getElementById(s.id);
        if (el && y >= el.offsetTop) {
          setActiva(s.label);
          return;
        }
      }
      setActiva(SECCIONES[0].label);
    };
    window.addEventListener("scroll", alScroll, { passive: true });
    alScroll();
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  const irA = (id: string) => {
    setAbierto(false);
    document.getElementById(id)?.scrollIntoView({
      behavior: sinMovimiento ? "auto" : "smooth",
    });
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_FIRMA }}
      className="fixed top-0 left-0 right-0 z-50 px-4 py-4 sm:px-8 sm:py-6 lg:px-12"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <motion.a
          href="#inicio"
          onClick={(e) => {
            e.preventDefault();
            irA("inicio");
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex h-12 sm:h-14 items-center gap-2.5 rounded-xl sm:rounded-2xl bg-neutral-900/70 backdrop-blur-lg px-4 sm:px-5 shadow-lg text-white font-medium tracking-tight text-base sm:text-lg shrink-0"
        >
          <LogoPulso
            decorativo
            className="h-6 w-auto shrink-0 text-critico drop-shadow-[0_0_10px_rgba(255,59,71,0.45)] sm:h-7"
          />
          pulso
        </motion.a>

        <div className="relative h-12 sm:h-14">
          <motion.div
            animate={{ height: abierto ? "auto" : movil ? 48 : 56 }}
            transition={{ duration: 0.4, ease: EASE_FIRMA }}
            className="absolute top-0 right-0 w-56 sm:w-64 overflow-hidden rounded-xl sm:rounded-2xl bg-neutral-900/70 backdrop-blur-lg shadow-lg"
          >
            <button
              onClick={() => setAbierto(!abierto)}
              aria-expanded={abierto}
              className="flex h-12 sm:h-14 w-full items-center justify-between gap-4 px-4 sm:px-5 text-white"
            >
              <span className="text-base sm:text-lg font-medium">{activa}</span>
              <motion.span
                animate={{ rotate: abierto ? 45 : 0 }}
                transition={{ duration: 0.3, ease: EASE_FIRMA }}
                className="relative h-5 w-5"
                aria-hidden
              >
                <span className="absolute left-1/2 top-0 h-5 w-[1.5px] -translate-x-1/2 bg-current" />
                <span className="absolute left-0 top-1/2 h-[1.5px] w-5 -translate-y-1/2 bg-current" />
              </motion.span>
            </button>

            <AnimatePresence>
              {abierto && (
                <motion.nav
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, delay: 0.1 }}
                  className="px-5 pb-5"
                >
                  <ul className="flex flex-col gap-0.5">
                    {SECCIONES.map((s, i) => (
                      <motion.li
                        key={s.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.3, delay: 0.05 * i, ease: EASE_FIRMA }}
                      >
                        <a
                          href={`#${s.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            irA(s.id);
                          }}
                          className={`block py-1.5 text-base font-medium transition-colors hover:text-white ${
                            activa === s.label ? "text-white" : "text-white/50"
                          }`}
                        >
                          {s.label}
                        </a>
                      </motion.li>
                    ))}
                  </ul>
                  <div className="my-3 border-t border-white/10" />
                  <p className="mb-2 text-[11px] uppercase tracking-widest text-white/40">
                    Abrir el demo
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {APPS.map((a, i) => (
                      <motion.li
                        key={a.href}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.3, delay: 0.05 * (SECCIONES.length + i), ease: EASE_FIRMA }}
                      >
                        <Link
                          href={a.href}
                          className="flex items-baseline gap-2 py-1.5 text-base font-medium text-white/70 transition-colors hover:text-white"
                        >
                          {a.label}
                          <span className="text-xs text-white/40">· {a.quien}</span>
                        </Link>
                      </motion.li>
                    ))}
                  </ul>
                  <div className="my-3 border-t border-white/10" />
                  <p className="mb-2 text-[11px] uppercase tracking-widest text-white/40">
                    Consolas internas
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {INTERNAS.map((a, i) => (
                      <motion.li
                        key={a.href}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{
                          duration: 0.3,
                          delay: 0.05 * (SECCIONES.length + APPS.length + i),
                          ease: EASE_FIRMA,
                        }}
                      >
                        <Link
                          href={alLogin(a.href)}
                          className="flex items-baseline gap-2 py-1.5 text-base font-medium text-white/70 transition-colors hover:text-white"
                        >
                          {a.label}
                          <span className="text-xs text-white/40">· {a.quien}</span>
                        </Link>
                      </motion.li>
                    ))}
                  </ul>
                </motion.nav>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </motion.header>
  );
}
