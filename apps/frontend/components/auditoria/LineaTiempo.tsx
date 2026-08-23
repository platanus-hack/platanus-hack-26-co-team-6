"use client";

/**
 * La línea de tiempo del expediente.
 *
 * Sin plegables a propósito: lo que no se ve en pantalla tampoco sale
 * impreso, y este documento se imprime. Todo está desplegado y el navegador
 * pagina.
 *
 * Tres cosas que esta lista tiene que dejar claras sin depender del color,
 * porque se lee en blanco y negro:
 *   · qué fue corregido después (`[CORREGIDO]`) y qué es una corrección
 *     (`[CORRECCIÓN]`) — **el error se ve, no se esconde**;
 *   · quién actuó: persona, servicio automático o decisión del sistema;
 *   · de dónde sale cada fila, cuando no es de `evento_caso`.
 */

import {
  enlazarCorrecciones,
  esConsulta,
  estaRedactado,
  etiquetaActor,
  etiquetaTipo,
  horaCorta,
  marcaActor,
  ordenarLinea,
  textoCorreccion,
  type FilaExpediente,
} from "@/lib/auditoria-modelo";

export default function LineaTiempo({ filas }: { filas: FilaExpediente[] }) {
  const ordenadas = ordenarLinea(filas);
  const enlazadas = enlazarCorrecciones(ordenadas);
  const porId = new Map(
    ordenadas.filter((f) => f.eventoId != null).map((f) => [f.eventoId!, f]),
  );

  if (enlazadas.length === 0) {
    // El conjunto vacío es un evento, no una respuesta muda.
    return (
      <p className="text-sm text-[color:var(--color-texto-tenue)] border border-[color:var(--color-borde)] rounded-xl p-4">
        Este caso no tiene ningún evento registrado. No significa que no haya
        pasado nada: significa que nada de lo que pasó se guardó. Mira la nota
        de cobertura al pie.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {enlazadas.map((fila) => {
        const corregido = fila.corrigeA != null ? porId.get(fila.corrigeA) : undefined;
        return (
          <li
            key={fila.clave}
            className={`fila-evento bloque border-l-2 pl-3 py-1 ${
              fila.obsoleta
                ? "fila-corregida border-[color:var(--color-alerta)]"
                : fila.tipo === "override_crue"
                  ? "border-[color:var(--color-critico)]"
                  : esConsulta(fila.tipo)
                    ? "border-[color:var(--color-borde)]"
                    : "border-[color:var(--color-info)]"
            }`}
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
              <span className="tabular font-semibold">
                {horaCorta(fila.ocurridoEn)}
              </span>
              <span className="font-medium">{etiquetaTipo(fila.tipo)}</span>

              <span className="marca text-[10px] rounded px-1 border border-[color:var(--color-borde)] text-[color:var(--color-texto-tenue)]">
                {marcaActor(fila.actor)}
              </span>
              <span className="text-xs text-[color:var(--color-texto-tenue)]">
                {etiquetaActor(fila.actor)}
              </span>

              {fila.esCorreccion && (
                <span className="marca text-[10px] rounded px-1 border border-[color:var(--color-estable)] text-[color:var(--color-estable)]">
                  CORRECCIÓN
                </span>
              )}
              {fila.obsoleta && (
                <span className="marca text-[10px] rounded px-1 border border-[color:var(--color-alerta)] text-[color:var(--color-alerta)]">
                  CORREGIDO DESPUÉS
                </span>
              )}
              {fila.fuente !== "evento_caso" && (
                <span className="marca text-[10px] rounded px-1 border border-[color:var(--color-borde)] text-[color:var(--color-texto-tenue)]">
                  RECONSTRUIDO
                </span>
              )}
            </div>

            {/* "22:14 llegada a puerta — corregido a 22:11 por X" */}
            {corregido && (
              <p className="text-xs mt-1 text-[color:var(--color-estable)]">
                {textoCorreccion(corregido, fila)}
              </p>
            )}

            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              {fila.organizacionId && (
                <Dato clave="organización" valor={fila.organizacionId} />
              )}
              {fila.codigoSede && <Dato clave="sede" valor={fila.codigoSede} />}
              {fila.movilId && <Dato clave="móvil" valor={fila.movilId} />}
              {fila.eventoId != null && (
                <Dato clave="evento" valor={`#${fila.eventoId}`} />
              )}
              {Object.entries(fila.detalle).map(([clave, valor]) => (
                <Dato key={clave} clave={clave} valor={valor} />
              ))}
            </dl>

            {fila.redactados.length > 0 && (
              <p className="text-[11px] mt-1 text-[color:var(--color-texto-tenue)]">
                Campos redactados en este evento: {fila.redactados.join(", ")}.
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Dato({ clave, valor }: { clave: string; valor: unknown }) {
  const redactado = estaRedactado(valor);
  return (
    <>
      <dt className="text-[color:var(--color-texto-tenue)]">{clave}</dt>
      <dd className={redactado ? "italic" : "break-words"}>
        {redactado ? (
          <span className="marca border border-[color:var(--color-borde)] rounded px-1">
            REDACTADO
          </span>
        ) : (
          textoDe(valor)
        )}
      </dd>
    </>
  );
}

/** Cualquier cosa que venga en el detalle, legible. Sin `[object Object]`. */
function textoDe(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  return JSON.stringify(valor);
}
