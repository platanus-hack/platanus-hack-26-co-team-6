"use client";

/**
 * Cabecera de la consola de urgencias.
 *
 * Dice tres cosas y ninguna es decorativa:
 *
 *  - QUÉ ESTÁ MIRANDO. Esta pantalla ve las solicitudes de toda la red, no
 *    las de un hospital. En el demo eso es a propósito —una sola pantalla
 *    muestra los dos lados del handshake— pero sin decirlo parece un error.
 *
 *  - CUÁNTAS ESPERAN. El número va en el título del documento además de aquí:
 *    esta consola suele quedar en una pestaña de fondo o en un portátil en la
 *    esquina, y una solicitud que vence en 45 segundos no puede depender de
 *    que alguien esté mirando.
 *
 *  - QUE SIGUE VIVA. El polling es cada 2 s; si core se cae, el punto deja de
 *    latir. Es la diferencia entre "no hay solicitudes" y "no hay conexión".
 *
 * La forma es la del header de la landing: píldoras glass, wordmark en
 * minúscula. Misma marca, otro lado del producto.
 */

import { useEffect } from "react";
import { MarcaPulso } from "./MarcaPulso";

export function Cabecera({ pendientes, conectado }: { pendientes: number; conectado: boolean }) {
  // El título del documento es el único aviso que funciona con la pestaña
  // en segundo plano. Se restaura al desmontar para no dejarlo pegado.
  useEffect(() => {
    const original = document.title;
    document.title = pendientes > 0 ? `(${pendientes}) PULSO · urgencias` : original;
    return () => {
      document.title = original;
    };
  }, [pendientes]);

  return (
    <header className="mb-6 flex flex-wrap items-center gap-3">
      <MarcaPulso rotulo="jefatura de urgencias · red distrital" />

      <span
        className="ml-auto inline-flex h-12 items-center gap-2 rounded-2xl
                   bg-neutral-900/70 px-4 text-xs font-medium shadow-lg
                   backdrop-blur-lg text-texto-tenue"
      >
        <span
          aria-hidden
          className={`inline-block h-1.5 w-1.5 rounded-full ${conectado ? "latido" : ""}`}
          style={{
            background: conectado
              ? "var(--color-estable)"
              : "var(--color-critico)",
          }}
        />
        {conectado ? "en vivo" : "sin conexión"}
      </span>
    </header>
  );
}
