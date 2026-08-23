/**
 * La superficie HTTP de la afiliación.
 *
 *   POST /afiliacion/verificar        público   autoverificación contra el REPS
 *   POST /afiliacion                  público   crea organización + admin
 *   GET  /afiliacion                  sesión    la cola de `admin_plataforma`
 *   GET  /afiliacion/:id              sesión    la organización
 *   GET  /afiliacion/:id/estado       sesión    estado + qué falta + a dónde puede ir
 *   GET  /afiliacion/:id/eventos      sesión    la auditoría, append-only
 *   POST /afiliacion/:id/transicion   sesión    la máquina de estados
 *
 * Solo traduce HTTP ↔ dominio; la lógica vive en `AfiliacionService`.
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Publico } from '../auth/publico.decorator';
import { PulsoError } from '../common/pulso-error.filter';
import { AfiliacionService } from './afiliacion.service';
import { ESTADOS_AFILIACION } from './estados';
import { LimiteTasa } from './limite-tasa';
import type {
  CrearAfiliacionRequest,
  CrearAfiliacionResponse,
  EstadoAfiliacion,
  EstadoAfiliacionResponse,
  EventoAfiliacion,
  Organizacion,
  TransicionRequest,
  VerificacionAfiliacion,
  VerificarAfiliacionRequest,
} from './tipos';

/**
 * Los dos cupos, por IP.
 *
 * Verificar es barato y se llama en vivo mientras el afiliado escribe: 20 por
 * minuto deja escribir cómodo y corta un bucle de enumeración en seco. Crear
 * es caro y una empresa se afilia una vez: 5 por hora es holgadísimo para un
 * humano con dedos torpes y ridículo para un script.
 *
 * Los límites son por PROCESO. Con dos instancias el techo real es el doble.
 * Ver la cabecera de `limite-tasa.ts`.
 */
export const MAXIMO_VERIFICAR_POR_MINUTO = 20;
export const MAXIMO_CREAR_POR_HORA = 5;

export const CUPO_VERIFICAR = new LimiteTasa({
  maximo: MAXIMO_VERIFICAR_POR_MINUTO,
  ventanaMs: 60_000,
});
export const CUPO_CREAR = new LimiteTasa({
  maximo: MAXIMO_CREAR_POR_HORA,
  ventanaMs: 60 * 60_000,
});

@Controller('afiliacion')
export class AfiliacionController {
  constructor(private readonly afiliacion: AfiliacionService) {}

