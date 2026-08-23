/**
 * GET  /casos/:id/eventos — la linea de tiempo de un caso (3.1)
 * POST /casos/:id/eventos — los eventos que emite un cliente (3.2)
 *
 * ⚠️ ALCANCE: hoy exige sesion (el guard global) pero **no filtra por
 *    organizacion**, porque `caso` todavia no tiene dueño — eso llega con
 *    1.2 (Neid) y las policies de 1.6. Cuando existan, aqui va el filtro por
 *    `caso_acceso` (§10.3) y este aviso se borra.
 *
 *    Mientras tanto no expongan esta ruta fuera del equipo: devuelve la linea
 *    de tiempo de cualquier caso a cualquier sesion valida.
 */

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import type { ActorSesion } from '../auth/carga';
import { Actor } from '../auth/rol.decorator';
import { RegistroService } from './registro.service';
import type { EventoCaso, TipoEvento } from './tipos';

/**
 * Lo que un CLIENTE puede emitir. Todo lo demas lo escribe el servidor desde
 * su transicion real — tarea 3.2.
 *
 * La lista es corta a proposito. Un `POST` abierto a los 22 tipos dejaria que
 * una consola escribiera `aceptado` sin que nadie haya aceptado nada, y el
 * registro de auditoria valdria exactamente lo que vale un campo de texto.
 * Estos son los que **solo** un humano sabe:
 */
const EMITIBLES: readonly TipoEvento[] = [
  /** ⭐ El regulador salta una regla dura. Vivia en `localStorage`. */
  'override_crue',
  'llegada_escena',
  'salida_escena',
  'llegada_puerta',
  'entrega',
  'demora_reportada',
  'cerrado',
];

/** §5.2: el override es del regulador. `admin_plataforma` porque administra el CRUE. */
const PUEDEN_OVERRIDE = ['regulador_crue', 'admin_plataforma'] as const;

interface CrearEventoRequest {
  tipo?: string;
  detalle?: Record<string, unknown>;
  codigoSede?: string;
  movilId?: string;
  claveIdempotencia?: string;
  corrigeA?: number;
}

@Controller('casos')
export class EventosController {
  constructor(private readonly registro: RegistroService) {}

  @Get(':id/eventos')
  async deCaso(@Param('id') id: string): Promise<{ eventos: EventoCaso[] }> {
    return { eventos: await this.registro.deCaso(id) };
  }

  /**
   * El evento queda **atribuido al actor de la sesion**, no a lo que diga el
   * cuerpo. Si el cliente pudiera mandar el `actorId`, la firma de quien
   * decidio seria un campo editable — que es justo lo contrario de una
   * auditoria.
   */
  @Post(':id/eventos')
  @HttpCode(201)
  async crear(
    @Param('id') casoId: string,
    @Body() cuerpo: CrearEventoRequest,
    @Actor() actor: ActorSesion,
  ): Promise<{ evento: EventoCaso | null }> {
    const tipo = cuerpo?.tipo;
    if (!tipo || !EMITIBLES.includes(tipo as TipoEvento))
      throw new BadRequestException(
        `tipo debe ser uno de: ${EMITIBLES.join(', ')}. ` +
          'El resto los escribe el servidor desde su transicion real.',
      );

    if (tipo === 'override_crue') {
      // El override del CRUE sin justificacion no es un override: es un salto
      // de regla sin firma. Invariante 2 de §5.3.
      if (!textoDe(cuerpo.detalle?.justificacion))
        throw new BadRequestException(
          'Un override exige justificacion: es lo que lo separa de saltarse una regla',
        );

      // Y lo hace quien tiene la potestad de hacerlo. La ley se la atribuye al
      // regulador; un jefe de urgencias saltandose el filtro duro "porque
      // igual va a llegar" es exactamente lo que esto tiene que impedir.
      //
      // Va aqui y no con `@Rol()` porque la ruta admite siete tipos y solo
      // este exige el rol. Cuando 3.11 (Juan) le de ruta propia a
      // `/casos/:id/override`, ahi el decorador es mas limpio y esto sobra.
      if (!PUEDEN_OVERRIDE.some((rol) => actor?.roles.includes(rol)))
        throw new ForbiddenException(
          'Solo un regulador del CRUE puede saltar una regla dura',
        );
    }

    return {
      evento: await this.registro.registrar({
        casoId,
        tipo: tipo as TipoEvento,
        actorId: actor?.id ?? null,
        codigoSede: cuerpo.codigoSede ?? null,
        movilId: cuerpo.movilId ?? null,
        detalle: cuerpo.detalle ?? {},
        claveIdempotencia: cuerpo.claveIdempotencia ?? null,
        corrigeA: cuerpo.corrigeA ?? null,
      }),
    };
  }
}

const textoDe = (valor: unknown): string =>
  typeof valor === 'string' ? valor.trim() : '';
