import { transitionCase, transitionHandshake } from './lifecycle';

describe('routing lifecycle', () => {
  it('allows declared case and handshake transitions', () => {
    expect(transitionCase('validated', 'ready_for_matching')).toEqual({ ok: true, state: 'ready_for_matching' });
    expect(transitionHandshake('pending', 'accepted')).toEqual({ ok: true, state: 'accepted' });
  });
  it('rejects undeclared transitions without changing state', () => {
    expect(transitionCase('closed', 'matching')).toEqual({ ok: false, state: 'closed', error: { error: { code: 'PULSO_ILLEGAL_TRANSITION', message: 'Illegal case transition', retryable: false } } });
    expect(transitionHandshake('accepted', 'rejected')).toEqual({ ok: false, state: 'accepted', error: { error: { code: 'PULSO_ILLEGAL_TRANSITION', message: 'Illegal handshake transition', retryable: false } } });
  });
});