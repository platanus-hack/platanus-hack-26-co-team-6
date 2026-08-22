/**
 * Extractor clinico de emergencia, por palabras clave.
 *
 * No pretende ser bueno. Existe para que el equipo no quede bloqueado si
 * falta ANTHROPIC_API_KEY o se cae la red del evento. Devuelve siempre
 * `confianza: 0.35` — ese numero es la senal de "esto NO salio del LLM".
 *
 * Neid: tu trabajo es que la rama de Claude sea claramente mejor que esto.
 * Si en un ensayo ves confianza 0.35 exacta, estas viendo la heuristica.
 *
 * (Vive aca y no dentro del route.ts porque Next valida los exports de los
 *  route handlers: exportar una funcion extra desde un route.ts rompe el
 *  typecheck. Ver lib/handshake.ts, mismo motivo.)
 */

import type { ExtraccionClinica } from "../contracts/types";

export function extraccionHeuristica(texto: string): ExtraccionClinica {
  const t = texto.toLowerCase();
  const servicios: number[] = [];
  let dxCie10: string | null = null;
  let dxDescripcion = "Cuadro clínico no clasificado";
  let triage: 1 | 2 | 3 | 4 | 5 = 3;

  const cardiaco = /supra ?st|supradesnivel|precordial|infarto|iam|sca/.test(t);
  const neuro = /acv|hemipare|afasia|glasgow|cefalea súbita|convuls|tec|craneoencef/.test(t);
  const trauma = /trauma|atropell|herida|fractura|deformidad|politrauma|arma/.test(t);
  const pediatrico = /menor|niñ|pediátric|lactante|meses de edad/.test(t);
  const inestable = /inestable|hipoten|shock|taquicárd|palidez|diafor|vía aérea|intubad/.test(t);

  if (cardiaco) {
    servicios.push(743, 110);
    dxCie10 = "I21.9";
    dxDescripcion = "Síndrome coronario agudo";
    triage = 2;
  }
  if (neuro) {
    servicios.push(245, 110, 744);
    dxCie10 = "I63.9";
    dxDescripcion = "Evento cerebrovascular";
    triage = 2;
  }
  if (trauma) {
    servicios.push(203, pediatrico ? 109 : 110);
    dxCie10 = "T07";
    dxDescripcion = "Politraumatismo";
    triage = 1;
  }
  if (!servicios.length) servicios.push(110);
  if (inestable) triage = Math.min(triage, 2) as typeof triage;

  // Acepta "54 anos" ademas de "54 años": las transcripciones de voz y los
  // teclados sin tilde se comen la enie constantemente.
  const mEdad = t.match(/(\d{1,3})\s*a[nñ]os/);
  const edad = mEdad ? parseInt(mEdad[1], 10) : pediatrico ? 8 : null;
  const sexo: "M" | "F" | "desconocido" = /masculino|hombre|varón/.test(t)
    ? "M"
    : /femenina|femenino|mujer/.test(t)
      ? "F"
      : "desconocido";

  return {
    resumen: texto.slice(0, 140),
    triage,
    dxCie10,
    dxDescripcion,
    serviciosRequeridos: [...new Set(servicios)],
    complejidadRequerida: "alta",
    edad,
    sexo,
    signosAlarma: inestable ? ["Inestabilidad hemodinámica"] : [],
    requiereMedicoABordo: inestable || triage === 1,
    confianza: 0.35,
  };
}