  /**
   * @Publico() — uno de los pocos de core. Esto es lo que expone a internet:
   *
   *   Entra: un código de habilitación de sede (12 dígitos), un NIT y una
   *          razón social. Los tres son dato público del REPS y de la Cámara
   *          de Comercio; ninguno es PII de un paciente.
   *   Sale:  si esa sede existe en el catálogo REPS y, si existe, su
   *          dirección, coordenadas, complejidad, servicios y camas —
   *          exactamente lo que el REPS publica abierto.
   *
   * Tiene que ser público porque quien lo llama TODAVÍA NO TIENE cuenta: es
   * la pantalla 2 de la afiliación, antes de que exista actor alguno. Lo que
   * no puede es ser gratis a escala: `CUPO_VERIFICAR` está unas líneas arriba
   * justamente porque esto es un enumerador del REPS con buena UX.
   */
  @Publico()
  @Post('verificar')
  @HttpCode(200)
  async verificar(
    @Body() cuerpo: VerificarAfiliacionRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<VerificacionAfiliacion> {
    this.exigirCupo(CUPO_VERIFICAR, req, res);
    return this.afiliacion.verificar(cuerpo);
  }

  /**
   * @Publico() — el segundo de este módulo. Lo que expone a internet:
   *
   *   Entra: los datos de una organización que quiere afiliarse y el nombre y
   *          correo de su primer administrador.
   *   Sale:  la organización creada en `borrador` y su actor SIN correo ni
   *          teléfono (ver `despojarActor`). **No sale una sesión**: emitir un
   *          token desde aquí le daría a cualquiera que llene el formulario
   *          acceso a las consolas. El login es la tarea 1.3.
   *
   * Tiene que ser público por lo mismo: es el endpoint que crea la primera
   * cuenta de una organización, así que no puede exigir una.
   *
   * Nada queda `activa`: lo más lejos que llega sola es `aprobada`. Activar es
   * un acto humano — regla 6 de AGENTS.md.
   */
  @Publico()
  @Post()
  @HttpCode(201)
  async crear(
    @Body() cuerpo: CrearAfiliacionRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CrearAfiliacionResponse> {
    this.exigirCupo(CUPO_CREAR, req, res);
    return this.afiliacion.crear(cuerpo);
  }

  /** La cola de afiliaciones. `?estado=en_verificacion` para la de revisión. */
  @Get()
  listar(@Query('estado') estado?: string): { organizaciones: Organizacion[] } {
    return {
      organizaciones: this.afiliacion.listar(this.exigirEstado(estado, true)),
    };
  }

  @Get(':id')
  obtener(@Param('id') id: string): { organizacion: Organizacion } {
    return { organizacion: this.afiliacion.obtener(id) };
  }

  @Get(':id/estado')
  estado(@Param('id') id: string): EstadoAfiliacionResponse {
    return this.afiliacion.estado(id);
  }

  /** La auditoría. Solo GET: es append-only y nadie la edita (regla 4). */
  @Get(':id/eventos')
  eventos(@Param('id') id: string): { eventos: EventoAfiliacion[] } {
    return { eventos: this.afiliacion.eventos(id) };
  }

  @Post(':id/transicion')
  @HttpCode(200)
  transicionar(
    @Param('id') id: string,
    @Body() cuerpo: TransicionRequest,
    @Req() req: Request,
  ): { organizacion: Organizacion } {
    const hacia = this.exigirEstado(cuerpo?.a, false)!;

    // Quién movió la afiliación queda en el evento. Hoy `operador` es el
    // sujeto genérico de la sesión de turno; cuando 1.3 traiga actores reales,
    // aquí empieza a caer un id de actor sin tocar nada más.
    const por = (req as Request & { operador?: string }).operador ?? 'operador';

    return {
      organizacion: this.afiliacion.transicionar(
        id,
        hacia,
        por,
        cuerpo?.motivo,
      ),
    };
  }

  // ── Internos ───────────────────────────────────────────────────

  /**
   * Un estado inventado no puede llegar hasta la máquina: allá dentro sería
   * "transición ilegal", que es un mensaje falso — el problema no es el salto,
   * es que ese estado no existe.
   */
  private exigirEstado(
    valor: string | undefined,
    opcional: boolean,
  ): EstadoAfiliacion | undefined {
    if (!valor) {
      if (opcional) return undefined;
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        `Falta el estado destino. Debe ser uno de: ${ESTADOS_AFILIACION.join(', ')}.`,
      );
    }
    if (!ESTADOS_AFILIACION.includes(valor as EstadoAfiliacion)) {
      throw new PulsoError(
        'PULSO_INVALID_INPUT',
        `"${valor}" no es un estado de afiliación. Debe ser uno de: ` +
          `${ESTADOS_AFILIACION.join(', ')}.`,
      );
    }
    return valor as EstadoAfiliacion;
  }

  /**
   * 429 con `Retry-After`.
   *
   * ⚠️ El sobre saldrá con `code: PULSO_INVALID_INPUT`: `PulsoErrorFilter`
   *    mapea así toda `HttpException` por debajo de 500 y `PulsoCode` no tiene
   *    todavía un código de límite de tasa. `contracts/types.ts` tiene dueño
   *    por ola y no se cambia en silencio (regla 1), así que el dato accionable
   *    viaja donde sí es estándar: el status 429 y la cabecera `Retry-After`.
   *
   * La IP se usa como clave y no se loguea ni se devuelve (regla 5).
   */
  private exigirCupo(limite: LimiteTasa, req: Request, res: Response): void {
    const veredicto = limite.intentar(ipDe(req));
    if (veredicto.permitido) return;

    res.setHeader('Retry-After', String(veredicto.reintentarEnS));
    throw new HttpException(
      `Demasiadas solicitudes. Reintenta en ${veredicto.reintentarEnS} s.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * La IP del cliente.
 *
 * Detrás de un proxy, `req.ip` es la del proxy salvo que express tenga
 * `trust proxy`. No se lee `X-Forwarded-For` a mano: sin proxy de confianza
 * delante, esa cabecera la escribe el atacante y el límite se evade poniendo
 * una IP distinta en cada petición. Preferimos limitar de más.
 */
function ipDe(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'desconocida';
}
