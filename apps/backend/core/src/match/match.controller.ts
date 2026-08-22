/**
 * POST /match — CARRIL DE ZAID
 *
 * Antes vivía en apps/frontend/app/api/match/route.ts.
 */

import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import type { MatchRequest, MatchResponse } from '../contracts/types';
import { MatchService } from './match.service';
import { PulsoError } from '../common/pulso-error.filter';
import { RoutingService } from '../routing/routing.service';

@Controller('match')
export class MatchController {
  constructor(
    private readonly match: MatchService,
    private readonly routing: RoutingService,
  ) {}

  @Post()
  async rankear(@Body() cuerpo: MatchRequest): Promise<MatchResponse> {
    const { caso, limite = 5, radioKm = 25 } = cuerpo ?? {};
    if (!caso?.origen) {
      throw new BadRequestException('Falta el caso o su origen');
    }
    const clinical = this.routing.assess(caso);
    if (clinical.state !== 'ready_for_matching')
      throw new PulsoError(
        clinical.reasons[0] as
          'PULSO_LOW_CONFIDENCE' | 'PULSO_INCONSISTENT_TRIAGE',
        'Clinical review is required before matching',
      );
    const result = await this.match.rankear(caso, limite, radioKm);
    const decision = await this.routing.match(caso, result.candidatos);
    if ('error' in decision)
      throw new PulsoError(
        decision.error.error.code,
        decision.error.error.message,
      );
    return result;
  }
}
