"use client";

/**
 * FotoCalle — la foto Mapillary más cercana a una coordenada.
 *
 * Pensada para "así se ve la llegada": la entrada de la sede que aceptó.
 * Se oculta sola si no hay token o no hay cobertura en esa cuadra, así que
 * es seguro ponerla en cualquier parte sin condicionar nada.
 */

import { useEffect, useState } from "react";
import type { Coordenada } from "@/lib/types";
import { fotoCercana, type FotoMapillary } from "@/lib/mapillary";

export function FotoCalle({
  coord,
  titulo,
}: {
  coord: Coordenada;
  titulo: string;
}) {
  const [foto, setFoto] = useState<FotoMapillary | null>(null);

  useEffect(() => {
    let vigente = true;
    fotoCercana(coord).then((f) => {
      if (vigente) setFoto(f);
    });
    return () => {
      vigente = false;
    };
  }, [coord.lat, coord.lng]);

  if (!foto) return null;

  return (
    <figure className="mt-5 overflow-hidden rounded-2xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] text-left">
      {/* <img> a propósito: el host de Mapillary es dinámico y esto no
          amerita abrir remotePatterns en next.config para un thumbnail. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={foto.url}
        alt={`Vista de calle de la llegada: ${titulo}`}
        className="h-40 w-full object-cover"
        loading="lazy"
      />
      <figcaption className="px-3 py-1.5 text-[10px] text-[color:var(--color-texto-tenue)]">
        Así se ve la llegada · © Mapillary
      </figcaption>
    </figure>
  );
}
