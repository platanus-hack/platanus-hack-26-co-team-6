"use client";

/**
 * §2 — La captura por voz.
 *
 * El corazón de la entrada de datos, sin formularios. El orbe manda en la
 * pantalla; el texto va debajo, para verificar lo que se entendió.
 *
 * ── EL ORDEN IMPORTA ──────────────────────────────────────────────
 * Primero el orbe (¿me está oyendo?), después la transcripción (¿entendió lo
 * que dije?) y al final los botones. Es la secuencia en la que un clínico
 * necesita las respuestas, y por eso el textarea —que en la versión anterior
 * dominaba la pantalla— pasa a ser lo que es: la red de seguridad, no el
 * camino principal.
 *
 * El textarea no desaparece nunca. Si niego el permiso del micrófono, o el
 * navegador es un Safari sin Web Speech, la app sigue funcionando escribiendo.
 */

import { Mic, Square, FolderClock } from "lucide-react";
import { DICTADOS_DEMO } from "@/lib/demo";
import { CASOS_REALES, type CasoReal } from "@/lib/casos-reales.generado";
import { MENSAJE_FALLO, type FalloDictado } from "@/lib/useDictadoVoz";
import { OrbeVoz, type EstadoOrbe } from "./OrbeVoz";

const MINIMO_CARACTERES = 10;

