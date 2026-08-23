/**
 * Autenticacion. @Global porque SesionService lo inyecta el guard, que corre
 * fuera del arbol de modulos de dominio.
 *
 * Aqui se registran los DOS guards, y el orden importa:
 *
 *   1. SesionGuard  — ¿hay sesion? Resuelve el actor y lo cuelga del request.
 *   2. RolGuard     — ¿ese actor puede hacer ESTO sobre ESTA sede?
 *
 * Nest los corre en el orden en que se declaran, y el segundo depende de lo
 * que deja el primero. Invertirlos deja a `RolGuard` sin actor y negando
 * todo lo decorado.
 *
 * Desde este import, TODA ruta de core exige sesion salvo las marcadas con
 * @Publico().
 */

import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { RepoActoresMemoria } from './actores';
import { BloqueoLogin } from './bloqueo';
import { RolGuard } from './rol.guard';
import { SesionGuard } from './sesion.guard';
import { SesionService } from './sesion.service';
import { RegistroSesiones } from './sesiones';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    SesionService,
    RegistroSesiones,
    RepoActoresMemoria,
    BloqueoLogin,
    { provide: APP_GUARD, useClass: SesionGuard },
    { provide: APP_GUARD, useClass: RolGuard },
  ],
  exports: [SesionService, RegistroSesiones, RepoActoresMemoria],
})
export class AuthModule {}
