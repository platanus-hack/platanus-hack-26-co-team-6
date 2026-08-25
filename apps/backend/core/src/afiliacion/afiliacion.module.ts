/**
 * Afiliacion — tareas 2.1 (IPS), 2.9 (operadores) y la base de 2.5.
 *
 * Exporta `AfiliacionService` porque el ranking le pregunta que sedes NO son
 * despachables, y `RepoOrganizacionesMemoria` porque las invitaciones (2.5)
 * necesitan resolver a que organizacion pertenece quien invita.
 */

import { Module } from '@nestjs/common';
import { SedesModule } from '../sedes/sedes.module';
import { AfiliacionController } from './afiliacion.controller';
import { AfiliacionService } from './afiliacion.service';
import { LimiteIp } from './limite-ip';
import { RepoOrganizacionesMemoria } from './organizaciones';

@Module({
  imports: [SedesModule],
  controllers: [AfiliacionController],
  providers: [AfiliacionService, LimiteIp, RepoOrganizacionesMemoria],
  exports: [AfiliacionService, RepoOrganizacionesMemoria],
})
export class AfiliacionModule {}
