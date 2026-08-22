type ClinicalInput = { resumen: string; dxDescripcion: string; dxCie10: string | null; serviciosRequeridos: readonly number[]; signosAlarma: readonly string[]; confianza: number; triage: number };
export function classifyClinicalTriage(input: ClinicalInput) {
  if (input.confianza < 0.5) return { state: 'requires_human_review' as const, reasons: ['PULSO_LOW_CONFIDENCE'] };
  const coherent = !!input.resumen.trim() && !!input.dxDescripcion.trim() && input.serviciosRequeridos.length > 0 && (input.triage > 2 || input.dxCie10 !== null || input.signosAlarma.length > 0);
  return coherent ? { state: 'ready_for_matching' as const, reasons: [] } : { state: 'requires_human_review' as const, reasons: ['PULSO_INCONSISTENT_TRIAGE'] };
}