export function PantallaCaptura({
  texto,
  onTexto,
  onDictadoDemo,
  onCasoReal,
  casoReal,
  escuchando,
  onMicrofono,
  vozSoportada,
  falloDictado,
  parcial,
  medidorRef,
  onAnalizar,
  analizando,
  sinSenal,
  onCancelar,
}: {
  texto: string;
  onTexto: (t: string) => void;
  onDictadoDemo: (t: string) => void;
  onCasoReal: () => void;
  casoReal: CasoReal | null;
  escuchando: boolean;
  onMicrofono: () => void;
  vozSoportada: boolean;
  falloDictado: FalloDictado | null;
  parcial: string;
  medidorRef: React.MutableRefObject<HTMLElement | null>;
  onAnalizar: () => void;
  analizando: boolean;
  sinSenal: boolean;
  onCancelar: () => void;
}) {
  const estadoOrbe: EstadoOrbe = analizando
    ? "procesando"
    : sinSenal
      ? "sin-senal"
      : escuchando
        ? "escuchando"
        : "inactivo";

  const hayTexto = texto.trim().length >= MINIMO_CARACTERES;

  return (
    <section className="flex flex-col items-center">
      <OrbeVoz estado={estadoOrbe} medidorRef={medidorRef} />

      {/* Lo que el orbe dice en color, dicho también en palabras: el orbe es
          aria-hidden, y esto es lo que oye un lector de pantalla. */}
      <p className="mt-1 mb-4 text-sm font-semibold min-h-6" role="status">
        {analizando ? (
          <span className="text-[color:var(--color-alerta)]">
            Analizando el caso…
          </span>
        ) : escuchando ? (
          <span className="text-[color:var(--color-info)]">
            Escuchando… habla normal
          </span>
        ) : sinSenal ? (
          <span className="text-[color:var(--color-critico)]">
            Sin señal — puedes dictar, se enviará al reconectar
          </span>
        ) : hayTexto ? (
          <span className="text-[color:var(--color-texto-tenue)]">
            Revisa el texto y continúa
          </span>
        ) : (
          <span className="text-[color:var(--color-texto-tenue)]">
            Toca el micrófono y dicta el caso
          </span>
        )}
      </p>

      <button
        onClick={onMicrofono}
        disabled={analizando}
        aria-pressed={escuchando}
        className={`w-full min-h-16 rounded-2xl font-semibold text-lg border transition-colors
                    inline-flex items-center justify-center gap-2.5
                    disabled:opacity-40 ${
                      escuchando
                        ? "bg-[color:var(--color-critico)] border-transparent text-white"
                        : "bg-[color:var(--color-superficie-alta)] border-[color:var(--color-borde)]"
                    }`}
      >
        {escuchando ? (
          <>
            {/* `fill` y no solo trazo: un cuadrado macizo se lee como "parar"
                de un vistazo, que es lo que hace falta con el paciente
                delante. */}
            <Square className="size-5" strokeWidth={2} fill="currentColor" />
            Detener dictado
          </>
        ) : (
          <>
            <Mic className="size-5" strokeWidth={2} />
            Dictar
          </>
        )}
      </button>

      {/* El fallo del dictado se pinta JUNTO al botón que lo provoca, no en el
          banner de errores de la página: el textarea sigue funcionando, así que
          esto no es un error del flujo — es una vía que no está disponible. */}
      {falloDictado && (
        <p
          role="alert"
          className="mt-2 w-full text-xs text-[color:var(--color-alerta)]"
        >
          {MENSAJE_FALLO[falloDictado]}
        </p>
      )}

      <div className="relative mt-3 w-full">
        <textarea
          value={texto}
          onChange={(e) => onTexto(e.target.value)}
          placeholder="…o escribe el caso aquí. Ej: masculino de 54 años, dolor precordial opresivo, supra ST en DII DIII aVF, hemodinámicamente inestable."
          rows={5}
          className="w-full p-4 rounded-2xl text-base leading-relaxed
                     bg-[color:var(--color-superficie)]
                     border border-[color:var(--color-borde)]
                     focus:outline-none focus:border-[color:var(--color-info)]"
        />

        {/* Lo que se está oyendo pero aún no se ha confirmado.
            Es la diferencia entre "no funciona" y "te estoy oyendo": el
            reconocedor tarda en cerrar una frase, y sin esto la pantalla se
            queda muda varios segundos mientras alguien habla. Va aparte del
            textarea a propósito — el texto real solo crece con lo confirmado. */}
        {parcial && (
          <p className="mt-1.5 px-1 text-sm italic text-[color:var(--color-texto-tenue)]">
            {parcial}
            <span className="latido" aria-hidden>
              ▍
            </span>
          </p>
        )}
      </div>

      <div className="mt-3 flex w-full gap-2">
        <button
          onClick={onCancelar}
          className="px-4 min-h-14 rounded-2xl border border-[color:var(--color-borde)]"
        >
          Cancelar
        </button>
        <button
          onClick={onAnalizar}
          disabled={!hayTexto || analizando}
          className="flex-1 min-h-14 rounded-2xl font-bold text-base
                     bg-[color:var(--color-info)] text-[#04121f]
                     disabled:opacity-40"
        >
          {analizando ? "Analizando…" : "Analizar y rutear"}
        </button>
      </div>

      {!vozSoportada && !falloDictado && (
        <p className="mt-3 w-full text-xs text-[color:var(--color-alerta)]">
          {MENSAJE_FALLO["sin-soporte"]}
        </p>
      )}

      <div className="mt-6 w-full">
        <p className="mb-2 text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)]">
          Casos de prueba
        </p>
        <div className="flex flex-wrap gap-2">
          {DICTADOS_DEMO.map((d) => (
            <button
              key={d.etiqueta}
              onClick={() => onDictadoDemo(d.texto)}
              className="px-3 min-h-11 text-xs rounded-lg
                         bg-[color:var(--color-superficie)]
                         border border-[color:var(--color-borde)]"
            >
              {d.etiqueta}
            </button>
          ))}
        </div>

        {/* La respuesta a "¿esto solo funciona con sus tres ejemplos?" */}
        <button
          onClick={onCasoReal}
          className="mt-2 w-full px-3 py-3 min-h-12 text-sm rounded-xl text-left
                     inline-flex items-center gap-2
                     bg-[color:var(--color-superficie)]
                     border border-dashed border-[color:var(--color-borde)]"
        >
          <FolderClock
            className="size-4 shrink-0 text-[color:var(--color-texto-tenue)]"
            strokeWidth={2}
          />
          <span>
            <span className="font-semibold">Incidente real del 123</span>
            <span className="text-[color:var(--color-texto-tenue)]">
              {" "}
              · {CASOS_REALES.length} casos de Bogotá, junio 2026
            </span>
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
