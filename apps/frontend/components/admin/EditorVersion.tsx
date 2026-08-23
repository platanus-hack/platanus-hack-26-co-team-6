"use client";

/**
 * El formulario que crea una versión.
 *
 * Dos cosas que hace a propósito, y las dos son de honestidad:
 *
 * 1. **El código se muestra bloqueado, no ausente.** Un campo que no está
 *    deja creer que no existe; uno bloqueado dice que existe y no se toca.
 * 2. **Anuncia lo que va a pasar antes de que pase.** "Esto va a crear la
 *    versión 3" en vez de un botón "Guardar" que insinúa edición en sitio.
 *    Lo calcula `previsualizar()` con las mismas reglas que el servidor.
 *
 * Los `datos` se editan como JSON. No es pereza: el cuerpo de cada colección
 * es distinto (un protocolo tiene pasos, una fila del mapa tiene códigos REPS)
 * y cinco formularios a medida serían cinco sitios donde el esquema del
 * servidor puede quedarse atrás sin que nadie lo note. El servidor valida con
 * zod y devuelve el error campo por campo, que es donde debe estar la verdad.
 */

import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import {
  describirDiferencia,
  previsualizar,
  problemaDeCodigo,
  type VersionEntrada,
} from "@/lib/catalogos-modelo";

export interface Guardado {
  codigo: string;
  etiqueta: string;
  datos: Record<string, unknown>;
  activo: boolean;
  motivo: string;
}

