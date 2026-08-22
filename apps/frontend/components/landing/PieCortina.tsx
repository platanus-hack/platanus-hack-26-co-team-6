"use client";

/**
 * Footer con efecto cortina (solo CSS): el <main> lleva z-10 y este footer
 * es sticky bottom con z-0, así el contenido se desliza y lo revela al
 * llegar al final. Colores invertidos: claro sobre el fondo oscuro del sitio.
 */

import Link from "next/link";
import { LogoPulso } from "@/components/LogoPulso";

const NAVEGACION = [
  { label: "Cómo funciona", href: "#como-funciona" },
  { label: "La tesis", href: "#tesis" },
  { label: "Pantallas", href: "#pantallas" },
  { label: "Impacto", href: "#impacto" },
  { label: "FAQ", href: "#faq" },
];

const DEMO = [
  { label: "Campo", href: "/campo" },
  { label: "Urgencias", href: "/hospital" },
  { label: "CRUE", href: "/crue" },
];

const EQUIPO = [
  { nombre: "Juan", rol: "Frontend / PWA" },
  { nombre: "Zaid", rol: "Backend / datos" },
  { nombre: "Neid", rol: "AI / LLM" },
  { nombre: "Sebas", rol: "Producto / pitch" },
];

export function PieCortina() {
  return (
    <footer
      id="contacto"
      className="bg-texto text-fondo lg:sticky lg:bottom-0 lg:z-0"
    >
      <div className="mx-auto max-w-7xl px-6 pb-16 pt-24 text-center sm:px-10 sm:text-left lg:px-12 lg:pb-20 lg:pt-32">
        <p className="text-2xl font-medium tracking-tight sm:text-5xl lg:text-6xl">
          ¿Listo para verlo{" "}
          <span className="font-serif italic">en vivo?</span>
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <Link
            href="/campo"
            className="inline-flex w-full items-center justify-center rounded-full bg-fondo px-8 py-4 text-lg font-medium text-texto transition-opacity hover:opacity-90 sm:w-auto"
          >
            Abrir el demo →
          </Link>
          <div className="flex gap-3">
            {DEMO.slice(1).map((d) => (
              <Link
                key={d.href}
                href={d.href}
                className="inline-flex items-center justify-center rounded-full border border-fondo/20 px-6 py-4 text-lg font-medium transition-colors hover:bg-fondo/10"
              >
                {d.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-12">
        <div className="border-t border-fondo/10" />
      </div>

      <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10 lg:px-12 lg:py-20">
        <div className="flex flex-col justify-between gap-12 lg:flex-row lg:gap-8">
          <div>
            <div className="flex items-center gap-3.5">
              <LogoPulso decorativo className="h-9 w-auto shrink-0 text-critico" />
              <span className="text-4xl font-medium tracking-tight">pulso</span>
            </div>
            <p className="mt-4 max-w-sm text-2xl text-fondo/60 sm:text-3xl">
              Del dictado al hospital que sí puede recibirlo.
            </p>
          </div>
          <div className="flex flex-col gap-12 sm:flex-row sm:gap-16 lg:gap-20">
            <div>
              <h4 className="mb-6 text-sm font-medium text-fondo/60">Equipo</h4>
              <ul className="space-y-3">
                {EQUIPO.map((m) => (
                  <li key={m.nombre}>
                    <span className="font-medium">{m.nombre}</span>{" "}
                    <span className="text-sm text-fondo/60">· {m.rol}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-6 text-sm font-medium text-fondo/60">
                Navegación
              </h4>
              <ul className="space-y-3">
                {NAVEGACION.map((n) => (
                  <li key={n.href}>
                    <a
                      href={n.href}
                      className="transition-colors hover:text-fondo/60"
                    >
                      {n.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-6 text-sm font-medium text-fondo/60">
                Fundamento
              </h4>
              <ul className="space-y-3 text-sm leading-relaxed">
                <li>
                  Sedes: REPS — Registro Especial de Prestadores (MinSalud)
                </li>
                <li>
                  Servicios: CodeSystem FHIR{" "}
                  <code className="text-fondo/70">REPShealthcareServices</code>
                </li>
                <li>PULSO propone; el CRUE regula — Res. 1220/2010</li>
                <li>Triage según Res. 5596/2015</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6 sm:px-10 lg:px-12">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-sm text-fondo/40">
            Platanus Hack 26 · Bogotá · Track Emergencias
          </p>
          <p className="text-sm text-fondo/40">
            © 2026 PULSO — hecho con pulso por team-6
          </p>
        </div>
      </div>
    </footer>
  );
}
