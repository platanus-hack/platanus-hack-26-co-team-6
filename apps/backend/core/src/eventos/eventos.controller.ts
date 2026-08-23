/**
 * GET /casos/:id/eventos — la línea de tiempo operativa de un caso
 * GET /eventos            — los últimos eventos de todos los casos
 *
 * Es la lectura de CONSOLA, no la forense. La diferencia importa y no es
 * cosmética:
 *
 *   · `/auditoria/casos/:id` es un acceso al expediente: trae la evidencia
 *     del ruteo, redacta por rol, exige `auditor`/`regulador_crue`/
 *     `admin_organizacion` y **deja registrado quién miró**.
 *   · esto es lo que la consola del CRUE ya pintaba desde `localStorage`.
 *     No registra acceso, porque si lo hiciera cada tick de polling del
 *     tablero metería un evento en la línea de tiempo y el expediente se
 *     ahogaría en sus propias lecturas.
 *
 * Alcance: mientras `caso.organizacion_id` no exista (1.x/2.x), se filtra por
 * la organización del actor y se dejan pasar los eventos sin organización —
 * que hoy son todos. Es lo mismo que ya ve cualquier consola en `GET /estado`.
 * El alcance DURO, el que se prueba, está en la vista forense.
 */

import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ActorService, type SolicitudConSesion } from './actor.service';
import type { EventoCaso } from './evento.tipos';
import { RegistroService } from './registro.service';

interface RespuestaEventos {
  eventos: EventoCaso[];
  /** Dónde vive el registro. La UI lo dice en pantalla. */
  modo: 'memoria' | 'postgres';
}

@Controller('casos')
export class EventosDeCasoController {
  constructor(
    private readonly registro: RegistroService,
    private readonly actores: ActorService,
  ) {}

  @Get(':id/eventos')
  async deCaso(
    @Param('id') casoId: string,
    @Req() req: SolicitudConSesion,
  ): Promise<RespuestaEventos> {
    const actor = this.actores.deSolicitud(req);
    const eventos = await this.registro.listar(casoId);
    return { eventos: enAlcance(eventos, actor.organizacionId), modo: this.registro.modo() };
  }
}

@Controller('eventos')
export class EventosController {
  constructor(
    private readonly registro: RegistroService,
    private readonly actores: ActorService,
  ) {}

  @Get()
  async recientes(
    @Query('limite') limite: string | undefined,
    @Req() req: SolicitudConSesion,
  ): Promise<RespuestaEventos> {
    const actor = this.actores.deSolicitud(req);
    const pedido = Number.parseInt(limite ?? '', 10);
    // Tope duro: una consola con un bug de polling no se lleva la tabla entera.
    const cuantos = Number.isFinite(pedido)
      ? Math.min(Math.max(pedido, 1), 500)
      : 200;
    const eventos = await this.registro.recientes(cuantos);
    return { eventos: enAlcance(eventos, actor.organizacionId), modo: this.registro.modo() };
  }
}

function enAlcance(
  eventos: EventoCaso[],
  organizacionId: string | null,
): EventoCaso[] {
  if (!organizacionId) return eventos;
  return eventos.filter(
    (e) => e.organizacionId === null || e.organizacionId === organizacionId,
  );
}
