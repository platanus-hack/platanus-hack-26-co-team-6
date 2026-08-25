type ClinicalInput = { resumen: string; dxDescripcion: string; dxCie10: string | null; serviciosRequeridos: readonly number[]; signosAlarma: readonly string[]; confianza: number; triage: number; revisionHumana?: { por: string; en: string } };
export function classifyClinicalTriage(input: ClinicalInput) {
  // `requires_human_review` es una peticion, y `revisionHumana` es la
  // respuesta: un humano ya reviso los campos y confirmo. La puerta de
  // confianza se levanta — la de coherencia NO: un humano tampoco puede
  // mandar a matching un caso sin diagnostico o sin servicios, porque el
  // ranking no tendria con que filtrar sedes.
  const confiable = input.confianza >= 0.5 || Boolean(input.revisionHumana?.por?.trim());
  if (!confiable) return { state: 'requires_human_review' as const, reasons: ['PULSO_LOW_CONFIDENCE'] };
  const coherent = !!input.resumen.trim() && !!input.dxDescripcion.trim() && input.serviciosRequeridos.length > 0 && (input.triage > 2 || input.dxCie10 !== null || input.signosAlarma.length > 0);
  return coherent ? { state: 'ready_for_matching' as const, reasons: [] } : { state: 'requires_human_review' as const, reasons: ['PULSO_INCONSISTENT_TRIAGE'] };
}