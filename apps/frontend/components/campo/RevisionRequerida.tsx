"use client";

/**
 * Cuando el motor de ruteo se niega a seguir.
 *
 * Estos tres códigos no son fallos: son decisiones. El sistema prefiere
 * detenerse antes que mandar una ambulancia sobre una suposición, y esa es
 * justamente la parte defendible del producto. Pintarlos como un error rojo
 * genérico —"core respondió 400", que es lo que salía— tira esa decisión a la
 * basura y deja al paramédico sin saber qué hacer.
 *
 * Cada uno tiene una causa distinta y una salida distinta:
 *
 *   LOW_CONFIDENCE        el parser no entendió. Lo arregla el dictado.
 *   INCONSISTENT_TRIAGE   entendió cosas que no encajan. Lo arregla el dictado.
 *   NO_ELIGIBLE_DESTINATION  entendió perfecto: no hay sede que cumpla. El
 *                         dictado no tiene la culpa y repetirlo no sirve —
 *                         esto sube al CRUE.
 *
 * Por eso el tercero es crítico y los dos primeros son alerta: los primeros
 * los resuelve quien está mirando la pantalla; el tercero, no.
 */

import type { CodigoError } from "@/lib/api";

interface Guion {
  titulo: string;
  cuerpo: string;
  accion: string;
  critico: boolean;
}

const GUION: Record<CodigoError, Guion> = {
  PULSO_LOW_CONFIDENCE: {
    titulo: "Requiere revisión clínica",
    cuerpo:
      "La extracción no alcanzó la confianza mínima para rutear. PULSO no propone destinos con un cuadro que no entendió bien.",
    accion:
      "Agrega al dictado la edad, el sexo y el hallazgo principal, y vuelve a analizar.",
    critico: false,
  },
  PULSO_INCONSISTENT_TRIAGE: {
    titulo: "El cuadro no es coherente",
    cuerpo:
      "El nivel de triage y los hallazgos no concuerdan entre sí, así que el ruteo se detuvo antes de proponer una sede.",
    accion: "Revisa el dictado y precisa los signos que justifican la gravedad.",
    critico: false,
  },
  PULSO_NO_ELIGIBLE_DESTINATION: {
    titulo: "Ninguna sede cumple",
    cuerpo:
      "El cuadro se entendió bien. Ninguna sede en el radio tiene habilitados todos los servicios que este paciente necesita.",
    accion: "Repetir el dictado no cambia esto. Escale al CRUE por radio.",
    critico: true,
  },
  PULSO_INCOMPLETE_EVIDENCE: {
    titulo: "Falta el ranking",
    cuerpo:
      "Se intentó despachar sin una evaluación de sedes registrada. PULSO no manda una ambulancia sin dejar constancia de por qué eligió ese destino.",
    accion: "Vuelve a analizar el caso para generar el ranking.",
    critico: false,
  },
  PULSO_DESTINATION_ALREADY_ACCEPTED: {
    titulo: "Otra sede ya aceptó",
    cuerpo:
      "Este caso ya tiene destino confirmado. No se puede despachar dos veces el mismo paciente.",
    accion: "Revisa el estado del traslado antes de volver a intentarlo.",
    critico: false,
  },
  PULSO_ILLEGAL_TRANSITION: {
    titulo: "La solicitud ya cambió",
    cuerpo:
      "El caso avanzó mientras esta pantalla esperaba, y la acción que intentaste ya no aplica a su estado actual.",
    accion: "Vuelve al dictado para ver el estado al día.",
    critico: false,
  },
};

export function RevisionRequerida({
  codigo,
  detalle,
  onVolver,
}: {
  codigo: CodigoError;
  /** El mensaje que mandó core. Se muestra al pie, para depurar. */
  detalle?: string;
  onVolver: () => void;
}) {
  const g = GUION[codigo];
  const color = g.critico ? "var(--color-critico)" : "var(--color-alerta)";

  return (
    <section
      role="alert"
      className="p-5 rounded-xl border"
      style={{ borderColor: color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
    >
      <h2 className="font-bold text-base mb-2" style={{ color }}>
        {g.titulo}
      </h2>

      <p className="text-sm leading-relaxed mb-3">{g.cuerpo}</p>

      <p className="text-sm leading-relaxed font-semibold mb-4">{g.accion}</p>

      <button
        onClick={onVolver}
        className="w-full rounded-xl font-semibold
                   bg-[color:var(--color-superficie-alta)]
                   border border-[color:var(--color-borde)]"
      >
        Volver al dictado
      </button>

      {detalle && (
        <p className="mt-3 text-[11px] text-[color:var(--color-texto-tenue)]">
          {codigo} · {detalle}
        </p>
      )}
    </section>
  );
}
