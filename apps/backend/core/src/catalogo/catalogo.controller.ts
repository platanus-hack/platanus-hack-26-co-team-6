/**
 * GET /catalogo/motivos-rechazo — tarea 0.6.
 *
 * La consola del hospital NO lleva los motivos escritos adentro: los pide.
 * Asi, corregir una etiqueta es un deploy de core y no de las tres consolas,
 * y —lo que importa— el codigo que se guarda sale de un solo sitio.
 *
 * Exige sesion como el resto: no dice secretos, pero tampoco es dato de calle.
 *
 * ⚠️ DEGRADACION (regla del repo): la fuente hoy es la semilla en codigo.
 *    Cuando 1.2 persista handshakes, la tabla `motivo_rechazo` (migracion
 *    0004) pasa a ser el registro y esta semilla queda como respaldo sin
 *    credenciales. La respuesta ya viaja versionada para que ese cambio no
 *    obligue a tocar el cliente.
 */

import { Controller, Get } from '@nestjs/common';
import type { CatalogoMotivosResponse } from '../contracts/types';
import { MOTIVOS_RECHAZO, VERSION_MOTIVOS_RECHAZO } from './motivos-rechazo';

@Controller('catalogo')
export class CatalogoController {
  @Get('motivos-rechazo')
  motivosRechazo(): CatalogoMotivosResponse {
    return {
      version: VERSION_MOTIVOS_RECHAZO,
      // Solo los vigentes se OFRECEN. Los retirados siguen resolviendose por
      // codigo en `etiquetaDeMotivo`, que es lo que el historico necesita.
      motivos: MOTIVOS_RECHAZO.filter((m) => m.vigente !== false).map((m) => ({
        ...m,
      })),
    };
  }
}
