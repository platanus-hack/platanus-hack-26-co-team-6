/**
 * La revisión clínica del paramédico: validar y confirmar una extracción
 * que no alcanzó sola.
 *
 * `requires_human_review` es una petición; esto construye la respuesta. La
 * política de core (`clinical-policy.ts`) levanta la puerta de confianza si
 * el caso trae `revisionHumana`, pero NO la de coherencia — así que este
 * módulo valida exactamente lo que aquella exige, y lo dice en el mismo
 * orden. Si las dos divergen, el paramédico confirma un formulario que core
 * rechaza: la peor pantalla posible después de tomarse el trabajo de revisar.
 *
 * Vive fuera del componente para probarse sin React: es la parte con reglas.
 */

import type { Caso, NivelTriage, RevisionHumana, Sexo } from "./types";

/** Lo que el paramédico puede tocar. Todo lo demás del caso queda como vino. */
export interface CamposRevision {
  edad: number | null;
  sexo: Sexo;
  triage: NivelTriage;
  /** El hallazgo principal, en palabras del paramédico → `dxDescripcion`. */
  hallazgo: string;
  /** Separados por coma en la UI; aquí ya como lista limpia. */
  signosAlarma: string[];
}

/** El formulario arranca con lo que la heurística alcanzó a entender. */
export function precargar(caso: Caso): CamposRevision {
  return {
    edad: caso.edad,
    sexo: caso.sexo,
    triage: caso.triage,
    hallazgo:
      caso.dxDescripcion === "Cuadro clínico no clasificado"
        ? ""
        : caso.dxDescripcion,
    signosAlarma: [...caso.signosAlarma],
  };
}

/** "hipotensión, palidez,," → ["hipotensión", "palidez"] */
export function partirSignos(texto: string): string[] {
  return texto
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Qué falta para poder confirmar. Vacío = se puede.
 *
 * Espeja la puerta de coherencia de core: dx presente, y con triage 1-2
 * hace falta al menos un signo que lo justifique (o un CIE-10, que este
 * formulario no pide: los signos son lo que el paramédico tiene delante).
 */
export function faltantes(campos: CamposRevision): string[] {
  const faltas: string[] = [];
  if (!campos.hallazgo.trim()) faltas.push("el hallazgo principal");
  if (
    campos.triage <= 2 &&
    campos.signosAlarma.length === 0
  )
    faltas.push("al menos un signo de alarma que justifique triage " + campos.triage);
  return faltas;
}

/**
 * El caso confirmado, listo para /match.
 *
 * La confianza del parser NO se toca: el 0.35 de la heurística queda escrito
 * en el caso y en la auditoría. Lo que cambia es que ahora hay un humano
 * respondiendo por los campos, y eso es `revisionHumana`.
 */
export function confirmar(
  caso: Caso,
  campos: CamposRevision,
  por: string,
  en: string,
): Caso {
  const revision: RevisionHumana = { por, en };
  return {
    ...caso,
    edad: campos.edad,
    sexo: campos.sexo,
    triage: campos.triage,
    dxDescripcion: campos.hallazgo.trim(),
    signosAlarma: campos.signosAlarma,
    // Sin servicios el ranking no filtra nada: 110 (urgencias) es el piso.
    serviciosRequeridos:
      caso.serviciosRequeridos.length > 0 ? caso.serviciosRequeridos : [110],
    revisionHumana: revision,
  };
}
