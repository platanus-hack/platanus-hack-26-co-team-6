/**
 * Autenticación. @Global porque SesionService lo inyecta el guard, que corre
 * fuera del árbol de módulos de dominio.
 *
 * Aquí se registra el APP_GUARD: desde este import, TODA ruta de core exige
 * sesión salvo las marcadas con @Publico().
 */

import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { SesionGuard } from './sesion.guard';
import { SesionService } from './sesion.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [SesionService, { provide: APP_GUARD, useClass: SesionGuard }],
  exports: [SesionService],
})
export class AuthModule {}
