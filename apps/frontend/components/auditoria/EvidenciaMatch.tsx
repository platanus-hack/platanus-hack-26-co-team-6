"use client";

/**
 * La evidencia con la que el motor eligió destino.
 *
 * Es la parte del expediente que contesta la pregunta cara: *"¿por qué esta
 * sede y no la que estaba a ocho minutos?"*. Sale de
 * `pulso_routing_decision_audit`, que es append-only desde la migración 0002.
 *
 * Los descartados **con su motivo** no son ruido, son el producto: ver una
 * clínica a 10 minutos tachada por no tener hemodinamia es lo que explica
 * PULSO de un vistazo. Y el desglose va en minutos, no en puntos, porque un
 * jurado entiende "12 minutos de ruta más 3 de riesgo de rechazo" sin que
 * nadie le explique la fórmula.
 */

import {
  candidatosDe,
  desgloseEnMinutos,
  estaRedactado,
  procedenciaEta,
  type EvidenciaExpediente,
} from "@/lib/auditoria-modelo";

export default function EvidenciaMatch({
  evidencia,
}: {
  evidencia: EvidenciaExpediente | null;
}) {
  if (!evidencia) {
    return (
      <p className="text-sm text-[color:var(--color-texto-tenue)] border border-[color:var(--color-borde)] rounded-xl p-4">
        Este caso no tiene evidencia de ruteo registrada. O nunca pasó por el
        motor, o corrió con el almacén en memoria y se perdió al reiniciar
        core.
      </p>
    );
  }

  const candidatos = candidatosDe(evidencia);
  const desglose = desgloseEnMinutos(evidencia);
  const inputs = (evidencia.inputs ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <dl className="bloque grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs border border-[color:var(--color-borde)] rounded-xl p-3">
        <Par clave="estado de la decisión" valor={
          evidencia.estado === "matched" ? "destino elegido" : "escalado al CRUE"
        } />
        <Par clave="destino elegido" valor={evidencia.selectedDestination ?? "ninguno"} />
        <Par clave="versión del modelo" valor={evidencia.modelVersion ?? "sin registrar"} />
        <Par clave="versión de config" valor={evidencia.configVersion ?? "sin registrar"} />
        <Par clave="procedencia del ETA" valor={procedenciaEta(evidencia)} />
        <Par clave="huella de la decisión" valor={evidencia.fingerprint ?? "sin registrar"} />
      </dl>

      {desglose.length > 0 && (
        <section className="bloque">
          <h3 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)] mb-1">
            Desglose del costo, en minutos
          </h3>
          <table className="w-full text-xs">
            <thead className="text-[color:var(--color-texto-tenue)]">
              <tr className="text-left">
                <th className="font-normal py-1">Concepto</th>
                <th className="font-normal py-1 text-right">Minutos</th>
              </tr>
            </thead>
            <tbody>
              {desglose.map((d) => (
                <tr key={d.concepto} className="border-t border-[color:var(--color-borde)]">
                  <td className="py-1">{d.concepto}</td>
                  <td className="py-1 text-right tabular">
                    {d.minutos > 0 ? "+" : ""}
                    {d.minutos}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {candidatos.length > 0 && (
        <section className="bloque">
          <h3 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)] mb-1">
            Sedes evaluadas ({candidatos.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[color:var(--color-texto-tenue)]">
                <tr className="text-left">
                  <th className="font-normal py-1">Sede</th>
                  <th className="font-normal py-1">Código</th>
                  <th className="font-normal py-1 text-right">ETA</th>
                  <th className="font-normal py-1">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {candidatos.map((c) => (
                  <tr
                    key={`${c.codigo}-${c.rank}`}
                    className="border-t border-[color:var(--color-borde)] align-top"
                  >
                    <td className="py-1">{c.nombre}</td>
                    <td className="py-1 tabular">{c.codigo}</td>
                    <td className="py-1 text-right tabular">
                      {c.etaMin === null ? "—" : `${Math.round(c.etaMin)}′`}
                    </td>
                    <td className="py-1">
                      {/* Texto, no color: esto se imprime en blanco y negro. */}
                      {c.elegido ? (
                        <span className="marca border border-[color:var(--color-estable)] rounded px-1">
                          ELEGIDA
                        </span>
                      ) : c.motivoDescarte ? (
                        <>
                          <span className="marca border border-[color:var(--color-critico)] rounded px-1">
                            DESCARTADA
                          </span>{" "}
                          {c.motivoDescarte}
                        </>
                      ) : (
                        <span className="text-[color:var(--color-texto-tenue)]">
                          evaluada, no elegida
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="bloque">
        <h3 className="text-xs uppercase tracking-wide text-[color:var(--color-texto-tenue)] mb-1">
          El caso que entró al motor
        </h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {Object.entries(inputs).map(([clave, valor]) => (
            <Par
              key={clave}
              clave={clave}
              valor={
                estaRedactado(valor)
                  ? "REDACTADO"
                  : typeof valor === "object"
                    ? JSON.stringify(valor)
                    : String(valor)
              }
              redactado={estaRedactado(valor)}
            />
          ))}
        </dl>
      </section>
    </div>
  );
}

function Par({
  clave,
  valor,
  redactado = false,
}: {
  clave: string;
  valor: string;
  redactado?: boolean;
}) {
  return (
    <>
      <dt className="text-[color:var(--color-texto-tenue)]">{clave}</dt>
      <dd className="break-words">
        {redactado ? (
          <span className="marca border border-[color:var(--color-borde)] rounded px-1">
            {valor}
          </span>
        ) : (
          valor
        )}
      </dd>
    </>
  );
}
