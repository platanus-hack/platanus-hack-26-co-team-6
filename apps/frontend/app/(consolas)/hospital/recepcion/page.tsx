"use client";

/**
 * /hospital/recepcion — la puerta a los prearribos abiertos.
 *
 * Existe por una razón práctica: una vista por caso a la que solo se llega
 * pegando un uuid en la barra de direcciones no la usa nadie. Aquí se listan
 * los traslados que esta sede ya aceptó y que todavía no han llegado.
 *
 * ── DE DÓNDE SALE LA LISTA ────────────────────────────────────────
 * Hoy de `GET /estado`, cruzando casos con handshakes aceptados. Cuando exista
 * la tabla `recepcion` (tarea 4.1) esto debería ser `GET /hospital/recepciones`
 * filtrado **en el servidor** por la sede de la sesión: cruzar aquí significa
 * que el navegador recibe los casos de toda la red y descarta los ajenos, que
 * es exactamente lo que el aislamiento por inquilino no debe hacer. Hasta
 * entonces, `/estado` ya devolvía eso mismo a `/hospital` y esta vista no
 * empeora nada — pero no se queda así.
 *
 * No se toca `hospital/page.tsx` para enlazar desde allí: ese archivo tiene
 * otro dueño en esta ola. La ruta se alcanza directo por URL.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Ambulance, ArrowRight } from "lucide-react";
import * as api from "@/lib/api";
import type { EstadoResponse } from "@/lib/types";
import { ETIQUETA_TRIAGE } from "@/lib/presentacion";
import { hace } from "@/lib/recepcion-modelo";
import { useAhora } from "@/components/hospital/recepcion/useAhora";

const SONDEO_MS = 3000;

export default function Recepciones() {
  const [estado, setEstado] = useState<EstadoResponse | null>(null);
  const [conectado, setConectado] = useState(true);
  const ahora = useAhora(5000);

  const cargar = useCallback(async (vivo: { actual: boolean }) => {
    const d = await api.estado().catch(() => null);
    if (!vivo.actual) return;
    setConectado(d !== null);
    if (d) setEstado(d);
  }, []);

  useEffect(() => {
    const vivo = { actual: true };
    const inicial = setTimeout(() => void cargar(vivo), 0);
    const id = setInterval(() => void cargar(vivo), SONDEO_MS);
    return () => {
      vivo.actual = false;
      clearTimeout(inicial);
      clearInterval(id);
    };
  }, [cargar]);

  const aceptados = (estado?.handshakes ?? []).filter(
    (h) => h.estado === "aceptado",
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Prearribos</h1>
      <p className="mt-1 text-sm text-[color:var(--color-texto-tenue)]">
        Traslados aceptados que todavía no han llegado a la puerta.
      </p>

      {aceptados.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[color:var(--color-borde)] p-10 text-center">
          <p className="text-[color:var(--color-texto-tenue)]">
            {conectado
              ? "Ningún traslado aceptado en curso."
              : "Sin conexión con core. Reintentando cada 3 segundos."}
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {aceptados.map((h) => {
            const caso = estado?.casos.find((c) => c.id === h.casoId);
            const sede = estado?.congestion.find(
              (c) => c.codigo === h.sedeCodigo,
            )?.nombre;

            return (
              <li key={h.id}>
                <Link
                  href={`/hospital/recepcion/${h.casoId}`}
                  className="flex items-center gap-3 rounded-2xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] p-4"
                >
                  <Ambulance
                    className="size-5 shrink-0 text-[color:var(--color-estable)]"
                    strokeWidth={2.2}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {caso?.dxDescripcion ?? "Caso sin diagnóstico"}
                    </p>
                    <p className="truncate text-xs text-[color:var(--color-texto-tenue)]">
                      {caso ? `Triage ${ETIQUETA_TRIAGE[caso.triage]} · ` : ""}
                      {sede ?? h.sedeCodigo}
                      {h.respondidoEn
                        ? ` · aceptado ${hace(h.respondidoEn, ahora)}`
                        : ""}
                    </p>
                  </div>
                  <ArrowRight
                    className="size-5 shrink-0 text-[color:var(--color-texto-tenue)]"
                    strokeWidth={2.2}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
