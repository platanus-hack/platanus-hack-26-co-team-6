/**
 * Rutas de afiliacion — tareas 2.1 y 2.9.
 *
 *   POST /afiliacion/verificar      publico   autoverificacion contra el REPS
 *   POST /afiliacion                publico   crea la organizacion y su admin
 *   GET  /afiliacion/:id/estado     sesion    en que va la afiliacion
 *   POST /afiliacion/:id/transicion admin_plataforma   aprobar/observar/suspender
 *
 * ═══════════════════════════════════════════════════════════════════
 *  POR QUE DOS RUTAS PUBLICAS, Y QUE SE PENSO ANTES DE ABRIRLAS
 * ═══════════════════════════════════════════════════════════════════
 *  `publico.decorator.ts` dice que cada `@Publico()` tiene que justificarse.
 *  Estas dos son la puerta de entrada de una organizacion que TODAVIA no
 *  tiene ningun actor: exigir sesion aqui es exigir una cuenta para poder
 *  crear la cuenta.
 *
 *  Que exponen a internet:
 *    · `verificar` → datos del REPS, que el Ministerio ya publica abiertos.
 *      No dice si esa sede esta afiliada a PULSO ni en que estado, a
 *      proposito: eso si seria informacion nuestra.
 *    · `crear` → nada. Solo escribe, y el resultado solo lo ve quien acaba
 *      de crear el admin.
 *
 *  Las otras dos exigen sesion, y la de transicion exige ademas ser
 *  `admin_plataforma`: aprobar una afiliacion mete una sede al ranking de
 *  urgencias de la ciudad.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import type {
  CrearAfiliacionRequest,
  CrearAfiliacionResponse,
  EstadoAfiliacionResponse,
  Organizacion,
  TransicionAfiliacionRequest,
  VerificarAfiliacionRequest,
  VerificarAfiliacionResponse,
} from '../contracts/types';
import { Publico } from '../auth/publico.decorator';
import { Rol } from '../auth/rol.decorator';
import { AfiliacionService } from './afiliacion.service';
import { LimiteIp } from './limite-ip';

/**
 * Sal de proceso para no guardar IPs en claro ni en memoria.
 *
 * Regla 5 del repo: sin PII en logs ni en URLs. Una IP es dato personal, y
 * el limitador solo necesita poder distinguir a dos clientes — no saber
 * quienes son. Aleatoria por arranque: nadie puede cruzar la tabla del
 * limitador con nada de afuera, ni siquiera nosotros.
 */
const SAL_CLIENTE = randomBytes(16);

@Controller('afiliacion')
export class AfiliacionController {
  constructor(
    private readonly afiliacion: AfiliacionService,
    private readonly limite: LimiteIp,
  ) {}

  @Publico()
  @Post('verificar')
  @HttpCode(200)
  async verificar(
    @Body() cuerpo: VerificarAfiliacionRequest,
    @Req() req: Request,
  ): Promise<VerificarAfiliacionResponse> {
    this.limite.exigir(this.cliente(req));
    return this.afiliacion.verificar(cuerpo);
  }

  @Publico()
  @Post()
  @HttpCode(201)
  async crear(
    @Body() cuerpo: CrearAfiliacionRequest,
    @Req() req: Request,
  ): Promise<CrearAfiliacionResponse> {
    this.limite.exigir(this.cliente(req));
    return this.afiliacion.crear(cuerpo);
  }

  /**
   * Exige sesion pero no rol: el afiliado que acaba de crear su cuenta tiene
   * que poder ver en que va lo suyo. Devuelve estado y observaciones, nada
   * mas — ni el NIT ni la lista de sedes de otra organizacion.
   */
  @Get(':id/estado')
  async estado(@Param('id') id: string): Promise<EstadoAfiliacionResponse> {
    const organizacion = await this.afiliacion.exigirOrganizacion(id);
    return {
      id: organizacion.id,
      estado: organizacion.estado,
      verificacion: organizacion.verificacion,
      observaciones: organizacion.observaciones ?? [],
      actualizadaEn: organizacion.actualizadaEn,
    };
  }

  /**
   * Aprobar, observar, activar o suspender. Solo `admin_plataforma`.
   *
   * Es el «afiliacion:aprobar» de la matriz de permisos (§5.2), y la unica
   * casilla que lo tiene marcada. Regla 6 del repo: ningun tramite se firma
   * solo — la transicion la pide una persona y queda registrada.
   */
  @Rol('admin_plataforma')
  @Post(':id/transicion')
  @HttpCode(200)
  async transicionar(
    @Param('id') id: string,
    @Body() cuerpo: TransicionAfiliacionRequest,
  ): Promise<{ organizacion: Organizacion }> {
    return {
      organizacion: await this.afiliacion.transicionar(
        id,
        cuerpo?.estado,
        cuerpo?.motivo,
      ),
    };
  }

  /**
   * A quien se le cuenta el golpe. Nunca la IP en claro.
   *
   * ⚠️ Usa `req.ip`, y detras de un proxy —Render, por ejemplo— eso es la IP
   *    del proxy: el limite pasa a ser global para el endpoint en vez de por
   *    cliente. Sigue conteniendo el costo, que es para lo que esta (ver
   *    `limite-ip.ts`), pero deja de distinguir.
   *
   *    Se hace asi y no leyendo `X-Forwarded-For` porque esa cabecera la
   *    escribe quien llama: confiar en ella convierte el limitador en
   *    decoracion, basta cambiar un numero por peticion. Para que sea por
   *    cliente de verdad hay que declarar el proxy en `main.ts`
   *    (`app.set('trust proxy', 1)`) y ahi `req.ip` ya es correcta —
   *    ese cambio toca el arranque y va con la tarea 5.3.
   */
  private cliente(req: Request): string {
    return createHash('sha256')
      .update(SAL_CLIENTE)
      .update(req.ip ?? req.socket?.remoteAddress ?? 'desconocido')
      .digest('base64url');
  }
}
