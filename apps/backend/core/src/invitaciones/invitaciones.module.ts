/**
 * Equipo e invitaciones — tarea 2.5 (backend).
 *
 * La vista `/panel/equipo` y `/invitacion/:token` van aparte: dependen del
 * layout de `/panel` (tarea 2.7, Sebas) y de `lib/api.ts` (tarea 2.8, Zaid),
 * y el orden de merge de la ola 2 pide que esas dos entren primero.
 */

import { Module } from '@nestjs/common';
import { AfiliacionModule } from '../afiliacion/afiliacion.module';
import { InvitacionesController } from './invitaciones.controller';
import { InvitacionesService } from './invitaciones.service';
import { RepoInvitacionesMemoria } from './invitaciones';

@Module({
  imports: [AfiliacionModule],
  controllers: [InvitacionesController],
  providers: [InvitacionesService, RepoInvitacionesMemoria],
  exports: [InvitacionesService],
})
export class InvitacionesModule {}
