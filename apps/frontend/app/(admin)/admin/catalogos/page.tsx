"use client";

/**
 * `/admin/catalogos` — la lógica clínica versionada.
 *
 * Tres catálogos y un probador:
 *   motivo_rechazo  el enum cerrado que auto-etiqueta el dataset (§7.4)
 *   protocolo       códigos clínicos y sus ventanas
 *   mapa_dx         diagnóstico → servicios REPS obligatorios (§7.2)
 *
 * La regla que ordena la pantalla entera: **el código es inmutable, la
 * etiqueta es editable, y editarla crea una versión nueva.** Por eso no hay
 * ningún botón que diga "Editar" — dicen "Nueva versión", porque es lo que
 * pasa. Y por eso no hay ninguno que diga "Borrar": retirar es una versión más.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import * as api from "@/lib/api-admin";
import {
  CATALOGOS,
  NOMBRE_COLECCION,
  PROPOSITO_COLECCION,
  type Catalogo,
  type EventoAdmin,
  type Historial as DatosHistorial,
  type VersionEntrada,
} from "@/lib/catalogos-modelo";
import { Tarjeta, useAdmin } from "@/components/admin/MarcoAdmin";
import { TablaCatalogo } from "@/components/admin/TablaCatalogo";
import { Historial } from "@/components/admin/Historial";
import { EditorVersion, type Guardado } from "@/components/admin/EditorVersion";
import { ProbadorDx } from "@/components/admin/ProbadorDx";
import { Auditoria } from "@/components/admin/Auditoria";

/**
 * Cuerpo de ejemplo por colección. No es decoración: sin él, "datos (JSON)"
 * es un cuadro en blanco y el primer intento siempre es un 400.
 */
const PLANTILLA: Record<Catalogo, Record<string, unknown>> = {
  motivo_rechazo: { categoria: "capacidad", requiereDetalle: false },
  protocolo: { pasos: ["Primer paso"], ventanaMin: 90, referencia: null },
  mapa_dx: {
    serviciosRequeridos: [1102],
    complejidadMinima: "alta",
    requiereMedicoABordo: false,
    protocolo: null,
  },
};

type Panel =
  | { modo: "lista" }
  | { modo: "historial"; datos: DatosHistorial }
  | { modo: "nueva" }
  | { modo: "version"; entrada: VersionEntrada };

export default function Catalogos() {
  const { acceso } = useAdmin();
  const [activo, setActivo] = useState<Catalogo>("motivo_rechazo");
  const [entradas, setEntradas] = useState<Record<string, VersionEntrada[]>>({});
  const [eventos, setEventos] = useState<EventoAdmin[]>([]);
  const [panel, setPanel] = useState<Panel>({ modo: "lista" });
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [datos, bitacora] = await Promise.all([
        api.catalogos(),
        api.eventos({ limite: 40 }),
      ]);
      setEntradas(
        Object.fromEntries(datos.catalogos.map((c) => [c.catalogo, c.entradas])),
      );
      setEventos(bitacora);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los catálogos.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (acceso?.permitido) void cargar();
  }, [acceso?.permitido, cargar]);

  const deActivo = useMemo(() => entradas[activo] ?? [], [entradas, activo]);

  async function verHistorial(codigo: string) {
    setPanel({ modo: "historial", datos: await api.historial(activo, codigo) });
  }

  async function guardar(g: Guardado) {
    if (panel.modo === "nueva") {
      await api.crearEntrada(activo, {
        codigo: g.codigo,
        etiqueta: g.etiqueta,
        datos: g.datos,
        motivo: g.motivo || undefined,
      });
    } else if (panel.modo === "version") {
      await api.nuevaVersion(activo, g.codigo, {
        etiqueta: g.etiqueta,
        datos: g.datos,
        activo: g.activo,
        motivo: g.motivo,
      });
    }
    setPanel({ modo: "lista" });
    await cargar();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {CATALOGOS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setActivo(c);
              setPanel({ modo: "lista" });
            }}
            aria-pressed={activo === c}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors ${
              activo === c
                ? "border-[color:var(--color-marca)] bg-[color:var(--color-marca)]/10 text-[color:var(--color-texto)]"
                : "border-[color:var(--color-borde)] text-[color:var(--color-texto-tenue)]"
            }`}
          >
            {NOMBRE_COLECCION[c]}
          </button>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-[color:var(--color-texto-tenue)]">
        {PROPOSITO_COLECCION[activo]}
      </p>

      {error && (
        <p className="rounded-lg border border-[color:var(--color-alerta)]/50 bg-[color:var(--color-alerta)]/10 p-3 text-xs text-[color:var(--color-alerta)]">
          {error}
        </p>
      )}

      {activo === "mapa_dx" && (
        <Tarjeta>
          <h2 className="mb-1 text-sm font-semibold">Probar un diagnóstico</h2>
          <p className="mb-4 text-xs text-[color:var(--color-texto-tenue)]">
            El LLM propone, esta tabla decide. Un diagnóstico sin fila no se inventa: escala
            a criterio humano.
          </p>
          <ProbadorDx mapa={deActivo} />
        </Tarjeta>
      )}

      <Tarjeta>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            {panel.modo === "historial"
              ? `Histórico de ${panel.datos.codigo}`
              : panel.modo === "nueva"
                ? "Entrada nueva"
                : panel.modo === "version"
                  ? `Nueva versión de ${panel.entrada.codigo}`
                  : NOMBRE_COLECCION[activo]}
          </h2>

          {panel.modo === "lista" ? (
            <button
              type="button"
              onClick={() => setPanel({ modo: "nueva" })}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[color:var(--color-borde)] px-3 text-sm"
            >
              <Plus className="size-4" aria-hidden />
              Entrada nueva
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPanel({ modo: "lista" })}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-[color:var(--color-texto-tenue)]"
            >
              Volver
            </button>
          )}
        </div>

        {cargando && (
          <p className="text-sm text-[color:var(--color-texto-tenue)]">Cargando…</p>
        )}

        {!cargando && panel.modo === "lista" && (
          <TablaCatalogo
            entradas={deActivo}
            onVerHistorial={(codigo) => void verHistorial(codigo)}
            onNuevaVersion={(entrada) => setPanel({ modo: "version", entrada })}
          />
        )}

        {panel.modo === "historial" && <Historial datos={panel.datos} />}

        {panel.modo === "nueva" && (
          <EditorVersion
            plantilla={PLANTILLA[activo]}
            onGuardar={guardar}
            onCancelar={() => setPanel({ modo: "lista" })}
          />
        )}

        {panel.modo === "version" && (
          <EditorVersion
            actual={panel.entrada}
            onGuardar={guardar}
            onCancelar={() => setPanel({ modo: "lista" })}
          />
        )}
      </Tarjeta>

      <Tarjeta>
        <h2 className="mb-1 text-sm font-semibold">Auditoría</h2>
        <p className="mb-4 text-xs text-[color:var(--color-texto-tenue)]">
          Append-only. Nadie edita ni borra: una corrección es un evento nuevo.
        </p>
        <Auditoria eventos={eventos} />
      </Tarjeta>
    </div>
  );
}
