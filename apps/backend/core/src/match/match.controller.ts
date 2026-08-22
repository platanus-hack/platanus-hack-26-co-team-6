/**
 * POST /match — CARRIL DE ZAID
 *
 * Antes vivía en apps/frontend/app/api/match/route.ts.
 */

import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import type { MatchRequest, MatchResponse } from '../contracts/types';
import { MatchService } from './match.service';

@Controller('match')
export class MatchController {
  constructor(private readonly match: MatchService) {}

  @Post()
  async rankear(@Body() cuerpo: MatchRequest): Promise<MatchResponse> {
    const { caso, limite = 5, radioKm = 25 } = cuerpo ?? {};
    if (!caso?.origen) {
      throw new BadRequestException('Falta el caso o su origen');
    }
    return this.match.rankear(caso, limite, radioKm);
  }
}
