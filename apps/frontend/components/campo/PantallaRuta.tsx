"use client";

/**
 * §6 — Aceptado / en ruta.
 *
 * La pantalla de "ya está, muévase". Deja de haber decisiones que tomar: hay
 * un destino y hay que llegar.
 *
 * ── QUÉ VE PRIMERO QUIEN CONDUCE ──────────────────────────────────
 * La maniobra siguiente, grande, arriba del todo. No el nombre del hospital
 * ni el resumen clínico — eso ya se decidió. Quien mira esta pantalla está
 * al volante o de copiloto con el paciente detrás, y lo único accionable en
 * ese momento es hacia dónde girar.
 *
 * Debajo, y solo debajo: a dónde vamos, por qué se eligió, y qué sabe ya el
 * hospital que nos espera.
 *
 * ── NO SUSTITUYE AL NAVEGADOR DEL TELÉFONO ────────────────────────
 * No hay reencuadre automático ni voz. Para conducir de verdad está el botón
 * de abrir Google Maps o Waze, que hacen eso mucho mejor y ya están en el
 * teléfono. Esto da el contexto clínico que ellos no tienen: por qué este
 * hospital y no el de al lado.
 */

import {
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Navigation,
  Phone,
  RotateCw,
} from "lucide-react";
import type { Caso, Candidato, RutaResponse } from "@/lib/types";
import { nombresServicios, ETIQUETA_TRIAGE } from "@/lib/presentacion";

