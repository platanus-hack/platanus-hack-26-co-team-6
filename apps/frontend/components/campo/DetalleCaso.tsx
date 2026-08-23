"use client";

/**
 * El caso, abierto.
 *
 * Aparece al tocar cualquier fila del inicio: en escritorio ocupa la columna
 * derecha, en móvil se despliega debajo de la lista. Es la vista que faltaba —
 * hasta ahora un caso cerrado era una línea de texto y nada más.
 *
 * ── DÓNDE ESTÁ EL PACIENTE, Y POR QUÉ A VECES NO SE PUEDE DECIR ───
 * `GET /estado` **no devuelve `origen`**, y no es un olvido: `origen` (las
 * coordenadas de recogida) y `textoCrudo` (el dictado literal) son los dos
 * campos que no salen del servidor. La lista blanca de `estado.service.ts`
 * está escrita campo por campo justo para que nadie los añada sin decidirlo.
 *
 * Así que el mapa aparece cuando **este dispositivo** dictó el caso — las
 * coordenadas ya estaban aquí, llegaron en la respuesta de `POST /triage` y no
 * se guardan en ningún sitio: viven en memoria y mueren al recargar. Para los
 * demás casos (los que entraron por WhatsApp, los de otra tripulación, los de
 * antes de recargar) se dice que no se puede y por qué, en vez de pintar un
 * mapa de Bogotá centrado en cualquier parte.
 *
 * Lo que falta para cerrarlo es un endpoint por caso con su propia
 * autorización — `GET /casos/:id` —, que es exactamente lo que ya dejó escrito
 * el comentario de `CasoPublico` en `contracts/types.ts`. Es trabajo de core.
 */

import { ArrowRight, MapPinOff } from "lucide-react";
import type { Coordenada, CasoPublico, Handshake } from "@/lib/types";
import { ETIQUETA_TRIAGE, esHoraDorada } from "@/lib/presentacion";

export function DetalleCaso({
  caso,
  handshake,
  origen,
  mapa,
  onContinuar,
  onCerrar,
}: {
  caso: CasoPublico;
  handshake: Handshake | null;
  /** Solo lo hay si este dispositivo dictó el caso. Ver la cabecera. */
  origen: Coordenada | null;
  /** El mapa ya montado, con `origen` dentro. Lo inyecta la página. */
  mapa?: React.ReactNode;
  /** Solo para los que siguen abiertos. */
  onContinuar?: () => void;
  onCerrar: () => void;
}) {
  const aceptado = handshake?.estado === "aceptado";
  const critico = esHoraDorada(caso.triage);

  return (
    <section
      aria-label={`Caso ${caso.dxDescripcion}`}
      className="rounded-2xl border border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]/80 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight">
            {caso.dxDescripcion}
          </h2>
          <p className="mt-1 text-xs text-[color:var(--color-texto-tenue)]">
            {caso.dxCie10} · {horaDe(caso.creadoEn)}
            {caso.unidad?.id ? ` · ${caso.unidad.id}` : ""}
          </p>
        </div>
        <button
          onClick={onCerrar}
          aria-label="Cerrar el detalle"
          className="shrink-0 rounded-lg px-3 text-sm text-[color:var(--color-texto-tenue)] hover:text-[color:var(--color-texto)]"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Etiqueta
          texto={`Triage ${ETIQUETA_TRIAGE[caso.triage]}`}
          color={critico ? "var(--color-critico)" : "var(--color-info)"}
        />
        <Etiqueta texto={caso.tipoMovil} />
        {caso.edad != null && <Etiqueta texto={`${caso.edad} años`} />}
        {caso.sexo && <Etiqueta texto={caso.sexo === "M" ? "Masculino" : "Femenino"} />}
        {caso.requiereMedicoABordo && <Etiqueta texto="Médico a bordo" />}
      </div>

      {caso.signosAlarma.length > 0 && (
        <div className="mt-4">
          <Rotulo>Signos de alarma</Rotulo>
          <ul className="flex flex-wrap gap-1.5">
            {caso.signosAlarma.map((s) => (
              <li
                key={s}
                className="rounded-lg border border-[color:var(--color-critico)]/40 bg-[color:var(--color-critico)]/10 px-2 py-1 text-xs text-[color:var(--color-critico)]"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <Rotulo>Dónde está el paciente</Rotulo>
        {origen && mapa ? (
          <>
            {mapa}
            <p className="mt-1.5 text-[11px] text-[color:var(--color-texto-tenue)] tabular">
              {origen.lat.toFixed(5)}, {origen.lng.toFixed(5)}
            </p>
          </>
        ) : (
          <SinOrigen />
        )}
      </div>

      <div className="mt-4">
        <Rotulo>Estado</Rotulo>
        <p className="text-sm">
          {aceptado ? (
            <span className="text-[color:var(--color-estable)]">
              Aceptado por la sede{" "}
              <span className="tabular">{handshake?.sedeCodigo}</span>
            </span>
          ) : handshake?.estado === "enviado" ? (
            <span className="text-[color:var(--color-alerta)]">
              Esperando confirmación
            </span>
          ) : handshake ? (
            <span className="text-[color:var(--color-critico)]">
              Sin respuesta{handshake.motivoRechazo ? ` · ${handshake.motivoRechazo}` : ""}
            </span>
          ) : (
            <span className="text-[color:var(--color-info)]">
              Todavía sin destino
            </span>
          )}
        </p>
      </div>

      {onContinuar && (
        <button
          onClick={onContinuar}
          className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--color-info)] px-4 font-bold text-[#04121f]"
        >
          Continuar este caso
          <ArrowRight className="size-4" strokeWidth={2.5} aria-hidden />
        </button>
      )}
    </section>
  );
}

/**
 * El hueco declarado. No es un error ni un "cargando": es una decisión de
 * privacidad del sistema, y se cuenta como tal.
 */
function SinOrigen() {
  return (
    <div className="flex gap-3 rounded-xl border border-dashed border-[color:var(--color-borde)] px-3 py-3">
      <MapPinOff
        className="mt-0.5 size-4 shrink-0 text-[color:var(--color-texto-tenue)]"
        strokeWidth={2}
        aria-hidden
      />
      <p className="text-xs leading-relaxed text-[color:var(--color-texto-tenue)]">
        La ubicación de recogida no viaja en el listado de casos: es uno de los
        dos datos que no salen del servidor. Se ve mientras el caso está en
        curso en este dispositivo.
      </p>
    </div>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
      {children}
    </p>
  );
}

function Etiqueta({ texto, color }: { texto: string; color?: string }) {
  return (
    <span
      className="rounded-lg border px-2 py-1 text-xs"
      style={{
        borderColor: color ?? "var(--color-borde)",
        color: color ?? "var(--color-texto-tenue)",
      }}
    >
      {texto}
    </span>
  );
}

function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
