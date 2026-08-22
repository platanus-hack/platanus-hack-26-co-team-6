"use client";

/**
 * El dictado: textarea, micrófono y los dos cargadores de casos.
 *
 * Dos vías de carga, y no son lo mismo:
 *   DICTADOS_DEMO  tres casos escritos a mano, clínicamente ricos. Es el
 *                  guion del pitch: lucen lo que el parser sabe hacer.
 *   CASOS_REALES   incidentes que de verdad ocurrieron en Bogotá en junio
 *                  2026. Responden "¿esto solo funciona con sus ejemplos?".
 *
 * Este componente solo pinta. La Web Speech API vive tipada en
 * `lib/useDictadoVoz.ts` y el flujo lo maneja la página; aquí llegan ya
 * resueltos como props.
 */

import { DICTADOS_DEMO } from "@/lib/demo";
import { CASOS_REALES, type CasoReal } from "@/lib/casos-reales.generado";

const MINIMO_CARACTERES = 10;

export function PanelDictado({
  texto,
  onTexto,
  onDictadoDemo,
  onCasoReal,
  casoReal,
  escuchando,
  onMicrofono,
  vozSoportada,
  onAnalizar,
  analizando,
}: {
  texto: string;
  onTexto: (t: string) => void;
  onDictadoDemo: (t: string) => void;
  onCasoReal: () => void;
  casoReal: CasoReal | null;
  escuchando: boolean;
  onMicrofono: () => void;
  vozSoportada: boolean;
  onAnalizar: () => void;
  analizando: boolean;
}) {
  return (
    <section className="space-y-3">
      <textarea
        value={texto}
        onChange={(e) => onTexto(e.target.value)}
        placeholder="Dicta o escribe el caso. Ej: masculino de 54 años, dolor precordial opresivo, supra ST en DII DIII aVF, hemodinámicamente inestable."
        rows={7}
        className="w-full p-4 rounded-xl bg-[color:var(--color-superficie)]
                   border border-[color:var(--color-borde)] text-base leading-relaxed
                   focus:outline-none focus:border-[color:var(--color-info)]"
      />

      <div className="flex gap-2">
        <button
          onClick={onMicrofono}
          className={`flex-1 min-h-12 rounded-xl font-semibold border transition-colors ${
            escuchando
              ? "bg-[color:var(--color-critico)] border-transparent latido"
              : "bg-[color:var(--color-superficie)] border-[color:var(--color-borde)]"
          }`}
        >
          {escuchando ? "⏹ Detener" : "🎙 Dictar"}
        </button>
        <button
          onClick={onAnalizar}
          disabled={texto.trim().length < MINIMO_CARACTERES || analizando}
          className="flex-[2] min-h-12 rounded-xl font-semibold bg-[color:var(--color-info)]
                     text-[#04121f] disabled:opacity-40"
        >
          {analizando ? (
            <span className="inline-flex items-center gap-2">
              <span className="latido" aria-hidden>
                🫀
              </span>
              Analizando…
            </span>
          ) : (
            "Analizar y rutear"
          )}
        </button>
      </div>

      {/* El aviso va junto al boton que lo provoca, no en el banner de arriba:
          el textarea sigue funcionando, asi que no es un error del flujo. */}
      {!vozSoportada && (
        <p className="text-xs text-[color:var(--color-alerta)]">
          Este navegador no soporta dictado por voz. Usa Chrome, o escribe el
          caso.
        </p>
      )}

      <div className="pt-4">
        <p className="text-xs text-[color:var(--color-texto-tenue)] mb-2 uppercase tracking-wide">
          Casos de prueba
        </p>
        <div className="flex flex-wrap gap-2">
          {DICTADOS_DEMO.map((d) => (
            <button
              key={d.etiqueta}
              onClick={() => onDictadoDemo(d.texto)}
              className="px-3 min-h-11 text-xs rounded-lg bg-[color:var(--color-superficie)]
                         border border-[color:var(--color-borde)]"
            >
              {d.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {/* La respuesta a "¿esto solo funciona con sus tres ejemplos?" */}
      <div className="pt-2">
        <button
          onClick={onCasoReal}
          className="w-full px-3 py-3 min-h-12 text-sm rounded-xl text-left
                     bg-[color:var(--color-superficie)]
                     border border-dashed border-[color:var(--color-borde)]"
        >
          <span className="font-semibold">🗂 Incidente real del 123</span>
          <span className="text-[color:var(--color-texto-tenue)]">
            {" "}
            · {CASOS_REALES.length} casos de Bogotá, junio 2026
          </span>
        </button>

        {casoReal && <ProcedenciaCasoReal caso={casoReal} />}
      </div>
    </section>
  );
}

/** El número de incidente y la fecha: es lo que hace verificable el caso. */
function ProcedenciaCasoReal({ caso }: { caso: CasoReal }) {
  return (
    <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--color-texto-tenue)]">
      <span className="tabular">{caso.incidente}</span> ·{" "}
      {caso.localidad ?? "localidad no referida"} ·{" "}
      {new Date(caso.fecha).toLocaleString("es-CO", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}{" "}
      · prioridad {caso.triage} en el CRUE
      <br />
      Incidente real. El texto del dictado es una plantilla: el 123 publica los
      campos, no la narrativa clínica.
    </p>
  );
}
