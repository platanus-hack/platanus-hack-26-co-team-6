"use client";

/**
 * Slot de imagen de la landing. Si el registro no tiene `src`, pinta un
 * placeholder que dice exactamente qué imagen va ahí; con `src`, pinta
 * la imagen real; con `video`, un clip mudo en loop (gana sobre `src`).
 * Cambiar una cosa por la otra es editar config.ts.
 */

import Image from "next/image";
import { useReducedMotion } from "motion/react";
import { ImageIcon } from "lucide-react";
import { IMAGENES } from "./config";

export function ImagenSlot({
  id,
  className = "",
  sizes = "100vw",
}: {
  id: keyof typeof IMAGENES;
  className?: string;
  sizes?: string;
}) {
  const registro = IMAGENES[id];
  const sinMovimiento = useReducedMotion();

  if (registro?.video) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <video
          src={registro.video}
          autoPlay={!sinMovimiento}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={registro.alt}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    );
  }

  if (registro?.src) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <Image
          src={registro.src}
          alt={registro.alt}
          fill
          sizes={sizes}
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-superficie border border-dashed border-borde ${className}`}
      role="img"
      aria-label={registro?.alt ?? "Imagen pendiente"}
    >
      {/* Trama sutil para que el placeholder no se vea plano en el proyector */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 20%, rgba(255,59,71,0.10), transparent 45%), radial-gradient(circle at 75% 80%, rgba(75,159,255,0.08), transparent 45%)",
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
        <ImageIcon className="w-8 h-8 text-texto-tenue" aria-hidden />
        <p className="text-sm font-medium text-texto">{registro?.alt}</p>
        <p className="text-xs text-texto-tenue max-w-xs leading-relaxed">
          {registro?.nota}
        </p>
        <code className="text-[10px] text-texto-tenue/70 tracking-wider">
          landing/config.ts → “{id}”
        </code>
      </div>
    </div>
  );
}
