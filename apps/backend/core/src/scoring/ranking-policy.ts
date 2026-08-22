export type MinuteCostCandidate = { codigo: string; totalMinutes: number; etaMin: number };
export const compareMinuteCost = (a: MinuteCostCandidate, b: MinuteCostCandidate) =>
  a.totalMinutes - b.totalMinutes || a.etaMin - b.etaMin || a.codigo.localeCompare(b.codigo);
export const rankByMinuteCost = <T extends MinuteCostCandidate>(candidates: readonly T[]) => [...candidates].sort(compareMinuteCost);