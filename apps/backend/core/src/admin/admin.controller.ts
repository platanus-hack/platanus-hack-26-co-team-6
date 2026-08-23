/**
 * Superficie HTTP de la consola de plataforma.
 *
 *   GET  /admin/acceso    quien soy y si puedo — la UNICA ruta que no exige
 *                         ser admin, porque su trabajo es explicar por que no
 *                         se puede. Un 403 mudo deja a la consola sin nada que
 *                         contarle a quien la abre.
 *   GET  /admin/eventos   la auditoria append-only de todo cambio.
 *
 * Todo lo demas cuelga de `catalogos.controller.ts` y `modelos.controller.ts`.
 */

import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SesionService, tokenDeCabeceras } from '../auth/sesion.service';
import { AdminGuard, evaluar } from './admin.guard';
import { identidadReal, type CargaSesion } from './acceso-admin';
import { CatalogosService } from './catalogos.service';
import { esColeccion, type Coleccion } from './tipos';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly sesion: SesionService,
    private readonly catalogos: CatalogosService,
  ) {}

  /**
   * Estado de acceso del que llama, y en que modo corre la administracion.
   *
   * Devuelve 200 tambien cuando NIEGA. No es una laxitud: es la regla 2 del
   * repo ("todo degrada y lo dice") aplicada a la puerta. La consola necesita
   * distinguir tres situaciones que un 403 confunde en una sola:
   *   - core no tiene PULSO_ADMIN_TOKEN  → falta configurar el servidor
   *   - tu rol no es admin_plataforma    → no es tu consola
   *   - falta la credencial en el cliente → tienes que desbloquearla
   *
   * No filtra nada que un 403 no filtrara ya, y exige sesion: el guard global
   * cubre esta ruta como todas.
   */
  @Get('acceso')
  acceso(@Req() req: Request) {
    const acceso = evaluar(this.sesion, req);
    const carga = this.sesion.verificar(
      tokenDeCabeceras(req.headers),
    ) as CargaSesion | null;

    return {
      ...acceso,
      /** false = core todavia no emite roles. Es el estado de hoy (tarea 1.3). */
      identidadReal: identidadReal(carga),
      persistencia: this.catalogos.estadoPersistencia(),
      /**
       * Lo que esta consola NO puede hacer todavia, dicho en voz alta. Se pinta
       * como aviso permanente: un admin que cree que sus cambios rigen cuando
       * no rigen es peor que un admin sin consola.
       */
      degradacion: this.degradacion(acceso.permitido),
    };
  }

  private degradacion(permitido: boolean): string[] {
    const avisos: string[] = [];

    if (this.catalogos.estadoPersistencia() === 'memoria') {
      avisos.push(
        'Los catálogos viven en memoria: un reinicio de core borra las versiones que firmes. ' +
          'Falta aplicar supabase/migrations/0008 y conectar el almacén Postgres.',
      );
    }

    // Lo mas importante que decir, y lo mas facil de callar.
    avisos.push(
      'El motor todavía no lee de estos catálogos: el triage y el scoring usan sus constantes ' +
        'compiladas. Aquí se versiona y se audita la lógica clínica; cablearla al pipeline es ' +
        'trabajo de las tareas 0.5 y 3.12.',
    );

    avisos.push(
      'Nadie anota todavía con qué versión se procesó cada caso de forma automática. ' +
        'El registro existe y acepta anotaciones; el cableado desde triage llega con 3.12.',
    );

    if (!permitido) {
      avisos.push(
        'Mientras core no emita roles (tarea 1.3), esta consola se abre con la credencial ' +
          'de plataforma PULSO_ADMIN_TOKEN. No hay credencial por defecto.',
      );
    }

    return avisos;
  }

  /**
   * La auditoria. Append-only: no hay endpoint para editarla ni para borrarla,
   * y no lo va a haber. Una correccion es un evento nuevo (regla 4).
   */
  @Get('eventos')
  @UseGuards(AdminGuard)
  async eventos(
    @Query('coleccion') coleccion?: string,
    @Query('codigo') codigo?: string,
    @Query('limite') limite?: string,
  ) {
    const filtro: { coleccion?: Coleccion; codigo?: string; limite?: number } = {};
    if (esColeccion(coleccion)) filtro.coleccion = coleccion;
    if (codigo) filtro.codigo = codigo;
    const n = Number(limite);
    if (Number.isFinite(n) && n > 0) filtro.limite = Math.min(n, 500);

    return { eventos: await this.catalogos.eventos(filtro) };
  }
}
