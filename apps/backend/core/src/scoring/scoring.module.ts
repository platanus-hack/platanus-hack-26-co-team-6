import { Module } from '@nestjs/common';
import { CongestionService } from './congestion.service';
import { ScoringService } from './scoring.service';

/**
 * Congestión y scoring viajan juntos: el score consume el índice de congestión
 * en cada término de espera. Separarlos en dos módulos solo agregaría un
 * import sin agregar una frontera real.
 */
@Module({
  providers: [CongestionService, ScoringService],
  exports: [CongestionService, ScoringService],
})
export class ScoringModule {}