export function PantallaRuta({
  caso,
  candidato,
  ruta,
  cargandoRuta,
  transcurrido,
  onEntregado,
  onNovedad,
}: {
  caso: Caso;
  /** El candidato aceptado. Lleva el desglose que justifica la elección. */
  candidato: Candidato | null;
  ruta: RutaResponse | null;
  cargandoRuta: boolean;
  transcurrido: number;
  onEntregado: () => void;
  onNovedad: () => void;
}) {
  const sede = candidato?.sede;
  const nombre = ruta?.destino.nombre ?? sede?.nombre ?? "la sede aceptada";
  const direccion = ruta?.destino.direccion ?? sede?.direccion ?? null;
  const telefono = ruta?.destino.telefono ?? sede?.telefono ?? null;
  const coord = ruta?.destino.coord ?? sede?.coord ?? null;

  const siguiente = ruta?.pasos?.[0] ?? null;

  return (
    <section className="space-y-4">
      {/* ── Lo único accionable mientras se conduce ── */}
      <div
        className="p-5 rounded-3xl
                   bg-[color:var(--color-estable)]/10
                   border-2 border-[color:var(--color-estable)]/50"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--color-estable)]">
          ▸ Traslado aceptado
        </p>

        {cargandoRuta ? (
          <p className="mt-3 text-lg font-semibold latido">Trazando ruta…</p>
        ) : siguiente ? (
          <div className="mt-3 flex items-start gap-3">
            <IconoManiobra
              maniobra={siguiente.maniobra}
              direccion={siguiente.direccion}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold leading-tight">
                {siguiente.instruccion}
              </p>
              <p className="mt-1 text-sm tabular text-[color:var(--color-texto-tenue)]">
                {formatoDistancia(siguiente.distanciaM)}
              </p>
            </div>
          </div>
        ) : (
          // Sin MAPBOX_TOKEN o sin cobertura de Directions no hay maniobras.
          // Se dice y se deja el botón de navegación externa, que sí funciona.
          <p className="mt-3 text-lg font-semibold">Diríjase a {nombre}</p>
        )}

        {ruta && (
          <p className="mt-3 flex items-center gap-3 text-sm tabular text-[color:var(--color-texto-tenue)]">
            <span className="text-[color:var(--color-texto)] font-bold text-lg">
              {Math.round(ruta.duracionS / 60)} min
            </span>
            <span>{(ruta.distanciaM / 1000).toFixed(1)} km</span>
            <span className="ml-auto">{transcurrido.toFixed(0)}s del caso</span>
          </p>
        )}
      </div>

      {/* ── Acciones ── */}
      <div className="grid grid-cols-2 gap-2">
        <a
          href={enlaceNavegacion(coord, nombre)}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-14 rounded-2xl font-semibold inline-flex items-center justify-center gap-2
                     bg-[color:var(--color-info)] text-[#04121f]"
        >
          <Navigation className="size-5" strokeWidth={2.2} />
          Abrir navegación
        </a>

        {/* `tel:` y no un número que copiar: al llegar hay que coordinar por
            voz, y marcar a mano con guantes no es una opción. */}
        <a
          href={telefono ? `tel:${telefono.replace(/\s+/g, "")}` : undefined}
          aria-disabled={!telefono}
          className={`min-h-14 rounded-2xl font-semibold inline-flex items-center justify-center gap-2
                      border border-[color:var(--color-borde)]
                      bg-[color:var(--color-superficie-alta)]
                      ${telefono ? "" : "opacity-40 pointer-events-none"}`}
        >
          <Phone className="size-5" strokeWidth={2.2} />
          {telefono ? "Llamar" : "Sin teléfono"}
        </a>
      </div>

      {/* ── A dónde vamos ── */}
      <div className="p-4 rounded-2xl bg-[color:var(--color-superficie)] border border-[color:var(--color-borde)]">
        <h3 className="font-bold leading-tight">{nombre}</h3>
        {direccion && (
          <p className="mt-0.5 text-sm text-[color:var(--color-texto-tenue)]">
            {direccion}
            {sede?.localidad ? ` · ${sede.localidad}` : ""}
          </p>
        )}

        {/* Por qué ESTE y no el de al lado. Es el argumento del producto, y en
            ruta es cuando surge la duda: "había uno más cerca". */}
        {candidato && (
          <dl className="mt-3 pt-3 border-t border-[color:var(--color-borde)] grid grid-cols-3 gap-2 text-center">
            <Dato
              etiqueta="ruta"
              valor={`${Math.round(candidato.desglose.ruta)}′`}
            />
            <Dato
              etiqueta="acepta"
              valor={`${Math.round(candidato.pAceptacion * 100)}%`}
            />
            <Dato
              etiqueta="complejidad"
              valor={candidato.sede.complejidad}
            />
          </dl>
        )}
      </div>

      {/* ── Qué sabe ya el hospital ── */}
      <div className="p-4 rounded-2xl bg-[color:var(--color-superficie)] border border-[color:var(--color-borde)]">
        <h3 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
          Lo que ya recibió el hospital
        </h3>
        <p className="mt-2 text-sm">{caso.resumen}</p>
        <dl className="mt-2 space-y-1 text-xs text-[color:var(--color-texto-tenue)]">
          <div>
            <span className="font-semibold">Triage:</span>{" "}
            {ETIQUETA_TRIAGE[caso.triage]} · {caso.tipoMovil}
          </div>
          <div>
            <span className="font-semibold">Dx:</span> {caso.dxDescripcion}
            {caso.dxCie10 && ` (${caso.dxCie10})`}
          </div>
          <div>
            <span className="font-semibold">Requiere:</span>{" "}
            {caso.serviciosRequeridos.length
              ? nombresServicios(caso.serviciosRequeridos)
              : "solo urgencias"}
          </div>
        </dl>
      </div>

      {/* ── Cierre ── */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onNovedad}
          className="min-h-14 rounded-2xl inline-flex items-center justify-center gap-2
                     border border-[color:var(--color-alerta)]/50
                     text-[color:var(--color-alerta)]"
        >
          <RotateCw className="size-4" strokeWidth={2.2} />
          Reportar novedad
        </button>
        <button
          onClick={onEntregado}
          className="min-h-14 rounded-2xl font-semibold inline-flex items-center justify-center gap-2
                     bg-[color:var(--color-estable)] text-[#04231d]"
        >
          <Flag className="size-4" strokeWidth={2.4} />
          Marcar entregado
        </button>
      </div>

      {/* Resto del trayecto, para el copiloto. Colapsado: quien conduce solo
          necesita la maniobra de arriba. */}
      {ruta && ruta.pasos.length > 1 && (
        <details className="rounded-2xl bg-[color:var(--color-superficie)] border border-[color:var(--color-borde)]">
          <summary className="p-4 text-sm font-semibold cursor-pointer">
            Ver las {ruta.pasos.length} indicaciones
          </summary>
          <ol className="px-4 pb-4 space-y-2">
            {ruta.pasos.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <IconoManiobra
                  maniobra={p.maniobra}
                  direccion={p.direccion}
                  pequeno
                />
                <span className="min-w-0 flex-1">
                  {p.instruccion}
                  <span className="ml-1 tabular text-[color:var(--color-texto-tenue)]">
                    · {formatoDistancia(p.distanciaM)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
        {etiqueta}
      </dt>
      <dd className="text-sm font-bold tabular">{valor}</dd>
    </div>
  );
}

/**
 * El icono de la maniobra.
 *
 * Mapbox devuelve `type` (turn, merge, arrive…) y `modifier` (left, right…).
 * El modificador manda cuando existe: para quien conduce, "izquierda" es más
 * información que "giro".
 */
function IconoManiobra({
  maniobra,
  direccion,
  pequeno = false,
}: {
  maniobra: string | null;
  direccion: string | null;
  pequeno?: boolean;
}) {
  const clase = pequeno
    ? "size-4 shrink-0 mt-0.5 text-[color:var(--color-texto-tenue)]"
    : "size-8 shrink-0 text-[color:var(--color-estable)]";
  const grosor = pequeno ? 2 : 2.2;

  if (maniobra === "arrive") return <Flag className={clase} strokeWidth={grosor} />;
  if (direccion?.includes("left"))
    return <CornerUpLeft className={clase} strokeWidth={grosor} />;
  if (direccion?.includes("right"))
    return <CornerUpRight className={clase} strokeWidth={grosor} />;
  return <ArrowUpRight className={clase} strokeWidth={grosor} />;
}

/** Metros hasta 1 km, luego kilómetros con un decimal. Como cualquier GPS. */
function formatoDistancia(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

/**
 * Abre la navegación del teléfono.
 *
 * `geo:` es el esquema estándar y lo entienden Android y las apps instaladas;
 * en iOS y escritorio no existe, y ahí el enlace de Google Maps sí funciona.
 * Se elige una vez en el cliente para no ofrecer un botón que no hace nada.
 */
function enlaceNavegacion(
  coord: { lat: number; lng: number } | null,
  nombre: string,
): string {
  if (!coord) return "#";
  const esAndroid =
    typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  return esAndroid
    ? `geo:${coord.lat},${coord.lng}?q=${coord.lat},${coord.lng}(${encodeURIComponent(nombre)})`
    : `https://www.google.com/maps/dir/?api=1&destination=${coord.lat},${coord.lng}&travelmode=driving`;
}
