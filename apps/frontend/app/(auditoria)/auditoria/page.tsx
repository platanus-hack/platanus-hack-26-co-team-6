"use client";

/**
 * /auditoria — la puerta de la vista forense.
 *
 * Existe por una razón concreta y aburrida: `DESTINO.auditor` apunta a
 * `/auditoria` y esa ruta está en `CONSOLAS_CONSTRUIDAS`, pero lo único que
 * había colgando era `/auditoria/casos/[id]`. Un auditor que entraba con sus
 * credenciales correctas aterrizaba en un 404 — justo la pantalla que ese
 * `Set` existe para evitar.
 *
 * Es deliberadamente mínima: un buscador por id y la lista de lo que hay
 * ahora mismo. La reconstrucción de verdad vive en la vista por caso (4.12);
 * esto solo es cómo se llega.
 *
 * ── DE DÓNDE SALE LA LISTA, Y POR QUÉ ESO NO BASTA ─────────────────
 * De `GET /estado`, que devuelve los casos **vivos**. Un auditor normalmente
 * viene a mirar un caso de hace una semana, y ese no está aquí: el estado se
 * pierde al reiniciar core (tarea 1.2). Por eso el buscador por id es el
 * camino principal y la lista es solo la comodidad — y la pantalla lo dice,
 * en vez de dejar creer que esto es el archivo histórico.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import * as api from "@/lib/api";
import type { EstadoResponse } from "@/lib/types";
import { ETIQUETA_TRIAGE } from "@/lib/presentacion";

export default function IndiceAuditoria() {
  const [estado, setEstado] = useState<EstadoResponse | null>(null);
  const [conectado, setConectado] = useState(true);
  const [id, setId] = useState("");

  const cargar = useCallback(async (vivo: { actual: boolean }) => {
    const d = await api.estado().catch(() => null);
    if (!vivo.actual) return;
    setConectado(d !== null);
    if (d) setEstado(d);
  }, []);

  useEffect(() => {
    const vivo = { actual: true };
    void cargar(vivo);
    return () => {
      vivo.actual = false;
    };
  }, [cargar]);

  const casos = estado?.casos ?? [];
  const buscado = id.trim();

  return (
    <main className="min-h-screen max-w-3xl mx-auto p-4">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Auditoría de casos</h1>
        <p className="mt-1 text-xs text-[color:var(--color-texto-tenue)]">
          Cada lectura de un expediente queda registrada, con tu actor y la
          hora. Es parte de la auditoría, no un efecto secundario.
        </p>
      </header>

      <form
        className="mb-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Id del caso"
          aria-label="Id del caso a auditar"
          className="min-h-14 flex-1 rounded-md border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] px-4"
        />
        {buscado ? (
          <Link
            href={`/auditoria/casos/${encodeURIComponent(buscado)}`}
            className="inline-flex min-h-14 items-center justify-center rounded-md bg-[color:var(--color-marca)] px-6 font-semibold text-white"
          >
            Abrir expediente
          </Link>
        ) : (
          <span className="inline-flex min-h-14 items-center justify-center rounded-md border border-[color:var(--color-borde)] px-6 text-sm text-[color:var(--color-texto-tenue)]">
            Escribe un id
          </span>
        )}
      </form>

      <h2 className="mb-2 text-sm font-semibold">Casos abiertos ahora</h2>
      <p className="mb-3 text-xs text-[color:var(--color-texto-tenue)]">
        {!conectado
          ? "Core no responde: esta lista está vacía por eso, no porque no haya casos."
          : "Solo los casos vivos. El histórico necesita la persistencia de la tarea 1.2; hasta entonces, un caso cerrado se busca por id."}
      </p>

      {casos.length === 0 ? (
        <p className="rounded-lg border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] p-4 text-sm text-[color:var(--color-texto-tenue)]">
          No hay casos abiertos.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {casos.map((c) => (
            <li key={c.id}>
              <Link
                href={`/auditoria/casos/${encodeURIComponent(c.id)}`}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)] px-4 py-2"
              >
                <span className="shrink-0 rounded px-2 py-0.5 text-xs font-bold tabular-nums">
                  {ETIQUETA_TRIAGE[c.triage] ?? `T${c.triage}`}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {c.dxDescripcion || c.resumen}
                </span>
                <code className="shrink-0 text-xs text-[color:var(--color-texto-tenue)]">
                  {c.id.slice(0, 8)}
                </code>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
