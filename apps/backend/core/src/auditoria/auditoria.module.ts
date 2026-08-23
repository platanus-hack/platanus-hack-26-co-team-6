/**
 * La vista forense.
 *
 * Importa PersistenceModule para leer `pulso_routing_decision_audit` por el
 * mismo token que usa RoutingService: Nest cachea los módulos, así que es el
 * MISMO store que escribió la evidencia, no una copia vacía.
 *
 * `RegistroService` y `ActorService` llegan solos: EventosModule es @Global.
 */

import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaService } from './auditoria.service';

@Module({
  imports: [PersistenceModule],
  controllers: [AuditoriaController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
