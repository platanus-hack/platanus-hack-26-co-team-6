import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  /**
   * Liveness probe. Makes no upstream call on purpose — a probe that depends on
   * ai-core would report core as dead whenever a dependency is down.
   */
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
