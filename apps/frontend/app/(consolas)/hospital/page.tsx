"use client";

/**
 * /hospital — CARRIL DE SEBAS
 *
 * La consola del jefe de urgencias. Dos botones. Nada más.
 *
 * Sirve tres propósitos:
 *   1. Es el fallback absoluto del demo: si se cae el wifi de los celulares,
 *      el handshake sigue funcionando desde aquí.
 *   2. Es la pantalla que se proyecta cuando se muestra el "otro lado".
 *   3. Es donde se ve el blindaje legal: en triage I no hay botón de rechazo.
 *
 * ⚠️ REGLA DE PRODUCTO QUE NO SE NEGOCIA:
 *    La Ley 1751 de 2015 obliga a atender urgencias sin autorización previa.
 *    "Rechazar" NO es un derecho a negar atención: es una DECLARACIÓN DE
 *    CAPACIDAD, queda auditada con timestamp, y en triage I ni siquiera se
 *    ofrece — escala directo al CRUE. Si alguien del jurado pregunta,
 *    esta pantalla es la respuesta.
 *
 * Esta página orquesta: polling, estado de conexión y qué hacer con cada
 * respuesta. Lo que se pinta vive en components/hospital/.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { EstadoResponse } from "@/lib/types";
import { Cabecera } from "@/components/hospital/Cabecera";
import { SolicitudTraslado } from "@/components/hospital/SolicitudTraslado";
import { HistorialAuditoria } from "@/components/hospital/HistorialAuditoria";
import * as api from "@/lib/api";

const POLLING_MS = 2000;

export default function Hospital() {
  const [estado, setEstado] = useState<EstadoResponse | null>(null);
  const [conectado, setConectado] = useState(true);
  const [eligiendoMotivo, setEligiendoMotivo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /**
   * Trae el estado y marca si core respondió.
   *
   * El catch mantiene vivo el polling si core parpadea: el siguiente tick
   * reintenta en vez de dejar la consola congelada. Pero además se marca la
   * caída — sin eso, core caído se ve igual que "no hay solicitudes", y
   * alguien podría quedarse mirando una pantalla muerta.
   *
   * `vivo` evita escribir estado después de desmontar: el polling es de 2 s y
   * una respuesta puede llegar cuando ya se cambió de consola.
   */
  const cargar = useCallback(async (vivo = { actual: true }) => {
    const d = await api.estado().catch(() => null);
    if (!vivo.actual) return;
    setConectado(d !== null);
    if (d) setEstado(d);
  }, []);

  useEffect(() => {
    const vivo = { actual: true };

    // La primera carga sale en el siguiente turno del event loop, no dentro
    // del cuerpo del efecto: así el montaje no encadena un render extra.
    const inicial = setTimeout(() => void cargar(vivo), 0);
    const id = setInterval(() => void cargar(vivo), POLLING_MS);

    return () => {
      vivo.actual = false;
      clearTimeout(inicial);
      clearInterval(id);
    };
  }, [cargar]);

  async function responder(
    handshakeId: string,
    decision: "aceptado" | "rechazado",
    motivo?: string,
  ) {
    setEligiendoMotivo(null);
    try {
      const r = await api.responder({ handshakeId, decision, motivo });

      // La respuesta pudo no aplicarse: la solicitud vencía a los 45s y el
      // caso ya siguió a otra sede. Ahora el cronómetro de la tarjeta lo
      // anticipa, pero el aviso se queda: entre el último tick y el toque
      // caben unos milisegundos, y quien lo tocó tiene que saber que no
      // preparara una cama para un paciente que no viene.
      setAviso(
        r.aplicada
          ? null
          : r.handshake.estado === "timeout"
            ? "Esta solicitud ya había vencido. PULSO la envió a otra sede."
            : `Esta solicitud ya estaba ${r.handshake.estado}.`,
      );
    } catch {
      setAviso("No se pudo enviar la respuesta. Revisa la conexión con core.");
    }

    await cargar();
  }

  const pendientes = estado?.handshakes.filter((h) => h.estado === "enviado") ?? [];
  const resueltos = estado?.handshakes.filter((h) => h.estado !== "enviado") ?? [];
  const caso = (id: string) => estado?.casos.find((c) => c.id === id);
  const nombreSede = (cod: string) =>
    estado?.congestion.find((c) => c.codigo === cod)?.nombre;

  return (
    <main className="min-h-screen w-full px-4 py-4 sm:px-8 sm:py-6 lg:px-12">
      <Cabecera pendientes={pendientes.length} conectado={conectado} />

      {/*
        Las dos puertas de la consola. Sin ellas, capacidad (3.4) y recepcion
        (4.3) solo se alcanzan pegando la URL a mano, que es tanto como no
        existir: cada tarea se construyo sin poder tocar este archivo, que
        tenia otro dueno en la ola.
      */}
      <nav aria-label="Vistas de urgencias" className="mb-4 grid gap-2 sm:grid-cols-2">
        <Link href="/hospital/capacidad" className="flex min-h-14 items-center justify-center rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie-alta)] px-4 text-center font-semibold">Declarar capacidad y estado operativo</Link>
        <Link href="/hospital/recepcion" className="flex min-h-14 items-center justify-center rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie-alta)] px-4 text-center font-semibold">Prearribos en camino</Link>
      </nav>

      {aviso && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg flex items-start gap-2 text-sm
                     bg-[color:var(--color-alerta)]/15
                     border border-[color:var(--color-alerta)]/40"
        >
          <span aria-hidden>⏱</span>
          <span className="flex-1">{aviso}</span>
          <button
            onClick={() => setAviso(null)}
            aria-label="Cerrar aviso"
            className="shrink-0 px-2 text-[color:var(--color-texto-tenue)]"
          >
            ✕
          </button>
        </div>
      )}

      {pendientes.length === 0 && <SinSolicitudes conectado={conectado} />}

      <div className="space-y-3">
        {pendientes.map((h) => {
          const c = caso(h.casoId);
          if (!c) return null;

          return (
            <SolicitudTraslado
              key={h.id}
              handshake={h}
              caso={c}
              sede={nombreSede(h.sedeCodigo)}
              eligiendoMotivo={eligiendoMotivo === h.id}
              onAceptar={() => void responder(h.id, "aceptado")}
              onPedirMotivo={() => setEligiendoMotivo(h.id)}
              onRechazar={(motivo) => void responder(h.id, "rechazado", motivo)}
              onCancelarMotivo={() => setEligiendoMotivo(null)}
            />
          );
        })}
      </div>

      <HistorialAuditoria
        handshakes={resueltos}
        nombreSede={nombreSede}
        caso={caso}
      />
    </main>
  );
}

/**
 * Vacío y caída se ven igual si no se distinguen a propósito: en los dos
 * casos no hay tarjetas. Uno es una invitación a despachar; el otro es un
 * problema que hay que ir a arreglar.
 */
function SinSolicitudes({ conectado }: { conectado: boolean }) {
  if (!conectado) {
    return (
      <div className="p-10 text-center rounded-xl border border-dashed border-[color:var(--color-critico)]/50">
        <p className="font-semibold text-[color:var(--color-critico)]">
          Sin conexión con core
        </p>
        <p className="text-xs mt-2 text-[color:var(--color-texto-tenue)]">
          La consola sigue reintentando cada 2 segundos. Verifica que core esté
          corriendo en el puerto 3001.
        </p>
      </div>
    );
  }

  return (
    <div className="p-10 text-center rounded-xl border border-dashed border-[color:var(--color-borde)]">
      <p className="text-[color:var(--color-texto-tenue)]">
        Ninguna solicitud esperando respuesta.
      </p>
      <p className="text-xs mt-2 text-[color:var(--color-texto-tenue)]">
        Abre <code>/campo</code> en otra pestaña y despacha un caso.
      </p>
    </div>
  );
}
