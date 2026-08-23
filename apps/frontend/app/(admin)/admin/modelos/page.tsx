"use client";

/**
 * `/admin/modelos` — con qué se procesa un caso, y con qué se procesó.
 *
 * Dos artefactos versionados con la misma máquina que los catálogos:
 *   prompt_clinico   con qué se leyó el dictado
 *   config_scoring   con qué parámetros se rankeó
 *
 * Y la pregunta que esta pantalla existe para responder:
 *
 *   "¿Con qué versión de prompt se leyó el dictado de este caso de hace una
 *    semana?"
 *
 * Sin esa respuesta, comparar la tasa de aceptación de marzo con la de abril
 * compara dos motores distintos creyendo que compara dos redes hospitalarias
 * — y el dataset es el activo del producto.
 */

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import * as api from "@/lib/api-admin";
import {
  NOMBRE_COLECCION,
  PROPOSITO_COLECCION,
  comparableConHoy,
  describirDesfase,
  identidad,
  type CasoProcesado,
  type Modelo,
  type VersionEntrada,
  type VistaModelo,
} from "@/lib/catalogos-modelo";
import { Tarjeta, useAdmin } from "@/components/admin/MarcoAdmin";
import { Historial } from "@/components/admin/Historial";
import { EditorVersion, type Guardado } from "@/components/admin/EditorVersion";

export default function Modelos() {
  const { acceso } = useAdmin();
  const [vistas, setVistas] = useState<VistaModelo[]>([]);
  const [editando, setEditando] = useState<{ modelo: Modelo; entrada: VersionEntrada } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setVistas(await api.modelos());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los modelos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (acceso?.permitido) void cargar();
  }, [acceso?.permitido, cargar]);

  async function guardar(g: Guardado) {
    if (!editando) return;
    await api.nuevaVersion(editando.modelo, g.codigo, {
      etiqueta: g.etiqueta,
      datos: g.datos,
      activo: g.activo,
      motivo: g.motivo,
    });
    setEditando(null);
    await cargar();
  }

  return (
    <div className="space-y-6">
      <BuscadorDeCaso />

      {error && (
        <p className="rounded-lg border border-[color:var(--color-alerta)]/50 bg-[color:var(--color-alerta)]/10 p-3 text-xs text-[color:var(--color-alerta)]">
          {error}
        </p>
      )}

      {cargando && <p className="text-sm text-[color:var(--color-texto-tenue)]">Cargando…</p>}

      {editando ? (
        <Tarjeta>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">
              Nueva versión de {editando.entrada.codigo}
            </h2>
            <button
              type="button"
              onClick={() => setEditando(null)}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-[color:var(--color-texto-tenue)]"
            >
              Volver
            </button>
          </div>
          <EditorVersion
            actual={editando.entrada}
            onGuardar={guardar}
            onCancelar={() => setEditando(null)}
          />
        </Tarjeta>
      ) : (
        vistas.map((vista) => (
          <PanelModelo
            key={vista.coleccion}
            vista={vista}
            onNuevaVersion={(entrada) =>
              setEditando({ modelo: vista.coleccion as Modelo, entrada })
            }
          />
        ))
      )}
    </div>
  );
}

