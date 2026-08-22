import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { AiCoreClient } from '../ai-core/ai-core.client';

describe('HealthController', () => {
  let controller: HealthController;
  const aiCore = { salud: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: AiCoreClient, useValue: aiCore }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns ok', () => {
    expect(controller.check()).toEqual({ status: 'ok' });
  });

  it('la liveness NO llama a ai-core', async () => {
    // Si /health dependiera de una dependencia caída, cualquier orquestador
    // entraría en reinicios en cascada.
    controller.check();
    expect(aiCore.salud).not.toHaveBeenCalled();
  });

  it('/health/ai-core sí prueba la costura', async () => {
    aiCore.salud.mockResolvedValue({ status: 'ok', service: 'ai-core' });

    const r = await controller.checkAiCore();

    expect(aiCore.salud).toHaveBeenCalled();
    expect(r.upstream).toBe('ai-core');
    expect(r.status).toBe('ok');
  });

  it('/health/ai-core propaga el error del cliente', async () => {
    aiCore.salud.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(controller.checkAiCore()).rejects.toThrow();
  });
});
