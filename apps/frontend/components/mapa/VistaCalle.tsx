"use client";

/**
 * VistaCalle — el entorno de un punto a nivel de calle (Mapillary).
 *
 * Se abre al hacer click en cualquier sitio del mapa del CRUE: foto grande
 * de la cuadra + carrusel de las demás fotos alrededor, cada una con su
 * FECHA de captura (las fotos son crowdsourced, no "en vivo" — la consola
 * no presenta como actual lo que no lo es).
 *
 * Estados honestos: sin token lo dice (y cómo arreglarlo); sin cobertura en
 * esa cuadra también.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Coordenada } from "@/lib/types";
import {
  fotosAlrededor,
  mapillaryConfigurado,
  type FotoAlrededor,
} from "@/lib/mapillary";

const SUAVE = [0.22, 1, 0.36, 1] as const;

function fechaFoto(epochMs: number | null): string | null {
  if (!epochMs) return null;
  return new Date(epochMs).toLocaleDateString("es-CO", {
    month: "short",
    year: "numeric",
  });
}

interface Props {
  /** Punto consultado; null = cerrada. */
  coord: Coordenada | null;
  onCerrar: () => void;
}

export default function VistaCalle({ coord, onCerrar }: Props) {
  const [fotos, setFotos] = useState<FotoAlrededor[] | null>(null);
  const [activa, setActiva] = useState(0);

  useEffect(() => {
    if (!coord) return;
    let vigente = true;
    setFotos(null);
    setActiva(0);
    fotosAlrededor(coord).then((f) => {
      if (vigente) setFotos(f);
    });
    return () => {
      vigente = false;
    };
  }, [coord?.lat, coord?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const foto = fotos?.[activa] ?? null;

  return (
    <AnimatePresence>
      {coord && (
        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.3, ease: SUAVE }}
          // Sin posición propia: el padre decide dónde vive (en /crue, al
          // fondo del carril derecho, apilada bajo la card de congestión).
          className="pointer-events-auto w-full rounded-[2rem] bg-neutral-900/85 backdrop-blur-xl border border-[color:var(--color-borde)] overflow-hidden shadow-2xl"
          aria-label="Vista de calle del punto seleccionado"
        >
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <h3 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
              Vista de calle
            </h3>
            <span className="text-[10px] tabular text-[color:var(--color-texto-tenue)]">
              {coord.lat.toFixed(4)}, {coord.lng.toFixed(4)}
            </span>
            <button
              onClick={onCerrar}
              className="ml-auto px-2 text-[color:var(--color-texto-tenue)]"
              style={{ minHeight: 0 }}
              aria-label="Cerrar vista de calle"
            >
              ✕
            </button>
          </div>

          {/* ── Estados ── */}
          {!mapillaryConfigurado && (
            <p className="px-4 pb-4 text-xs leading-relaxed text-[color:var(--color-texto-tenue)]">
              Falta <code>NEXT_PUBLIC_MAPILLARY_TOKEN</code> en{" "}
              <code>.env.local</code>. Crea un token gratis en
              mapillary.com/dashboard/developers y reinicia{" "}
              <code>next dev</code>.
            </p>
          )}

          {mapillaryConfigurado && fotos === null && (
            <div className="mx-4 mb-4 h-44 rounded-2xl bg-[color:var(--color-superficie)] latido" />
          )}

          {mapillaryConfigurado && fotos !== null && fotos.length === 0 && (
            <p className="px-4 pb-4 text-xs text-[color:var(--color-texto-tenue)]">
              Sin fotos a nivel de calle en ~150 m. Mapillary es crowdsourced:
              las vías principales suelen tener cobertura; las cuadras
              internas, no siempre.
            </p>
          )}

          {foto && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={foto.url}
                alt="Vista a nivel de calle del entorno"
                className="h-44 w-full object-cover"
              />
              <div className="flex items-center gap-2 px-4 py-1.5 text-[10px] text-[color:var(--color-texto-tenue)]">
                <span>
                  {foto.distanciaM !== null && `a ${foto.distanciaM} m`}
                  {fechaFoto(foto.capturadaEn) &&
                    ` · foto de ${fechaFoto(foto.capturadaEn)}`}
                  {" · © Mapillary"}
                </span>
                <a
                  href={`https://www.mapillary.com/app/?pKey=${foto.id}&focus=photo`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto underline text-[color:var(--color-info)]"
                >
                  abrir 360°
                </a>
              </div>

              {fotos!.length > 1 && (
                <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto">
                  {fotos!.map((f, i) => (
                    <button
                      key={f.id}
                      onClick={() => setActiva(i)}
                      className={`shrink-0 rounded-lg overflow-hidden border-2 ${
                        i === activa
                          ? "border-[color:var(--color-info)]"
                          : "border-transparent opacity-70"
                      }`}
                      style={{ minHeight: 0 }}
                      aria-label={`Foto ${i + 1} del entorno`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.url}
                        alt=""
                        className="h-12 w-16 object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