function PanelModelo({
  vista,
  onNuevaVersion,
}: {
  vista: VistaModelo;
  onNuevaVersion: (entrada: VersionEntrada) => void;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const nombre = NOMBRE_COLECCION[vista.coleccion as Modelo] ?? vista.coleccion;

  return (
    <Tarjeta>
      <h2 className="text-sm font-semibold">{nombre}</h2>
      <p className="mt-1 text-xs text-[color:var(--color-texto-tenue)]">
        {PROPOSITO_COLECCION[vista.coleccion as Modelo]}
      </p>

      <ul className="mt-4 space-y-3">
        {vista.vigentes.map((v) => {
          const historial = vista.historial
            .filter((h) => h.codigo === v.codigo)
            .sort((a, b) => a.version - b.version);

          return (
            <li
              key={v.codigo}
              className="rounded-lg border border-[color:var(--color-borde)] p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-[color:var(--color-texto-tenue)]">
                    {identidad(v)}
                  </p>
                  <p className="mt-0.5 text-sm">{v.etiqueta}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setAbierto(abierto === v.codigo ? null : v.codigo)}
                    className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-xs text-[color:var(--color-texto-tenue)]"
                  >
                    {abierto === v.codigo ? "Ocultar" : `Histórico (${historial.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNuevaVersion(v)}
                    className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-xs text-[color:var(--color-info)]"
                  >
                    Nueva versión
                  </button>
                </div>
              </div>

              <pre className="-mx-1 mt-3 overflow-x-auto rounded bg-[color:var(--color-fondo)] p-3 font-mono text-[11px] leading-relaxed text-[color:var(--color-texto-tenue)]">
                {JSON.stringify(v.datos, null, 2)}
              </pre>

              {abierto === v.codigo && (
                <div className="mt-4 border-t border-[color:var(--color-borde)] pt-4">
                  <Historial
                    datos={{
                      codigo: v.codigo,
                      vigente: v,
                      versiones: historial,
                      // El diff se calcula en el cliente para no pedir el
                      // histórico entero por HTTP solo para pintarlo.
                      cambios: historial.map(() => []),
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Tarjeta>
  );
}

/**
 * ⭐ "¿Con qué se procesó este caso?"
 *
 * El id del caso va en la ruta y eso no rompe la regla de PII: un UUID de caso
 * no identifica a nadie por sí solo, y ni el dictado ni el origen del paciente
 * pasan por este módulo. `GET /estado?casoId=` ya hace lo mismo.
 */
function BuscadorDeCaso() {
  const [casoId, setCasoId] = useState("");
  const [resultado, setResultado] = useState<CasoProcesado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function buscar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!casoId.trim()) return;
    setBuscando(true);
    setError(null);
    try {
      setResultado(await api.casoProcesado(casoId.trim()));
    } catch (err) {
      setResultado(null);
      setError(err instanceof Error ? err.message : "No se pudo consultar.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <Tarjeta>
      <h2 className="text-sm font-semibold">Con qué se procesó un caso</h2>
      <p className="mt-1 text-xs leading-relaxed text-[color:var(--color-texto-tenue)]">
        Devuelve la versión tal como estaba escrita ese día, no como está hoy. Es la
        diferencia entre auditar y suponer.
      </p>

      <form onSubmit={buscar} className="mt-4 flex flex-wrap gap-2">
        <label htmlFor="casoId" className="sr-only">
          Identificador del caso
        </label>
        <input
          id="casoId"
          value={casoId}
          onChange={(e) => setCasoId(e.target.value)}
          placeholder="id del caso"
          className="h-12 min-w-0 flex-1 rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-3.5 font-mono text-base outline-none placeholder:text-[color:var(--color-texto-tenue)]/50 focus:border-[color:var(--color-info)]"
        />
        <button
          type="submit"
          disabled={buscando || !casoId.trim()}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[color:var(--color-marca)] px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          <Search className="size-4" aria-hidden />
          Buscar
        </button>
      </form>

      {error && <p className="mt-3 text-xs text-[color:var(--color-alerta)]">{error}</p>}

      {resultado && resultado.sinRegistro && (
        <p className="mt-4 rounded-lg border border-[color:var(--color-borde)] bg-[color:var(--color-superficie-alta)] p-3 text-xs leading-relaxed text-[color:var(--color-texto-tenue)]">
          {resultado.nota ??
            "Este caso no tiene versiones anotadas. El vacío se dice: callarlo dejaría creer que el caso corrió sin modelo."}
        </p>
      )}

      {resultado && !resultado.sinRegistro && (
        <ul className="mt-4 space-y-2.5">
          {resultado.procesamientos.map((p) => (
            <li
              key={p.registro.id}
              className="rounded-lg border border-[color:var(--color-borde)] p-3"
            >
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="text-[color:var(--color-texto-tenue)]">
                  {NOMBRE_COLECCION[p.registro.coleccion as Modelo] ?? p.registro.coleccion}
                </span>
                <code className="text-xs">
                  {p.registro.codigo}@{p.registro.version}
                </code>
                <time
                  dateTime={p.registro.procesadoEn}
                  className="tabular ml-auto text-xs text-[color:var(--color-texto-tenue)]"
                >
                  {new Date(p.registro.procesadoEn).toLocaleString("es-CO", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </p>

              {p.version && <p className="mt-1 text-xs">{p.version.etiqueta}</p>}

              <p
                className={`mt-1.5 text-xs ${
                  comparableConHoy(p)
                    ? "text-[color:var(--color-estable)]"
                    : "text-[color:var(--color-alerta)]"
                }`}
              >
                {describirDesfase(p)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
