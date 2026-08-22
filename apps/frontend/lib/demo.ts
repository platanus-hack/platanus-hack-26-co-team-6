/**
 * Dictados de ejemplo para la pantalla de campo.
 *
 * Viven en el front porque son semilla de UI: alimentan los botones de
 * "cargar ejemplo". El motor clínico que los procesa está en core.
 */

export const DICTADOS_DEMO = [
  {
    etiqueta: "IAM inferior",
    texto:
      "Paciente masculino de 54 años, dolor precordial opresivo de 40 minutos de evolución, " +
      "irradiado a mandíbula, diaforético. Electro con supradesnivel del ST en DII, DIII y aVF. " +
      "Tensión 85 sobre 50, hemodinámicamente inestable. Vamos en móvil medicalizado.",
    esperado: "triage 2, servicios 743 + 110, complejidad alta",
  },
  {
    etiqueta: "ACV isquémico",
    texto:
      "Femenina de 68 años, inicio súbito hace 50 minutos de hemiparesia derecha y afasia de expresión. " +
      "Glasgow 13. Glicemia 110. Antecedente de fibrilación auricular. Presión 170 sobre 95.",
    esperado: "triage 2, servicios 245 + 110 + 744, complejidad alta",
  },
  {
    etiqueta: "Politrauma pediátrico",
    texto:
      "Menor de 9 años, atropellamiento en vía pública. Trauma craneoencefálico con Glasgow 9, " +
      "deformidad en fémur izquierdo, abdomen distendido y doloroso. Taquicárdico en 140, " +
      "palidez marcada. Requiere manejo de vía aérea.",
    esperado: "triage 1, servicios 203 + 109 + 245, complejidad alta, requiere TAM",
  },
];
