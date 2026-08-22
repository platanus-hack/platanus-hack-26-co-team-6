import { Global, Module } from '@nestjs/common';
import { AlmacenService } from './almacen.service';

/**
 * Global a propósito: el almacén es el estado vivo de la sesión y lo consumen
 * casi todos los módulos. Declararlo en siete `imports` distintos sería ruido
 * sin información.
 */
@Global()
@Module({
  providers: [AlmacenService],
  exports: [AlmacenService],
})
export class AlmacenModule {}
