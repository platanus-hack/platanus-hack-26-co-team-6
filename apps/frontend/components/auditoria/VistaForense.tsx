"use client";

/**
 * El expediente forense de un caso — tarea 4.12.
 *
 * **Es la pantalla que hace defendible todo lo demás.** Sin ella, "todo es
 * auditable" es una afirmación sin nada que la respalde: se puede decir en el
 * pitch y no se puede enseñar a un jurado, a una interventoría ni a un juez.
 *
 * ── TRES DECISIONES QUE EXPLICAN CÓMO ESTÁ ESCRITA ────────────────
 *
 * 1. **Una lectura, no un polling.** Cada apertura del expediente escribe su
 *    propio `lectura_auditoria` en el servidor. Refrescar cada dos segundos
 *    —como hacen /crue y /hospital— llenaría la auditoría del caso con las
 *    visitas de quien la está mirando. Se lee una vez, y volver a leer es un
 *    botón que dice lo que hace.
 *
 * 2. **Nada plegado.** Lo que se esconde tras un desplegable no sale impreso,
 *    y este documento se imprime. Todo está desplegado; el navegador pagina.
 *
 * 3. **El PDF es `window.print()`.** Ni una dependencia nueva: la hoja
 *    `@media print` de `impresion.ts` fuerza negro sobre blanco y cada estado
 *    lleva su marca de texto, para que impreso en una láser en blanco y negro
 *    se distinga igual. Ver ahí el porqué completo.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ErrorApi } from "@/lib/api";
import { expediente as pedirExpediente } from "@/lib/api-auditoria";
import {
  aJsonExportable,
  esConsulta,
  nombreArchivo,
  type ExpedienteCaso,
} from "@/lib/auditoria-modelo";
import EvidenciaMatch from "./EvidenciaMatch";
import LineaTiempo from "./LineaTiempo";
import { CSS_IMPRESION } from "./impresion";

type Estado =
  | { fase: "cargando" }
  | { fase: "listo"; expediente: ExpedienteCaso }
  | { fase: "error"; mensaje: string; status: number | null };

export default function VistaForense({ casoId }: { casoId: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });

  const cargar = useCallback(async () => {
    setEstado({ fase: "cargando" });
    try {
      setEstado({ fase: "listo", expediente: await pedirExpediente(casoId) });
    } catch (e) {
      setEstado({
        fase: "error",
        mensaje: e instanceof Error ? e.message : "core no respondió",
        status: e instanceof ErrorApi ? e.status : null,
      });
    }
  }, [casoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <main className="expediente min-h-screen p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      <style dangerouslySetInnerHTML={{ __html: CSS_IMPRESION }} />

      <header className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-bold">Expediente del caso</h1>
          <Link
            href="/crue"
            className="no-imprimir text-xs underline text-[color:var(--color-texto-tenue)]"
          >
            ← Volver a /crue
          </Link>
        </div>
        <p className="text-sm tabular text-[color:var(--color-texto-tenue)]">
          {casoId}
        </p>
      </header>

      {estado.fase === "cargando" && (
        <p className="text-sm text-[color:var(--color-texto-tenue)]">
          Leyendo el expediente…
        </p>
      )}

      {estado.fase === "error" && (
        <NoSePuede
          mensaje={estado.mensaje}
          status={estado.status}
          onReintentar={() => void cargar()}
        />
      )}

      {estado.fase === "listo" && (
        <Documento expediente={estado.expediente} onRecargar={() => void cargar()} />
      )}
    </main>
  );
}

function Documento({
  expediente,
  onRecargar,
}: {
  expediente: ExpedienteCaso;
  onRecargar: () => void;
}) {
  const hechos = expediente.filas.filter((f) => !esConsulta(f.tipo));
  const consultas = expediente.filas.filter((f) => esConsulta(f.tipo));

  function exportarJson() {
    const blob = new Blob([aJsonExportable(expediente)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo(expediente.casoId, "json");
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* ── Acciones (no salen impresas) ── */}
      <div className="no-imprimir flex flex-wrap gap-2">
        <button
          onClick={exportarJson}
          className="px-4 py-2 rounded-full border border-[color:var(--color-borde)] text-sm font-medium"
        >
          Exportar JSON
        </button>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-full border border-[color:var(--color-borde)] text-sm font-medium"
        >
          Imprimir o guardar como PDF
        </button>
        <button
          onClick={onRecargar}
          className="px-4 py-2 rounded-full border border-[color:var(--color-borde)] text-sm text-[color:var(--color-texto-tenue)]"
          // Se avisa porque es verdad: cada lectura es un acceso registrado.
          title="Vuelve a leer el expediente. Queda registrado como un acceso más."
        >
          Volver a leer
        </button>
      </div>

      {/* ── Quién lo está leyendo y con qué se queda fuera ── */}
      <section className="bloque border border-[color:var(--color-borde)] rounded-xl p-3 space-y-1 text-xs">
        <p>
          <strong>Leído por</strong> {expediente.solicitante.id} · rol{" "}
          {expediente.solicitante.rolEfectivo}
          {expediente.solicitante.organizacionId
            ? ` · organización ${expediente.solicitante.organizacionId}`
            : ""}
        </p>
        <p className="text-[color:var(--color-texto-tenue)]">
          Generado {new Date(expediente.generadoEn).toLocaleString("es-CO")}
        </p>
        {expediente.solicitante.identidadProvisional && (
          <p className="text-[color:var(--color-alerta)]">
            ⚠ Identidad provisional: la sesión de core es una contraseña de
            turno, no una persona. Este acceso queda atribuido al turno hasta
            que exista identidad real.
          </p>
        )}
        <p>
          <strong>Redacción aplicada:</strong>{" "}
          {expediente.politicaRedaccion.motivo} Campos tachados:{" "}
          {expediente.politicaRedaccion.claves.join(", ")}.
        </p>
      </section>

      {/* ── La historia ── */}
      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
          Línea de tiempo ({hechos.length})
        </h2>
        <LineaTiempo filas={hechos} />
      </section>

      {/* ── La evidencia del motor ── */}
      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
          Evidencia de la decisión de ruteo
        </h2>
        <EvidenciaMatch evidencia={expediente.evidencia} />
      </section>

      {/* ── Quién ha mirado este expediente ── */}
      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
          Accesos al expediente ({consultas.length})
        </h2>
        <p className="text-xs text-[color:var(--color-texto-tenue)]">
          Cada lectura es un evento más, append-only — incluida la que generó
          esta pantalla. Van aparte para que las visitas no sepulten la
          historia del traslado, pero son parte del acta y salen en el JSON.
        </p>
        <LineaTiempo filas={consultas} />
      </section>

      {/* ── Lo que el expediente confiesa ── */}
      <section className="bloque border border-[color:var(--color-borde)] rounded-xl p-3 space-y-1 text-xs">
        <h2 className="text-sm font-semibold">Alcance de este registro</h2>
        <p>{expediente.cobertura.nota}</p>
        {expediente.registro.advertencia && (
          <p className="text-[color:var(--color-alerta)]">
            ⚠ {expediente.registro.advertencia}
          </p>
        )}
      </section>

      <p className="pie-impresion text-[10px]">
        PULSO · expediente del caso {expediente.casoId} · impreso el{" "}
        {new Date().toLocaleString("es-CO")} · leído por{" "}
        {expediente.solicitante.id} ({expediente.solicitante.rolEfectivo}).
        Documento redactado según la política declarada arriba.
      </p>
    </>
  );
}

