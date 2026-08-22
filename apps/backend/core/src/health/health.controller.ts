import { Controller, Get } from '@nestjs/common';
import { AiCoreClient } from '../ai-core/ai-core.client';
import { Publico } from '../auth/publico.decorator';

@Controller('health')
export class HealthController {
  constructor(private readonly aiCore: AiCoreClient) {}

  /**
   * Liveness probe. Makes no upstream call on purpose — a probe that depends on
   * ai-core would report core as dead whenever a dependency is down.
   */
  // Sin sesión: un balanceador no tiene cookie. No devuelve dato alguno.
  @Publico()
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }

  /**
   * Prueba la costura core → ai-core. Separado de `/health` a propósito: si
   * la liveness fallara cuando una dependencia está caída, cualquier
   * orquestador entraría en un ciclo de reinicios en cascada.
   *
   * 503 = no configurado o inalcanzable · 504 = lento · 502 = respondió mal.
   */
  @Publico()
  @Get('ai-core')
  async checkAiCore(): Promise<{
    status: string;
    service: string;
    upstream: string;
    latenciaMs: number;
  }> {
    const t0 = Date.now();
    const arriba = await this.aiCore.salud();
    return {
      status: 'ok',
      service: 'core',
      upstream: arriba.service ?? 'ai-core',
      latenciaMs: Date.now() - t0,
    };
  }
}
