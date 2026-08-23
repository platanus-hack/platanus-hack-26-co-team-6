/**
 * `/admin/modelos` — versiones de prompt clinico y de configuracion de scoring,
 * con su historico y **con que casos se procesaron con cada una**.
 *
 * ── LA PREGUNTA QUE ESTE SERVICIO EXISTE PARA RESPONDER ───────────
 *
 *   "¿Con que version de prompt se leyo el dictado de este caso de hace una
 *    semana?"
 *
 * Sin esa respuesta, comparar la tasa de aceptacion de marzo con la de abril
 * compara dos motores distintos creyendo que compara dos redes hospitalarias.
 * El dataset de aceptacion/rechazo es el activo del producto, y un dataset sin
 * la variable "con que se genero" no es evidencia: es una anecdota larga.
 *
 * La version de un artefacto se maneja con la MISMA maquina que los catalogos
 * (`versionado.ts`): codigo inmutable, etiqueta editable, cada cambio una fila
 * nueva. Un prompt es logica clinica tanto como un motivo de rechazo.
 *
 * ── LO QUE ESTE SERVICIO NO HACE, Y HAY QUE DECIRLO ───────────────
 * No anota nada solo. El registro caso↔version lo tiene que escribir quien
 * procesa el caso, y eso vive en `triage/` y en `routing/` — fuera del dominio
 * de esta tarea. Aqui queda la costura: el metodo, el endpoint, el esquema y
 * los tests. Ver la nota de dependencias del reporte de 5.11 (3.12 de Neid).
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ALMACEN_ADMIN, type AlmacenAdmin } from './almacen-admin';
import {
  MODELOS,
  identidadVersion,
  type Diferencia,
  type Modelo,
  type RegistroProcesamiento,
  type VersionEntrada,
} from './tipos';
import { compararVersiones, historialDe, vigente, vigentesPorCodigo } from './versionado';
import type { Firmante } from './catalogos.service';

export interface VistaModelo {
  coleccion: Modelo;
  vigentes: VersionEntrada[];
  /** Todas las versiones de todos los codigos, de la mas nueva a la mas vieja. */
  historial: VersionEntrada[];
}

export interface ProcesamientoDeCaso {
  registro: RegistroProcesamiento;
  /** La version tal como estaba escrita ese dia. null si la fila desaparecio. */
  version: VersionEntrada | null;
  /** Cuantas versiones han salido despues. 0 = sigue siendo la vigente. */
  versionesPosteriores: number;
}

export interface RegistrarProcesamiento {
  casoId: string;
  coleccion: Modelo;
  codigo: string;
  /** Omitida = la vigente al momento de registrar. */
  version?: number;
  /**
   * Cuando se proceso de verdad. Lo manda el pipeline porque el instante que
   * importa es el del procesamiento, no el de la anotacion — pueden diferir si
   * el registro se encola. Omitido = ahora.
   */
  procesadoEn?: string;
}

@Injectable()
export class ModelosService {
  private readonly log = new Logger(ModelosService.name);

  constructor(@Inject(ALMACEN_ADMIN) private readonly almacen: AlmacenAdmin) {}

  // ── Lectura ──────────────────────────────────────────────────

  async listar(): Promise<VistaModelo[]> {
    return Promise.all(MODELOS.map((c) => this.vista(c)));
  }

  async vista(coleccion: Modelo): Promise<VistaModelo> {
    const filas = await this.almacen.filas(coleccion);
    return {
      coleccion,
      vigentes: vigentesPorCodigo(filas),
      historial: [...filas].sort(
        (a, b) => b.creadoEn.localeCompare(a.creadoEn) || b.version - a.version,
      ),
    };
  }

  /** Diff entre dos versiones cualesquiera de un mismo codigo. */
  async comparar(
    coleccion: Modelo,
    codigo: string,
    a: number,
    b: number,
  ): Promise<{ a: VersionEntrada; b: VersionEntrada; cambios: Diferencia[] }> {
    const historial = historialDe(await this.almacen.filas(coleccion), codigo);
    const izq = historial.find((v) => v.version === a);
    const der = historial.find((v) => v.version === b);
    if (!izq || !der) {
      throw new NotFoundException(
        `No existe ${codigo}@${!izq ? a : b} en ${coleccion}`,
      );
    }
    return { a: izq, b: der, cambios: compararVersiones(izq, der) };
  }