export function EditorVersion({
  actual,
  plantilla,
  onGuardar,
  onCancelar,
}: {
  /** La versión vigente si se está versionando; undefined si es una entrada nueva. */
  actual?: VersionEntrada;
  /** Cuerpo de ejemplo para una entrada nueva, según la colección. */
  plantilla?: Record<string, unknown>;
  onGuardar: (g: Guardado) => Promise<void>;
  onCancelar: () => void;
}) {
  const nueva = !actual;

  const [codigo, setCodigo] = useState(actual?.codigo ?? "");
  const [etiqueta, setEtiqueta] = useState(actual?.etiqueta ?? "");
  const [activo, setActivo] = useState(actual?.activo ?? true);
  const [motivo, setMotivo] = useState("");
  const [textoDatos, setTextoDatos] = useState(() =>
    JSON.stringify(actual?.datos ?? plantilla ?? {}, null, 2),
  );
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const datos = useMemo(() => {
    try {
      const leido = JSON.parse(textoDatos) as unknown;
      return leido && typeof leido === "object" && !Array.isArray(leido)
        ? { valor: leido as Record<string, unknown>, error: null }
        : { valor: null, error: "Los datos tienen que ser un objeto JSON." };
    } catch {
      return { valor: null, error: "El JSON no se puede leer." };
    }
  }, [textoDatos]);

  const problemaCodigo = nueva ? problemaDeCodigo(codigo) : null;

  const vista =
    actual && datos.valor
      ? previsualizar(actual, { etiqueta, datos: datos.valor, activo, motivo })
      : null;

  const puedeGuardar =
    !enviando &&
    !!datos.valor &&
    etiqueta.trim().length > 0 &&
    (nueva ? !problemaCodigo : vista?.accion === "nueva-version");

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!datos.valor) return;
    setEnviando(true);
    setError(null);
    try {
      await onGuardar({
        codigo: nueva ? codigo.trim().toUpperCase() : actual!.codigo,
        etiqueta: etiqueta.trim(),
        datos: datos.valor,
        activo,
        motivo: motivo.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div>
        <label htmlFor="codigo" className={etiquetaCampo}>
          Código {nueva ? "(inmutable — no se puede corregir después)" : ""}
        </label>
        <div className="relative">
          <input
            id="codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            readOnly={!nueva}
            aria-invalid={problemaCodigo ? true : undefined}
            className={`h-12 w-full rounded-xl border bg-[color:var(--color-fondo)] px-3.5 font-mono text-base outline-none focus:border-[color:var(--color-info)] ${
              problemaCodigo
                ? "border-[color:var(--color-alerta)]"
                : "border-[color:var(--color-borde)]"
            } ${nueva ? "" : "pr-10 text-[color:var(--color-texto-tenue)]"}`}
          />
          {!nueva && (
            <Lock
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--color-texto-tenue)]"
              aria-hidden
            />
          )}
        </div>
        <p className="mt-1.5 text-xs text-[color:var(--color-texto-tenue)]">
          {nueva
            ? problemaCodigo ??
              "Es la clave con la que se compara el histórico. Elígelo bien: es para siempre."
            : "Bloqueado a propósito. Cambiarlo partiría la serie histórica en dos."}
        </p>
      </div>

      <div>
        <label htmlFor="etiqueta" className={etiquetaCampo}>
          Etiqueta (editable)
        </label>
        <input
          id="etiqueta"
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
          className="h-12 w-full rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-3.5 text-base outline-none focus:border-[color:var(--color-info)]"
        />
      </div>

      <div>
        <label htmlFor="datos" className={etiquetaCampo}>
          Datos (JSON)
        </label>
        <textarea
          id="datos"
          rows={10}
          value={textoDatos}
          onChange={(e) => setTextoDatos(e.target.value)}
          spellCheck={false}
          className={`w-full rounded-xl border bg-[color:var(--color-fondo)] p-3.5 font-mono text-sm outline-none focus:border-[color:var(--color-info)] ${
            datos.error
              ? "border-[color:var(--color-alerta)]"
              : "border-[color:var(--color-borde)]"
          }`}
        />
        {datos.error && (
          <p className="mt-1.5 text-xs text-[color:var(--color-alerta)]">{datos.error}</p>
        )}
      </div>

      {!nueva && (
        <label className="flex min-h-11 items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={!activo}
            onChange={(e) => setActivo(!e.target.checked)}
            className="size-4"
          />
          Retirar esta entrada
          <span className="text-xs text-[color:var(--color-texto-tenue)]">
            (no la borra: crea una versión retirada)
          </span>
        </label>
      )}

      <div>
        <label htmlFor="motivo" className={etiquetaCampo}>
          Motivo {nueva ? "(opcional en la primera versión)" : "(obligatorio)"}
        </label>
        <input
          id="motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Qué cambió y por qué"
          className="h-12 w-full rounded-xl border border-[color:var(--color-borde)] bg-[color:var(--color-fondo)] px-3.5 text-base outline-none placeholder:text-[color:var(--color-texto-tenue)]/50 focus:border-[color:var(--color-info)]"
        />
      </div>

      {vista && <Previsualizacion vista={vista} />}

      {error && (
        <p className="rounded-lg border border-[color:var(--color-alerta)]/50 bg-[color:var(--color-alerta)]/10 p-3 text-xs text-[color:var(--color-alerta)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!puedeGuardar}
          className="inline-flex min-h-12 items-center rounded-xl bg-[color:var(--color-marca)] px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {nueva
            ? "Crear entrada"
            : vista?.accion === "nueva-version"
              ? `Crear versión ${vista.version}`
              : "Crear versión"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="inline-flex min-h-12 items-center rounded-xl border border-[color:var(--color-borde)] px-4 text-sm"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Lo que va a pasar si se toca guardar, dicho antes de tocarlo. */
function Previsualizacion({
  vista,
}: {
  vista: ReturnType<typeof previsualizar>;
}) {
  if (vista.accion === "sin-cambios") {
    return (
      <p className="rounded-lg border border-[color:var(--color-borde)] bg-[color:var(--color-superficie-alta)] p-3 text-xs text-[color:var(--color-texto-tenue)]">
        Nada cambió respecto de la v{vista.version}. No hay versión que crear — y crear una
        idéntica solo ensuciaría el histórico.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-[color:var(--color-borde)] bg-[color:var(--color-superficie-alta)] p-3">
      <p className="text-xs font-medium">
        Esto va a crear la <span className="tabular">versión {vista.version}</span>. La
        anterior no se toca.
      </p>
      <ul className="mt-2 space-y-1">
        {vista.cambios.map((c) => (
          <li
            key={c.campo}
            className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-[color:var(--color-texto-tenue)]"
          >
            {describirDiferencia(c)}
          </li>
        ))}
      </ul>
      {vista.accion === "falta-motivo" && (
        <p className="mt-2 text-xs text-[color:var(--color-alerta)]">
          Falta el motivo. Una versión sin motivo es una fila que dentro de seis meses nadie
          sabrá explicar.
        </p>
      )}
    </div>
  );
}

const etiquetaCampo =
  "mb-1.5 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-texto-tenue)]";
