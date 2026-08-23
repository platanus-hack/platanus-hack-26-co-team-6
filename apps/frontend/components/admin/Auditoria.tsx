"use client";

/**
 * La bitácora. Append-only: aquí no hay botón de borrar ni de editar, y no lo
 * va a haber — una corrección es un evento nuevo (regla 4 del repo).
 *
 * Cada fila dice **quién**, **por dónde entró** y **qué cambió**. Lo segundo
 * importa mientras exista el puente de la credencial de plataforma: no es lo
 * mismo un cambio firmado por un rol real que uno firmado por quien tenía la
 * variable de entorno.
 */

import { describirDiferencia, type EventoAdmin } from "@/lib/catalogos-modelo";

const TEXTO_ACCION: Record<string, string> = {
  "entrada.creada": "creó",
  "version.creada": "versionó",
  "entrada.retirada": "retiró",
  "entrada.restituida": "restituyó",
  "procesamiento.registrado": "anotó procesamiento de",
};

export function Auditoria({ eventos }: { eventos: EventoAdmin[] }) {
  if (eventos.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-texto-tenue)]">
        Todavía no hay cambios registrados.
      </p>
    );
  }

  return (
    <ol className="space-y-2.5">
      {eventos.map((e) => (
        <li key={e.id} className="border-b border-[color:var(--color-borde)]/60 pb-2.5 last:border-0">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-medium">{e.actor}</span>
            <span className="text-[color:var(--color-texto-tenue)]">
              {TEXTO_ACCION[e.accion] ?? e.accion}
            </span>
            <code className="text-xs">
              {e.coleccion}/{e.codigo}@{e.version}
            </code>
            <time
              dateTime={e.ocurridoEn}
              className="tabular ml-auto text-xs text-[color:var(--color-texto-tenue)]"
            >
              {fecha(e.ocurridoEn)}
            </time>
          </p>

          {e.motivo && (
            <p className="mt-0.5 text-xs italic text-[color:var(--color-texto-tenue)]">
              “{e.motivo}”
            </p>
          )}

          {e.cambios.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {e.cambios.map((c) => (
                <li
                  key={c.campo}
                  className="whitespace-pre-wrap break-words text-xs text-[color:var(--color-texto-tenue)]"
                >
                  {describirDiferencia(c)}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-0.5 text-[11px] text-[color:var(--color-texto-tenue)]/70">
            vía {e.via === "rol" ? "rol admin_plataforma" : "credencial de plataforma"}
          </p>
        </li>
      ))}
    </ol>
  );
}

function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}
