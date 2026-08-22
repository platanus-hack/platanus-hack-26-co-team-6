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
 */

import { useEffect } from "react";

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
    <header className="flex items-center gap-2 mb-6">
      <span className="text-2xl" aria-hidden>
        🏥
      </span>
      <span className="font-bold text-lg">PULSO</span>
      <span className="text-xs text-[color:var(--color-texto-tenue)]">
        jefatura de urgencias · red distrital
      </span>

      <span className="ml-auto flex items-center gap-1.5 text-xs text-[color:var(--color-texto-tenue)]">
        <span
          aria-hidden
          className={`inline-block w-1.5 h-1.5 rounded-full ${conectado ? "latido" : ""}`}
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
