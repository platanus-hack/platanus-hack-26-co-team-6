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
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Ambulance, ArrowRight } from "lucide-react";
import * as api from "@/lib/api";
import type { EstadoResponse, Handshake } from "@/lib/types";
import { esHoraDorada, ETIQUETA_TRIAGE, nombresServicios } from "@/lib/presentacion";
import { hace } from "@/lib/recepcion-modelo";
import { useAhora } from "@/components/hospital/recepcion/useAhora";
import { MarcaPulso } from "@/components/hospital/MarcaPulso";

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
    <main className="min-h-screen w-full px-4 py-4 sm:px-8 sm:py-6 lg:px-12">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <MarcaPulso rotulo="prearribos · jefatura de urgencias" />
        <Link
          href="/hospital"
          className="ml-auto inline-flex h-11 items-center rounded-full border
                     border-borde bg-superficie/70 px-4 text-sm font-medium
                     backdrop-blur text-texto-tenue"
        >
          Solicitudes
        </Link>
      </div>

      <h1 className="text-2xl font-bold tracking-tight">Prearribos</h1>
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
        <TablaPrearribos aceptados={aceptados} estado={estado} ahora={ahora} />
      )}
    </main>
  );
}

const ETIQUETA_SEXO: Record<string, string> = {
  M: "masculino",
  F: "femenino",
  desconocido: "—",
};

const ETIQUETA_CANAL: Record<string, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  consola: "Consola",
};

/**
 * Todos los prearribos de una vez, columna por columna, en lugar de abrirlos
 * uno por uno: esta pantalla se proyecta en la pared de urgencias y quien la
 * mira compara traslados, no lee tarjetas. La fila entera navega al detalle;
 * el enlace del diagnóstico es el mismo destino para quien va con teclado.
 */
function TablaPrearribos({
  aceptados,
  estado,
  ahora,
}: {
  aceptados: Handshake[];
  estado: EstadoResponse | null;
  ahora: number;
}) {
  const router = useRouter();

  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-[color:var(--color-borde)] text-left text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
            <th scope="col" className="px-4 py-3 font-medium">Diagnóstico</th>
            <th scope="col" className="px-3 py-3 font-medium">Triage</th>
            <th scope="col" className="px-3 py-3 font-medium">Paciente</th>
            <th scope="col" className="px-3 py-3 font-medium">Servicios requeridos</th>
            <th scope="col" className="px-3 py-3 font-medium">Sede que aceptó</th>
            <th scope="col" className="px-3 py-3 font-medium">Canal</th>
            <th scope="col" className="px-3 py-3 font-medium">Aceptado</th>
            <th scope="col" className="px-3 py-3 font-medium">ETA al despachar</th>
            <th scope="col" className="px-3 py-3">
              <span className="sr-only">Abrir el prearribo</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {aceptados.map((h) => {
            const caso = estado?.casos.find((c) => c.id === h.casoId);
            const sede = estado?.congestion.find(
              (c) => c.codigo === h.sedeCodigo,
            )?.nombre;
            const destino = `/hospital/recepcion/${h.casoId}`;

            return (
              <tr
                key={h.id}
                onClick={() => router.push(destino)}
                className="cursor-pointer border-b border-[color:var(--color-borde)]
                           last:border-b-0
                           hover:bg-[color:var(--color-superficie-alta)]/60"
              >
                <td className="px-4 py-3">
                  <Link
                    href={destino}
                    className="flex items-center gap-2 font-semibold"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Ambulance
                      className="size-4 shrink-0 text-[color:var(--color-estable)]"
                      strokeWidth={2.2}
                    />
                    {caso?.dxDescripcion ?? "Caso sin diagnóstico"}
                  </Link>
                  {caso && (caso.dxCie10 || caso.signosAlarma.length > 0) && (
                    <p className="mt-0.5 max-w-[36ch] truncate pl-6 text-xs text-[color:var(--color-texto-tenue)]">
                      {[caso.dxCie10, caso.signosAlarma.join(", ")]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {caso ? (
                    <span
                      style={
                        esHoraDorada(caso.triage)
                          ? { color: "var(--color-critico)" }
                          : undefined
                      }
                    >
                      {ETIQUETA_TRIAGE[caso.triage]}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {caso
                    ? `${caso.edad !== null ? `${caso.edad} años` : "edad s/d"} · ${
                        ETIQUETA_SEXO[caso.sexo] ?? caso.sexo
                      }`
                    : "—"}
                </td>
                <td className="px-3 py-3 text-xs">
                  {caso && caso.serviciosRequeridos.length > 0
                    ? nombresServicios(caso.serviciosRequeridos)
                    : "—"}
                </td>
                <td className="px-3 py-3">{sede ?? h.sedeCodigo}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {ETIQUETA_CANAL[h.canal] ?? h.canal}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-[color:var(--color-texto-tenue)]">
                  {h.respondidoEn ? hace(h.respondidoEn, ahora) : "—"}
                </td>
                <td className="px-3 py-3 whitespace-nowrap tabular">
                  {h.etaMinAlDespachar != null
                    ? `${h.etaMinAlDespachar} min`
                    : "—"}
                </td>
                <td className="px-3 py-3">
                  <ArrowRight
                    aria-hidden
                    className="size-4 text-[color:var(--color-texto-tenue)]"
                    strokeWidth={2.2}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
