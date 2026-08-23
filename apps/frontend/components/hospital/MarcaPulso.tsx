/**
 * La marca de la consola, en el mismo lenguaje que el header de la landing:
 * píldora glass con el isotipo rojo y el wordmark en minúscula. Se comparte
 * entre las vistas de /hospital para que la consola y la landing se lean como
 * el mismo producto.
 */

import { LogoPulso } from "@/components/LogoPulso";

export function MarcaPulso({ rotulo }: { rotulo?: string }) {
  return (
    <span className="inline-flex h-12 shrink-0 items-center gap-2.5 rounded-2xl bg-neutral-900/70 px-4 shadow-lg backdrop-blur-lg">
      <LogoPulso
        decorativo
        className="h-6 w-auto shrink-0 text-critico drop-shadow-[0_0_10px_rgba(255,59,71,0.45)]"
      />
      <span className="text-lg font-medium tracking-tight text-white">
        pulso
      </span>
      {rotulo && (
        <span className="hidden text-xs text-white/50 sm:inline">{rotulo}</span>
      )}
    </span>
  );
}
