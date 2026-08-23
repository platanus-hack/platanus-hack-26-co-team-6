/**
 * GET    /auth/llaves          — las de mi organizacion (nunca el valor)
 * POST   /auth/llaves          — crear. Devuelve el valor UNA sola vez
 * POST   /auth/llaves/:id/rotar — nueva llave; la vieja aguanta 24 h
 * DELETE /auth/llaves/:id      — revocar, sin gracia
 *
 * Tarea 5.9. Solo administradores: repartir llaves es repartir acceso, y una
 * llave con `capacidad:declarar` puede decirle a la red que un hospital esta
 * lleno cuando no lo esta.
 *
 * ⚠️ La vista `/panel/api` que consume esto es la otra mitad de la tarea y
 *    todavia no existe: cuelga del shell de `/panel` (2.7). Mientras tanto
 *    esto se usa con `curl`, que es exactamente como lo va a usar el
 *    integrador de un HIS de todas formas.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import type { ActorSesion } from './carga';
import { Actor, Rol } from './rol.decorator';
import { ALCANCES, LlavesService, esAlcance, type Alcance } from './llaves';

interface CrearLlaveRequest {
  etiqueta?: string;
  alcances?: string[];
}

@Controller('auth/llaves')
// Nadie reparte acceso salvo quien administra. `admin_organizacion` para la
// suya; `admin_plataforma` porque tambien administra la del CRUE.
@Rol('admin_organizacion', 'admin_plataforma')
export class LlavesController {
  constructor(private readonly llaves: LlavesService) {}

  @Get()
  listar(@Actor() actor: ActorSesion) {
    return {
      llaves: this.llaves.listar(actor.organizacionId).map(publica),
      alcancesDisponibles: ALCANCES,
    };
  }

  @Post()
  crear(@Actor() actor: ActorSesion, @Body() cuerpo: CrearLlaveRequest) {
    const etiqueta = cuerpo?.etiqueta?.trim();
    if (!etiqueta)
      throw new BadRequestException(
        'Falta la etiqueta: sin un nombre, en seis meses nadie sabe que integracion es esta llave',
      );

    const pedidos = cuerpo?.alcances ?? [];
    const invalidos = pedidos.filter((a) => !esAlcance(a));
    if (invalidos.length)
      throw new BadRequestException(
        `Alcances desconocidos: ${invalidos.join(', ')}. Validos: ${ALCANCES.join(', ')}`,
      );

    const { llave, valor } = this.llaves.crear({
      organizacionId: actor.organizacionId,
      etiqueta,
      alcances: pedidos.filter(esAlcance),
      creadaPor: actor.id,
    });

    // ⚠️ La UNICA respuesta que trae `valor`. No se puede volver a ver: si se
    //    pierde, se rota. Guardarla para poder mostrarla otra vez seria
    //    guardar el secreto, que es justo lo que no se hace.
    return {
      llave: publica(llave),
      valor,
      aviso:
        'Guarda este valor ahora: no se puede volver a ver. Si se pierde, rota la llave.',
    };
  }

  @Post(':id/rotar')
  @HttpCode(200)
  rotar(@Actor() actor: ActorSesion, @Param('id') id: string) {
    const vieja = this.llaves.porId(id);
    // 404 y no 403 cuando es de otra organizacion: confirmar que existe le
    // diria a un administrador ajeno que esa llave es de alguien.
    if (!vieja || vieja.organizacionId !== actor.organizacionId)
      throw new NotFoundException('Llave no encontrada');

    const nueva = this.llaves.rotar(id, actor.id);
    if (!nueva) throw new BadRequestException('Esa llave ya estaba revocada');

    return {
      llave: publica(nueva.llave),
      valor: nueva.valor,
      aviso:
        'La llave anterior sigue funcionando 24 h para que migres sin cortar el servicio.',
    };
  }

  @Delete(':id')
  @HttpCode(200)
  revocar(@Actor() actor: ActorSesion, @Param('id') id: string) {
    const llave = this.llaves.porId(id);
    if (!llave || llave.organizacionId !== actor.organizacionId)
      throw new NotFoundException('Llave no encontrada');

    return { revocada: this.llaves.revocar(id) };
  }
}

/**
 * Lo que sale hacia el cliente. Lista blanca, como `despojar()` en
 * `estado.service.ts`: si alguien agrega un campo a `LlaveApi` tiene que
 * decidir a proposito si sale — y `hash` **nunca** sale.
 */
function publica(llave: {
  id: string;
  etiqueta: string;
  alcances: Alcance[];
  ultimos4: string;
  creadaEn: string;
  creadaPor: string;
  revocadaEn: string | null;
  expiraEn: number | null;
  ultimoUsoEn: string | null;
  ultimaIp: string | null;
  usos: number;
}) {
  return {
    id: llave.id,
    etiqueta: llave.etiqueta,
    alcances: llave.alcances,
    /** Para reconocerla en la tabla sin guardar el secreto. */
    muestra: `pulso_sk_…${llave.ultimos4}`,
    creadaEn: llave.creadaEn,
    creadaPor: llave.creadaPor,
    revocadaEn: llave.revocadaEn,
    expiraEn: llave.expiraEn ? new Date(llave.expiraEn).toISOString() : null,
    ultimoUsoEn: llave.ultimoUsoEn,
    ultimaIp: llave.ultimaIp,
    usos: llave.usos,
  };
}
