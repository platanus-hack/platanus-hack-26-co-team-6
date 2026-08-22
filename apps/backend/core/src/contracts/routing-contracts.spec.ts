import { BadRequestException } from '@nestjs/common';
import { PulsoError, toPulsoErrorEnvelope } from '../common/pulso-error.filter';
import { triageRequestSchema } from './schemas';

describe('routing contracts', () => {
  it('accepts a valid triage request and preserves its mobile type', () => {
    expect(triageRequestSchema.parse({ texto: 'Paciente con dolor torÃ¡cico', tipoMovil: 'TAM' })).toMatchObject({ tipoMovil: 'TAM' });
  });

  it('rejects malformed triage and maps errors to the PULSO envelope', () => {
    expect(() => triageRequestSchema.parse({ texto: '' })).toThrow();
    expect(toPulsoErrorEnvelope(new PulsoError('PULSO_INVALID_INPUT', 'Invalid triage'))).toEqual({ error: { code: 'PULSO_INVALID_INPUT', message: 'Invalid triage', retryable: false } });
    expect(toPulsoErrorEnvelope(new BadRequestException())).toEqual({ error: { code: 'PULSO_INVALID_INPUT', message: 'Invalid request', retryable: false } });
  });
});