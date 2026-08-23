"use client";

/**
 * §1 — El inicio del turno.
 *
 * Lo que ve el paramédico al entrar, y lo único que ve: **dictar uno nuevo o
 * mirar los que ya pasaron por aquí.** Tres bloques, en este orden y no en otro:
 *
 *   1. Nuevo caso        — la acción. Ocupa el pulgar.
 *   2. En curso          — lo que todavía espera respuesta de un hospital.
 *   3. Recientes         — los que ya se cerraron.
 *
 * ── POR QUÉ EL BOTÓN ES TAN GRANDE ────────────────────────────────
 * Se toca de pie, dentro de un vehículo en movimiento, posiblemente con
 * guantes y con una mano ocupada. El mínimo tocable del proyecto son 44px;
 * este es el gesto principal de todo el módulo, así que se lleva mucho más.
 *
 * ── POR QUÉ AQUÍ NO HAY MAPA ──────────────────────────────────────
 * Lo hubo, y era decoración: en esta pantalla nadie hace nada con él. Se mudó
 * a la de dictado, donde la ubicación **sí** es accionable — es el punto desde
 * el que se busca destino, y verlo mal antes de analizar todavía se puede
 * arreglar. Después del ranking, ya no.
 */

import { Mic } from "lucide-react";
import type { CasoTablero } from "@/lib/tablero-modelo";
import { TableroCasos } from "./TableroCasos";

export function PantallaInicio({
  items,
  seleccionado,
  onNuevo,
  onSeleccionar,
}: {
  items: CasoTablero[];
  /** El caso abierto en el panel de detalle, para marcarlo en la lista. */
  seleccionado: string | null;
  onNuevo: () => void;
  /** Toca una fila: abre su detalle. Pasar el mismo id lo cierra. */
  onSeleccionar: (casoId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-6">
      {/*
        El icono va en un disco y a la izquierda del texto, no encima.
        Centrado y apilado funcionaba en el ancho de un teléfono; estirado a
        una columna de escritorio quedaba un icono minúsculo flotando sobre
        una barra roja de medio metro. Con el disco, el botón tiene un ancla
        visual y aguanta cualquier ancho.
      */}
      <button
        onClick={onNuevo}
        className="group flex w-full items-center gap-4 rounded-3xl
                   border border-white/10
                   bg-[color:var(--color-critico)] p-5 text-left text-white
                   shadow-lg shadow-[color:var(--color-critico)]/25
                   transition-transform active:scale-[0.99]"
      >
        <span
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15"
          aria-hidden
        >
          <Mic className="size-7" strokeWidth={2.2} />
        </span>
        <span className="min-w-0">
          <span className="block text-xl font-bold leading-tight">
            Nuevo caso
          </span>
          <span className="block text-xs font-normal opacity-85">
            dicta y el sistema busca destino
          </span>
        </span>
      </button>

      <TableroCasos
        items={items}
        seleccionado={seleccionado}
        onSeleccionar={onSeleccionar}
      />
    </section>
  );
}