/**
 * El 403 no es una pantalla de error: es información.
 *
 * Core explica en el mensaje exactamente qué rol falta y por qué (hoy, que la
 * identidad real todavía no existe). Repetirlo aquí en vez de pintar "algo
 * salió mal" es lo que evita que alguien se pase media hora leyendo código.
 */
function NoSePuede({
  mensaje,
  status,
  onReintentar,
}: {
  mensaje: string;
  status: number | null;
  onReintentar: () => void;
}) {
  const prohibido = status === 403;
  return (
    <div className="border border-[color:var(--color-borde)] rounded-xl p-4 space-y-3 max-w-lg">
      <p className="text-sm font-semibold">
        {prohibido
          ? "Tu sesión no puede abrir este expediente"
          : "No se pudo leer el expediente"}
      </p>
      <p className="text-xs text-[color:var(--color-texto-tenue)]">{mensaje}</p>
      {prohibido && (
        <p className="text-xs text-[color:var(--color-texto-tenue)]">
          Lo verifica el servidor, no esta pantalla: lo abren un auditor, el
          regulador del CRUE, o el administrador de la organización dueña del
          caso.
        </p>
      )}
      <button
        onClick={onReintentar}
        className="no-imprimir px-4 py-2 rounded-full border border-[color:var(--color-borde)] text-sm"
      >
        Reintentar
      </button>
    </div>
  );
}
