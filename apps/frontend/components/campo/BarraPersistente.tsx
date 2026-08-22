"use client";

/**
 * §0 — La barra que no se va nunca.
 *
 * Lo que el paramédico necesita saber en todo momento sin ir a buscarlo:
 * quién es su móvil, si lo que ve está vivo, si el sistema sabe dónde está, y
 * si puede esperar ayuda automática o le toca a mano.
 *
 * ── LA JERARQUÍA NO ES ESTÉTICA ───────────────────────────────────
 * La conectividad domina porque es el dato del que dependen todos los demás:
 * un ranking precioso calculado hace cuatro minutos, en un túnel, es una
 * mentira peligrosa. Va con color y con texto —nunca solo color— porque esto
 * se mira de reojo, de noche, con brillo bajo.
 *
 * El resto (GPS, ruteo, IA) son puntos pequeños que solo levantan la voz
 * cuando están degradados. En una pantalla que se usa con prisa, un indicador
 * verde que grita "todo bien" es ruido; lo que tiene que saltar es lo que no
 * funciona.
 *
 * El cronómetro sigue siendo EL NÚMERO DEL PITCH y se mantiene intacto: pasa a
 * rojo a los 90s porque esa es la promesa que hace la landing.
 */

import type { Capacidades, Unidad } from "@/lib/types";
import { MENSAJE_GEO, type EstadoGeo } from "@/lib/useGeolocalizacion";
import { MENSAJE_CONEXION, type EstadoConexion } from "@/lib/useConectividad";

const LIMITE_PROMESA_S = 90;

export function BarraPersistente({
  unidad,
  onCambiarUnidad,
  conexion,
  transcurrido,
  corriendo,
  estadoGeo,
  precisionM,
  onReubicar,
  capacidades,
}: {
  unidad: Unidad | null;
  onCambiarUnidad: () => void;
  conexion: EstadoConexion;
  transcurrido: number;
  corriendo: boolean;
  estadoGeo: EstadoGeo;
  precisionM: number | null;
  onReubicar: () => void;
  capacidades: Capacidades | null;
}) {
  return (
    <header
      className="sticky top-0 z-30 -mx-4 mb-4 px-4 py-2
                 bg-[color:var(--color-fondo)]/95 backdrop-blur
                 border-b border-[color:var(--color-borde)]"
    >
      <div className="flex items-center gap-2">
        <span className="font-bold">PULSO</span>

        {/* La unidad es tocable: es lo que el CRUE ve, y equivocarse de móvil
            manda a un regulador a llamar por radio a la ambulancia que no es. */}
        <button
          onClick={onCambiarUnidad}
          className="px-2 py-0.5 text-xs rounded-md tabular
                     bg-[color:var(--color-superficie-alta)]
                     border border-[color:var(--color-borde)]"
        >
          {unidad ? unidad.id : "Sin unidad"}
        </button>

        <div className="ml-auto flex items-center gap-3">
          <Conexion estado={conexion} />
          {corriendo && (
            <div className="text-right tabular leading-none">
              <div
                className={`text-xl font-bold ${
                  transcurrido > LIMITE_PROMESA_S
                    ? "text-[color:var(--color-critico)]"
                    : ""
                }`}
              >
                {transcurrido.toFixed(1)}s
              </div>
              <div className="text-[9px] uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
                hora dorada
              </div>
            </div>
          )}
        </div>
      </div>

      <Secundarios
        estadoGeo={estadoGeo}
        precisionM={precisionM}
        onReubicar={onReubicar}
        capacidades={capacidades}
      />
    </header>
  );
}

/**
 * El indicador que manda.
 *
 * Lleva punto Y palabra: en un auditorio oscuro, o con guantes y el teléfono a
 * medio metro, el color solo no se lee. Y quien no distingue rojo de verde
 * tiene el mismo derecho a saber que se quedó sin señal.
 */
function Conexion({ estado }: { estado: EstadoConexion }) {
  const color =
    estado === "en-linea"
      ? "var(--color-estable)"
      : estado === "verificando"
        ? "var(--color-info)"
        : "var(--color-critico)";

  return (
    <span
      className={`flex items-center gap-1.5 text-xs font-semibold ${
        estado === "sin-senal"
          ? "px-2 py-1 rounded-md bg-[color:var(--color-critico)]/15"
          : ""
      }`}
      role="status"
    >
      <span
        className={`inline-block w-2 h-2 rounded-full shrink-0 ${
          estado !== "en-linea" ? "latido" : ""
        }`}
        style={{ background: color }}
        aria-hidden
      />
      <span style={{ color: estado === "en-linea" ? undefined : color }}>
        {MENSAJE_CONEXION[estado]}
      </span>
    </span>
  );
}

/**
 * GPS, ruteo e IA.
 *
 * Regla: si todo está bien, esta línea es discreta y no compite con nada. Solo
 * los degradados se pintan en ámbar. Un tablero donde todo grita es un tablero
 * que nadie mira.
 */
function Secundarios({
  estadoGeo,
  precisionM,
  onReubicar,
  capacidades,
}: {
  estadoGeo: EstadoGeo;
  precisionM: number | null;
  onReubicar: () => void;
  capacidades: Capacidades | null;
}) {
  const ubicado = estadoGeo === "ok";
  const buscando = estadoGeo === "pidiendo";

  const rutaAprox = capacidades?.ruteo === "estimado";
  const iaBasica = capacidades?.ia === "heuristico";
  const sinDictado = capacidades?.voz === "navegador";

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--color-texto-tenue)]">
      <span className="flex items-center gap-1.5">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${buscando ? "latido" : ""}`}
          style={{
            background: ubicado
              ? "var(--color-estable)"
              : buscando
                ? "var(--color-info)"
                : "var(--color-alerta)",
          }}
          aria-hidden
        />
        {/* Ubicado y con buena precisión no merece una frase entera: los
            metros ya lo dicen todo. El texto largo se guarda para cuando algo
            va mal, que es cuando hay que explicar. */}
        {ubicado ? (
          <span>GPS ±{precisionM} m</span>
        ) : (
          <span
            className={
              buscando ? undefined : "text-[color:var(--color-alerta)]"
            }
          >
            {MENSAJE_GEO[estadoGeo]}
          </span>
        )}
      </span>

      {!ubicado && !buscando && (
        <button onClick={onReubicar} className="underline underline-offset-2">
          reintentar
        </button>
      )}

      {/* Cada aviso aparece SOLO si esa pieza está degradada. */}
      {rutaAprox && <Aviso>ETA aproximados</Aviso>}
      {iaBasica && <Aviso>IA básica</Aviso>}
      {sinDictado && <Aviso>dictado del navegador</Aviso>}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-[color:var(--color-alerta)]">
      <span aria-hidden>▲</span>
      {children}
    </span>
  );
}
