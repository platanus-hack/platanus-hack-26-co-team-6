import { z } from 'zod';

export const triageRequestSchema = z.object({
  texto: z.string().trim().min(1),
  origen: z.object({ lat: z.number().finite(), lng: z.number().finite() }).optional(),
  tipoMovil: z.enum(['TAB', 'TAM']).optional(),
});
export type TriageRequestSchema = z.infer<typeof triageRequestSchema>;