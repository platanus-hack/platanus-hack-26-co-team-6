import { Controller, Get } from '@nestjs/common';
import { Publico } from '../auth/publico.decorator';

@Controller('health')
export class HealthController {
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
}