  // ── El registro caso ↔ version ───────────────────────────────

  /**
   * Anota que un caso se proceso con una version. APPEND-ONLY e IDEMPOTENTE:
   * anotar dos veces el mismo hecho devuelve la primera anotacion.
   *
   * Se permite `procesadoEn` en el pasado a proposito (el pipeline puede
   * encolar el registro), y por eso mismo el evento de auditoria guarda su
   * propio `ocurridoEn`: la fecha del hecho y la fecha en que se supo son dos
   * datos distintos y confundirlos es como se falsifica un historico.
   */
  async registrarProcesamiento(
    peticion: RegistrarProcesamiento,
    firmante: Firmante,
  ): Promise<{ registro: RegistroProcesamiento; nuevo: boolean }> {
    const casoId = (peticion?.casoId ?? '').trim();
    if (!casoId) throw new BadRequestException('Falta casoId.');

    const filas = await this.almacen.filas(peticion.coleccion);
    const historial = historialDe(filas, peticion.codigo);
    if (historial.length === 0) {
      throw new NotFoundException(
        `No existe ${peticion.codigo} en ${peticion.coleccion}`,
      );
    }

    const version = peticion.version ?? vigente(historial)!.version;
    if (!historial.some((v) => v.version === version)) {
      throw new BadRequestException(
        `${peticion.codigo} no tiene versión ${version}. ` +
          'No se anota un procesamiento contra una versión que nunca existió.',
      );
    }

    const procesadoEn = normalizarFecha(peticion.procesadoEn);

    const antes = await this.almacen.procesamientos({
      casoId,
      coleccion: peticion.coleccion,
      codigo: peticion.codigo,
      version,
    });

    const registro = await this.almacen.registrarProcesamiento({
      id: randomUUID(),
      casoId,
      coleccion: peticion.coleccion,
      codigo: peticion.codigo,
      version,
      procesadoEn,
    });

    const nuevo = antes.length === 0;
    if (nuevo) {
      await this.almacen.registrarEvento({
        id: randomUUID(),
        ocurridoEn: new Date().toISOString(),
        actor: firmante.actor,
        via: firmante.via,
        accion: 'procesamiento.registrado',
        coleccion: peticion.coleccion,
        codigo: peticion.codigo,
        version,
        // Sin PII: el id del caso no identifica a nadie por si solo, y ni el
        // dictado ni el origen del paciente pasan por este modulo.
        motivo: `caso ${casoId}`,
        cambios: [],
      });
      this.log.log(
        `procesamiento · caso ${casoId} · ${peticion.coleccion}/${identidadVersion({
          codigo: peticion.codigo,
          version,
        })}`,
      );
    }

    return { registro, nuevo };
  }

  /**
   * ⭐ "¿Que version proceso este caso?" — con la version tal como estaba
   * escrita ese dia, no como esta hoy. Es la diferencia entre auditar y
   * suponer.
   */
  async porCaso(casoId: string): Promise<ProcesamientoDeCaso[]> {
    const registros = await this.almacen.procesamientos({ casoId });

    return Promise.all(
      registros.map(async (registro) => {
        const historial = historialDe(
          await this.almacen.filas(registro.coleccion),
          registro.codigo,
        );
        return {
          registro,
          version: historial.find((v) => v.version === registro.version) ?? null,
          versionesPosteriores: historial.filter((v) => v.version > registro.version)
            .length,
        };
      }),
    );
  }

  /** La vuelta: que casos se procesaron con una version. */
  async casosDe(
    coleccion: Modelo,
    codigo: string,
    version?: number,
  ): Promise<RegistroProcesamiento[]> {
    return this.almacen.procesamientos({ coleccion, codigo, version });
  }
}

/**
 * Una fecha que no se entiende no se convierte en `Invalid Date` silencioso:
 * se rechaza. Un timestamp corrupto en el registro de procesamiento es una
 * respuesta equivocada a la pregunta que este servicio existe para responder.
 */
function normalizarFecha(crudo: string | undefined): string {
  if (!crudo) return new Date().toISOString();
  const fecha = new Date(crudo);
  if (Number.isNaN(fecha.getTime())) {
    throw new BadRequestException(`procesadoEn no es una fecha ISO válida: ${crudo}`);
  }
  return fecha.toISOString();
}
