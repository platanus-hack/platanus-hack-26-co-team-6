/**
 * `/admin/catalogos` — CRUD versionado de la logica clinica.
 *
 *   GET  /admin/catalogos                          los tres catalogos, vigentes
 *   GET  /admin/catalogos/servicios-reps           lista blanca de codigos REPS
 *   GET  /admin/catalogos/resolver-dx?dx=I21.1     §7.2: que decide la tabla
 *   GET  /admin/catalogos/:catalogo                vigentes de un catalogo
 *   GET  /admin/catalogos/:catalogo/:codigo        historial completo, con diffs
 *   POST /admin/catalogos/:catalogo                crea la version 1
 *   POST /admin/catalogos/:catalogo/:codigo/versiones   crea la version N+1
 *
 * No hay PUT, PATCH ni DELETE. No es una omision: no existe forma de modificar
 * ni de borrar una version. Regla 4 del repo, hecha superficie HTTP.
 *
 * ORDEN DE LAS RUTAS: las literales van ANTES que `:catalogo`. Express resuelve
 * por orden de declaracion y `servicios-reps` seria capturado como si fuera el
 * nombre de un catalogo.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, type PeticionAdmin } from './admin.guard';
import {
  CatalogosService,
  type EntradaNueva,
  type Firmante,
  type VersionNueva,
} from './catalogos.service';
import { CATALOGOS, esCatalogo, type Catalogo } from './tipos';

@Controller('admin/catalogos')
@UseGuards(AdminGuard)
export class CatalogosController {
  constructor(private readonly catalogos: CatalogosService) {}

  @Get()
  async todos() {
    const catalogos = await Promise.all(
      CATALOGOS.map(async (c) => ({
        catalogo: c,
        entradas: await this.catalogos.vigentes(c),
      })),
    );
    return { catalogos, persistencia: this.catalogos.estadoPersistencia() };
  }

  /** Los codigos que el selector del mapa Dx puede ofrecer. Nada mas. */
  @Get('servicios-reps')
  serviciosReps() {
    return { servicios: this.catalogos.serviciosReps() };
  }

  /**
   * Prueba de la tabla: se teclea un CIE-10 y se ve que exige, o se ve el
   * hueco. `dx` en la query no es PII — es un codigo de catalogo, no un
   * paciente; ningun identificador de caso ni de persona pasa por aqui.
   *
   * `propuesto` (opcional, coma-separado) simula lo que el LLM habria
   * propuesto, para ver el desacuerdo entre modelo y tabla sin correr un caso.
   */
  @Get('resolver-dx')
  async resolverDx(@Query('dx') dx?: string, @Query('propuesto') propuesto?: string) {
    const resolucion = await this.catalogos.resolver(dx);
    const numeros = (propuesto ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);

    return { resolucion, decision: await this.catalogos.decidir(dx, numeros) };
  }

  @Get(':catalogo')
  async vigentes(@Param('catalogo') catalogo: string) {
    return { entradas: await this.catalogos.vigentes(exigirCatalogo(catalogo)) };
  }

  /**
   * El historial de un codigo. Es la vista que demuestra la regla: el codigo
   * es el mismo en todas las filas, y la etiqueta de cada version sigue ahi
   * con la fecha en que dejo de regir.
   */
  @Get(':catalogo/:codigo')
  async historial(
    @Param('catalogo') catalogo: string,
    @Param('codigo') codigo: string,
  ) {
    return this.catalogos.historial(exigirCatalogo(catalogo), codigo.toUpperCase());
  }

  @Post(':catalogo')
  async crear(
    @Req() req: PeticionAdmin,
    @Param('catalogo') catalogo: string,
    @Body() cuerpo: EntradaNueva,
  ) {
    const entrada = await this.catalogos.crear(
      exigirCatalogo(catalogo),
      cuerpo,
      firmante(req),
    );
    return { entrada, creada: true };
  }

  /**
   * La version siguiente. Devuelve `creada: false` cuando el borrador era
   * identico a lo vigente — no es un error, es la idempotencia: el mismo POST
   * dos veces deja una sola version.
   */
  @Post(':catalogo/:codigo/versiones')
  async nuevaVersion(
    @Req() req: PeticionAdmin,
    @Param('catalogo') catalogo: string,
    @Param('codigo') codigo: string,
    @Body() cuerpo: VersionNueva,
  ) {
    return this.catalogos.nuevaVersion(
      exigirCatalogo(catalogo),
      codigo,
      cuerpo,
      firmante(req),
    );
  }
}

function exigirCatalogo(crudo: string): Catalogo {
  if (!esCatalogo(crudo)) {
    throw new BadRequestException(
      `Catálogo desconocido: ${crudo}. Conocidos: ${CATALOGOS.join(', ')}`,
    );
  }
  return crudo;
}

/**
 * Quien firma. Sale de lo que dejo el guard, nunca del cuerpo de la peticion:
 * un actor que se declara a si mismo en un JSON no es una firma, es un campo
 * de texto. Regla 6 del repo — nada con consecuencia clinica ocurre sin
 * confirmacion humana REGISTRADA.
 */
function firmante(req: PeticionAdmin): Firmante {
  const acceso = req.accesoAdmin;
  if (!acceso) {
    // Inalcanzable con el guard puesto. Se lanza igual: si alguien quita el
    // decorador, esto revienta en vez de escribir eventos sin actor.
    throw new BadRequestException('Sin actor: el guard de administración no corrió.');
  }
  return { actor: acceso.actor, via: acceso.via };
}
