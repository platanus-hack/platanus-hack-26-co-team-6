/**
 * `/admin/modelos` — versiones de prompt clinico y de config de scoring.
 *
 *   GET  /admin/modelos                                 los dos, con historico
 *   GET  /admin/modelos/casos/:casoId                   ⭐ que version proceso ese caso
 *   GET  /admin/modelos/:modelo                         uno solo
 *   GET  /admin/modelos/:modelo/:codigo/casos?version=  que casos uso esa version
 *   GET  /admin/modelos/:modelo/:codigo/comparar?a=1&b=3  diff entre dos versiones
 *   POST /admin/modelos/:modelo                         crea la version 1
 *   POST /admin/modelos/:modelo/:codigo/versiones       crea la version N+1
 *   POST /admin/modelos/procesamiento                   anota caso ↔ version
 *
 * `casos/:casoId` va ANTES de `:modelo` por el orden de resolucion de Express.
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
import { ModelosService, type RegistrarProcesamiento } from './modelos.service';
import { MODELOS, esModelo, type Modelo } from './tipos';

@Controller('admin/modelos')
@UseGuards(AdminGuard)
export class ModelosController {
  constructor(
    private readonly modelos: ModelosService,
    private readonly catalogos: CatalogosService,
  ) {}

  @Get()
  async todos() {
    return {
      modelos: await this.modelos.listar(),
      persistencia: this.catalogos.estadoPersistencia(),
    };
  }

  /**
   * ⭐ Con que se proceso este caso.
   *
   * Devuelve la version TAL COMO ESTABA ESCRITA ese dia, mas cuantas versiones
   * salieron despues. Lo segundo es lo que convierte el dato en informacion:
   * "prompt v1, y hoy vamos por la v4" dice de inmediato que ese caso no es
   * comparable con los de esta semana.
   */
  @Get('casos/:casoId')
  async porCaso(@Param('casoId') casoId: string) {
    const procesamientos = await this.modelos.porCaso(casoId);
    return {
      casoId,
      procesamientos,
      // Callar el vacio seria dejar creer que el caso corrio sin modelo.
      sinRegistro: procesamientos.length === 0,
      nota:
        procesamientos.length === 0
          ? 'Este caso no tiene versiones anotadas. Hoy nadie anota automáticamente: ' +
            'el cableado desde el pipeline es la tarea 3.12.'
          : null,
    };
  }

  /**
   * Anota que un caso se proceso con una version. Idempotente: `nuevo: false`
   * significa que ese hecho ya estaba anotado, no que fallara.
   */
  @Post('procesamiento')
  async registrar(@Req() req: PeticionAdmin, @Body() cuerpo: RegistrarProcesamiento) {
    if (!esModelo(cuerpo?.coleccion)) {
      throw new BadRequestException(
        `coleccion debe ser una de: ${MODELOS.join(', ')}`,
      );
    }
    if (!cuerpo?.codigo) throw new BadRequestException('Falta codigo.');

    return this.modelos.registrarProcesamiento(cuerpo, firmante(req));
  }

  @Get(':modelo')
  async uno(@Param('modelo') modelo: string) {
    return this.modelos.vista(exigirModelo(modelo));
  }

  @Get(':modelo/:codigo/casos')
  async casos(
    @Param('modelo') modelo: string,
    @Param('codigo') codigo: string,
    @Query('version') version?: string,
  ) {
    const n = Number(version);
    return {
      casos: await this.modelos.casosDe(
        exigirModelo(modelo),
        codigo.toUpperCase(),
        Number.isFinite(n) && n > 0 ? n : undefined,
      ),
    };
  }

  @Get(':modelo/:codigo/comparar')
  async comparar(
    @Param('modelo') modelo: string,
    @Param('codigo') codigo: string,
    @Query('a') a?: string,
    @Query('b') b?: string,
  ) {
    const va = Number(a);
    const vb = Number(b);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) {
      throw new BadRequestException('Faltan las versiones a comparar (?a=1&b=2).');
    }
    return this.modelos.comparar(exigirModelo(modelo), codigo.toUpperCase(), va, vb);
  }

  @Post(':modelo')
  async crear(
    @Req() req: PeticionAdmin,
    @Param('modelo') modelo: string,
    @Body() cuerpo: EntradaNueva,
  ) {
    const entrada = await this.catalogos.crear(
      exigirModelo(modelo),
      cuerpo,
      firmante(req),
    );
    return { entrada, creada: true };
  }

  @Post(':modelo/:codigo/versiones')
  async nuevaVersion(
    @Req() req: PeticionAdmin,
    @Param('modelo') modelo: string,
    @Param('codigo') codigo: string,
    @Body() cuerpo: VersionNueva,
  ) {
    return this.catalogos.nuevaVersion(
      exigirModelo(modelo),
      codigo,
      cuerpo,
      firmante(req),
    );
  }
}

function exigirModelo(crudo: string): Modelo {
  if (!esModelo(crudo)) {
    throw new BadRequestException(
      `Modelo desconocido: ${crudo}. Conocidos: ${MODELOS.join(', ')}`,
    );
  }
  return crudo;
}

function firmante(req: PeticionAdmin): Firmante {
  const acceso = req.accesoAdmin;
  if (!acceso) {
    throw new BadRequestException('Sin actor: el guard de administración no corrió.');
  }
  return { actor: acceso.actor, via: acceso.via };
}
