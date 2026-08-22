type EligibilityCase = { serviciosRequeridos: readonly number[]; complejidadRequerida: 'baja' | 'media' | 'alta'; tipoMovil: 'TAB' | 'TAM'; requiereMedicoABordo: boolean };
type Destination = { codigo: string; servicios: readonly number[]; complejidad: 'baja' | 'media' | 'alta'; camas: readonly { total: number; ocupadasSnapshot: number }[] };
const complexity = { baja: 0, media: 1, alta: 2 };
export function evaluateEligibility(caso: EligibilityCase, destinations: readonly Destination[]) {
  const failures = destinations.map((destination) => {
    const reasons: string[] = [];
    if (caso.serviciosRequeridos.some((service) => !destination.servicios.includes(service))) reasons.push('MISSING_REQUIRED_SERVICES');
    if (complexity[destination.complejidad] < complexity[caso.complejidadRequerida]) reasons.push('INSUFFICIENT_COMPLEXITY');
    if (!destination.camas.some((bed) => bed.total > bed.ocupadasSnapshot)) reasons.push('NO_AVAILABLE_BED');
    if (caso.requiereMedicoABordo && caso.tipoMovil !== 'TAM') reasons.push('MOVIL_INCOMPATIBLE');
    return { destination, reasons };
  });
  const eligible = failures.filter(({ reasons }) => reasons.length === 0).map(({ destination }) => destination);
  return eligible.length ? { state: 'eligible' as const, eligible, failures: [] } : { state: 'escalated_to_crue' as const, eligible: [], failures: failures.map(({ destination, reasons }) => ({ codigo: destination.codigo, reasons })) };
}