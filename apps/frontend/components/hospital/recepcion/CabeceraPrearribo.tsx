"use client";

/**
 * La cabecera del prearribo: qué llega y en cuánto.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  ESTO SE LEE A DOS METROS
 * ═══════════════════════════════════════════════════════════════════
 *  No es una consola que alguien mira de cerca: es una pantalla colgada en la
 *  pared de urgencias que se lee de paso, cruzando el pasillo. Por eso el
 *  protocolo y la cuenta de llegada ocupan el ancho entero y todo lo demás es
 *  subordinado. El tamaño va en `clamp()` para que el mismo componente sirva
 *  en un televisor de 55" y en el teléfono del jefe de turno sin scroll
 *  horizontal a 320 px.
 *
 *  ── EL PROTOCOLO NO SE DEDUCE AQUÍ ────────────────────────────────
 *  Si el servidor no mandó protocolo, esta cabecera NO lo adivina a partir del
 *  CIE-10. Resolver `I21.*` → código infarto es una tabla clínica versionada
 *  que vive en core (tareas 4.1 y 4.4): "el LLM propone, la tabla decide", y
 *  el frontend no es ninguno de los dos. Un código infarto activado por error
 *  enciende una sala de hemodinamia y llama a un hemodinamista de madrugada
 *  para nada. Sin protocolo confirmado se muestra el diagnóstico, que sí es un
 *  dato real, y se dice que el protocolo falta.
 */

import { Ambulance, Hospital, ShieldAlert } from "lucide-react";
import { ETIQUETA_TRIAGE, esHoraDorada } from "@/lib/presentacion";
import {
  etiquetaProtocolo,
  type CuentaLlegada,
  type PaqueteRecepcion,
  type RotuloEta,
} from "@/lib/recepcion-modelo";

const SEXO: Record<string, string> = {
  M: "Masculino",
  F: "Femenino",
  desconocido: "Sexo no referido",
};

export function CabeceraPrearribo({
  paquete,
  cuenta,
  rotulo,
}: {
  paquete: PaqueteRecepcion;
  cuenta: CuentaLlegada;
  rotulo: RotuloEta;
}) {
  const { paciente, protocolo } = paquete;
  const critico = esHoraDorada(paciente.triage);

  return (
    <header
      className={`rounded-3xl border p-5 sm:p-7 ${
        critico
          ? "border-[color:var(--color-critico)] bg-[color:var(--color-critico)]/10"
          : "border-[color:var(--color-borde)] bg-[color:var(--color-superficie)]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        {/* ── Qué es ── */}
        <div className="min-w-0 flex-1 basis-[16rem]">
          {protocolo ? (
            <h1
              className="font-black leading-none tracking-tight break-words
                         text-[clamp(1.75rem,5.5vw,3.75rem)]"
              style={{ color: "var(--color-critico)" }}
            >
              {etiquetaProtocolo(protocolo.codigo)}
            </h1>
          ) : (
            <div>
              <h1 className="font-black leading-none tracking-tight break-words text-[clamp(1.5rem,4.5vw,3rem)]">
                {paciente.dxDescripcion}
                {paciente.dxCie10 && (
                  <span className="ml-2 tabular font-bold text-[0.5em] align-middle text-[color:var(--color-texto-tenue)]">
                    {paciente.dxCie10}
                  </span>
                )}
              </h1>
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1
                            text-[clamp(0.7rem,1.6vw,0.85rem)] font-semibold
                            bg-[color:var(--color-alerta)]/15 text-[color:var(--color-alerta)]">
                <ShieldAlert className="size-4 shrink-0" strokeWidth={2.4} />
                Protocolo sin confirmar por el catálogo
              </p>
            </div>
          )}

          <p className="mt-3 text-[clamp(0.95rem,2.2vw,1.35rem)] leading-snug">
            <strong className="font-bold">
              {SEXO[paciente.sexo] ?? SEXO.desconocido}
              {paciente.edad != null ? ` ${paciente.edad} a` : ""}
            </strong>
            <span className="text-[color:var(--color-texto-tenue)]">
              {" · "}Triage {ETIQUETA_TRIAGE[paciente.triage]}
            </span>
          </p>

          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[clamp(0.75rem,1.7vw,0.95rem)] text-[color:var(--color-texto-tenue)]">
            <span className="inline-flex items-center gap-1.5">
              <Hospital className="size-4 shrink-0" strokeWidth={2.2} />
              {paquete.sedeNombre ?? paquete.sedeCodigo ?? "Sede sin asignar"}
            </span>
            {paquete.movil && (
              <span className="inline-flex items-center gap-1.5 tabular">
                <Ambulance className="size-4 shrink-0" strokeWidth={2.2} />
                {paquete.movil.id} · {paquete.movil.tipo}
              </span>
            )}
          </p>
        </div>

        {/* ── En cuánto ──
            El número que domina la pantalla. Debajo, SIEMPRE, de dónde sale:
            un 07:12 del despacho y uno que sigue al móvil se leen igual y no
            valen lo mismo. */}
        <div className="min-w-0 shrink-0 text-right">
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--color-texto-tenue)]">
            {cuenta.vencida ? "Debió llegar" : "Llega en"}
          </p>
          <p
            className={`tabular font-black leading-none tracking-tighter
                        text-[clamp(3rem,13vw,7rem)] ${
                          cuenta.vencida ? "latido" : ""
                        }`}
            style={{
              color: cuenta.vencida
                ? "var(--color-alerta)"
                : "var(--color-texto)",
            }}
          >
            {cuenta.reloj}
          </p>
          <p
            className="mt-1 text-[clamp(0.7rem,1.6vw,0.9rem)] font-semibold"
            style={{
              color: rotulo.enVivo && !rotulo.aproximado
                ? "var(--color-estable)"
                : "var(--color-alerta)",
            }}
          >
            {rotulo.enVivo && !rotulo.aproximado ? "▸ " : "▲ "}
            {rotulo.titulo}
          </p>
        </div>
      </div>
    </header>
  );
}
