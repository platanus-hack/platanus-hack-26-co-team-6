import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadGatewayException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiCoreClient } from './ai-core.client';

const CUERPO = { texto: 'dictado suficientemente largo' };

function conConfig(vars: Record<string, string | undefined>) {
  return {
    provide: ConfigService,
    useValue: { get: (k: string) => vars[k] },
  };
}

async function construir(vars: Record<string, string | undefined>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [AiCoreClient, conConfig(vars)],
  }).compile();
  return module.get(AiCoreClient);
}

describe('AiCoreClient', () => {
  const fetchOriginal = global.fetch;

  afterEach(() => {
    global.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it('sin AI_CORE_BASE_URL no está configurado', async () => {
    const c = await construir({});
    expect(c.configurado()).toBe(false);
  });

  it('con AI_CORE_BASE_URL está configurado', async () => {
    const c = await construir({ AI_CORE_BASE_URL: 'http://127.0.0.1:8000' });
    expect(c.configurado()).toBe(true);
  });

  it('le quita la barra final a la base para no pedir //v1/triage', async () => {
    const c = await construir({ AI_CORE_BASE_URL: 'http://127.0.0.1:8000/' });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ caso: {}, latenciaMs: 1, motor: 'claude' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await c.triage(CUERPO as never);

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8000/v1/triage');
  });

  it('sin configurar lanza 503 en vez de pedirle a undefined', async () => {
    const c = await construir({});
    await expect(c.triage(CUERPO as never)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  // ── La tabla de traducción de errores del design.md ────────────

  it('conexión rechazada → 503', async () => {
    const c = await construir({ AI_CORE_BASE_URL: 'http://127.0.0.1:8000' });
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    await expect(c.triage(CUERPO as never)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('timeout → 504', async () => {
    const c = await construir({ AI_CORE_BASE_URL: 'http://127.0.0.1:8000' });
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    global.fetch = jest.fn().mockRejectedValue(err) as unknown as typeof fetch;

    await expect(c.triage(CUERPO as never)).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
  });

  it('no-2xx de ai-core → 502', async () => {
    const c = await construir({ AI_CORE_BASE_URL: 'http://127.0.0.1:8000' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    }) as unknown as typeof fetch;

    await expect(c.triage(CUERPO as never)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('2xx que no es JSON → 502', async () => {
    const c = await construir({ AI_CORE_BASE_URL: 'http://127.0.0.1:8000' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }) as unknown as typeof fetch;

    await expect(c.triage(CUERPO as never)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('nunca filtra la URL ni el cuerpo upstream al navegador', async () => {
    // El navegador no puede ver ai-core. Ese detalle va al log del servidor.
    const c = await construir({ AI_CORE_BASE_URL: 'http://interno:8000' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'stack trace con secretos',
    }) as unknown as typeof fetch;

    await expect(c.triage(CUERPO as never)).rejects.toMatchObject({
      message: 'ai-core returned an invalid response',
    });
  });

  it('el probe de salud usa un presupuesto corto, no el de inferencia', async () => {
    const c = await construir({
      AI_CORE_BASE_URL: 'http://127.0.0.1:8000',
      AI_CORE_TIMEOUT_MS: '30000',
    });
    const spy = jest.spyOn(AbortSignal, 'timeout');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', service: 'ai-core' }),
    }) as unknown as typeof fetch;

    await c.salud();

    expect(spy).toHaveBeenCalledWith(2000);
  });

  it('respeta AI_CORE_TIMEOUT_MS para inferencia', async () => {
    const c = await construir({
      AI_CORE_BASE_URL: 'http://127.0.0.1:8000',
      AI_CORE_TIMEOUT_MS: '5000',
    });
    const spy = jest.spyOn(AbortSignal, 'timeout');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ caso: {}, latenciaMs: 1, motor: 'claude' }),
    }) as unknown as typeof fetch;

    await c.triage(CUERPO as never);

    expect(spy).toHaveBeenCalledWith(5000);
  });
});
