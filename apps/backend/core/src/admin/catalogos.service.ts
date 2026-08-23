/**
 * CRUD versionado de los catalogos clinicos. El "U" de CRUD no existe aqui:
 * actualizar es insertar una version, y borrar es insertar una version
 * retirada. Regla 4 del repo.
 *
 * Todo cambio escribe evento antes de devolver. No hay camino de escritura sin
 * auditoria: si algun dia alguien agrega uno, que sea a proposito y no por
 * copiar un metodo que no la escribia.
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { NOMBRE_SERVICIO } from '../catalogo/servicios-reps';
import {
  ALMACEN_ADMIN,
  type AlmacenAdmin,
  type EstadoPersistencia,
} from './almacen-admin';
import {
  ESQUEMA_DATOS,
  type AccionAdmin,
  type Catalogo,
  type Coleccion,
  type Diferencia,
  type EventoAdmin,
  type VersionEntrada,
} from './tipos';
import {
  codigoValido,
  compararVersiones,
  historialDe,
  normalizarCodigo,
  primeraVersion,
  proponerVersion,
  vigente,
  vigentesActivos,
  vigentesPorCodigo,
} from './versionado';
import { decidirServicios, resolverDx, type ResolucionDx } from './mapa-dx';

/** Quien firma el cambio. Lo arma el controlador con lo que dejo el guard. */
export interface Firmante {
  actor: string;
  via: string;
}

export interface EntradaNueva {
  codigo: string;
  etiqueta: string;
  datos: Record<string, unknown>;
  motivo?: string | null;
}

export interface VersionNueva {
  etiqueta: string;
  datos: Record<string, unknown>;
  activo?: boolean;
  motivo?: string | null;
  /**
   * Opcional. Si viene y no coincide con el de la ruta, es un 400: el codigo
   * es inmutable y un cliente que cree poder cambiarlo tiene que enterarse.
   */
  codigo?: string;
}

export interface VistaCodigo {
  codigo: string;
  vigente: VersionEntrada;
  versiones: VersionEntrada[];
  /** Cambios de cada version respecto de la anterior. Alineado con `versiones`. */
  cambios: Diferencia[][];
}

/** Los codigos REPS que este core sabe nombrar. Lista blanca: no se inventan. */
const REPS_CONOCIDOS = new Set(Object.keys(NOMBRE_SERVICIO).map(Number));

@Injectable()
export class CatalogosService {
  private readonly log = new Logger(CatalogosService.name);

  constructor(@Inject(ALMACEN_ADMIN) private readonly almacen: AlmacenAdmin) {}

  estadoPersistencia(): EstadoPersistencia {
    return this.almacen.estadoPersistencia();
  }

  /** Los codigos REPS validos, para el selector de la consola. */
  serviciosReps(): { codigo: number; nombre: string }[] {
    return [...REPS_CONOCIDOS]
      .sort((a, b) => a - b)
      .map((codigo) => ({ codigo, nombre: NOMBRE_SERVICIO[codigo] }));
  }

  // ── Lectura ──────────────────────────────────────────────────

  /** Version vigente de cada codigo de un catalogo, retiradas incluidas. */
  async vigentes(coleccion: Coleccion): Promise<VersionEntrada[]> {
    return vigentesPorCodigo(await this.almacen.filas(coleccion));
  }

  /** Lo que la operacion puede usar hoy: vigente y no retirado. */
  async activos(coleccion: Coleccion): Promise<VersionEntrada[]> {
    return vigentesActivos(await this.almacen.filas(coleccion));
  }

  /**
   * El historial completo de un codigo, con el diff de cada salto.
   *
   * Es la vista que prueba que editar una etiqueta no rompe nada: el codigo es
   * el mismo en todas las filas y la etiqueta vieja sigue ahi, con la fecha en
   * que dejo de regir.
   */
  async historial(coleccion: Coleccion, codigo: string): Promise<VistaCodigo> {
    const versiones = historialDe(await this.almacen.filas(coleccion), codigo);
    const ultima = vigente(versiones);
    if (!ultima) {
      throw new NotFoundException(`No existe ${codigo} en ${coleccion}`);
    }

    const cambios = versiones.map((v, i) =>
      i === 0 ? [] : compararVersiones(versiones[i - 1], v),
    );

    return { codigo, vigente: ultima, versiones, cambios };
  }

  // ── Escritura ────────────────────────────────────────────────

  /**
   * Crea la version 1 de un codigo nuevo.
   *
   * Idempotente por codigo: si ya existe, 409 disfrazado de 400 con el mensaje
   * que importa — "ese codigo ya existe, lo que quieres es una version nueva".
   * Dejar que `POST` sobre un codigo existente creara una version seria la
   * forma mas facil de cambiar una etiqueta sin motivo.
   */
  async crear(
    coleccion: Coleccion,
    cuerpo: EntradaNueva,
    firmante: Firmante,
  ): Promise<VersionEntrada> {
    const codigo = normalizarCodigo(cuerpo?.codigo ?? '');
    if (!codigoValido(codigo)) {
      throw new BadRequestException(
        'Código inválido. Mayúsculas, dígitos, guion bajo, punto o guion; ' +
          'entre 2 y 64 caracteres. Es inmutable: no se puede corregir después.',
      );
    }

    const filas = await this.almacen.filas(coleccion);
    if (filas.some((f) => f.codigo === codigo)) {
      throw new BadRequestException(
        `El código ${codigo} ya existe en ${coleccion}. Para cambiarlo, crea una versión nueva.`,
      );
    }

    const etiqueta = exigirEtiqueta(cuerpo?.etiqueta);
    const datos = await this.validarDatos(coleccion, cuerpo?.datos ?? {});

    const entrada = primeraVersion(
      coleccion,
      codigo,
      { etiqueta, datos, motivo: cuerpo?.motivo ?? null },
      { id: randomUUID(), actor: firmante.actor, ahora: new Date().toISOString() },
    );

    const guardada = await this.almacen.insertar(entrada);
    await this.evento(firmante, 'entrada.creada', guardada, []);
    return guardada;
  }

  /**
   * Crea la version siguiente de un codigo que ya existe.
   *
   * ⭐ EL CORAZON DE LA TAREA. Editar la etiqueta entra por aqui y sale como
   * una fila nueva: el codigo no se toca, la version sube, y la etiqueta vieja
   * se queda en el historico con la fecha hasta la que rigio. Por eso "editar
   * una etiqueta no rompe el historico".
   */
  async nuevaVersion(
    coleccion: Coleccion,
    codigoRuta: string,
    cuerpo: VersionNueva,
    firmante: Firmante,
  ): Promise<{ entrada: VersionEntrada; creada: boolean; cambios: Diferencia[] }> {
    const codigo = normalizarCodigo(codigoRuta);

    // El codigo es inmutable. Si el cuerpo trae uno distinto, no se ignora en
    // silencio: quien lo mando cree que puede renombrar, y tiene que enterarse
    // de que no antes de construir una UI encima de esa creencia.
    if (cuerpo?.codigo !== undefined && normalizarCodigo(cuerpo.codigo) !== codigo) {
      throw new BadRequestException(
        `El código es inmutable: ${codigo} no se puede renombrar a ${normalizarCodigo(cuerpo.codigo)}. ` +
          'Es la clave con la que se compara el histórico. Crea otra entrada si necesitas otro código.',
      );
    }

    const filas = await this.almacen.filas(coleccion);
    const historial = historialDe(filas, codigo);
    if (historial.length === 0) {
      throw new NotFoundException(`No existe ${codigo} en ${coleccion}`);
    }

    const etiqueta = exigirEtiqueta(cuerpo?.etiqueta);
    const datos = await this.validarDatos(coleccion, cuerpo?.datos ?? {});

    const propuesta = proponerVersion(
      historial,
      {
        etiqueta,
        datos,
        activo: cuerpo?.activo ?? vigente(historial)!.activo,
        motivo: cuerpo?.motivo ?? null,
      },
      { id: randomUUID(), actor: firmante.actor, ahora: new Date().toISOString() },
    );

    if (propuesta.estado === 'falta-motivo') {
      throw new BadRequestException(
        'Falta el motivo. Una versión sin motivo es una fila que dentro de seis meses ' +
          'nadie sabrá explicar, y explicar por qué cambió la lógica clínica es la mitad ' +
          'del punto de versionarla.',
      );
    }

    // Sin cambios no hay version. Es lo que hace idempotente al endpoint: el
    // doble clic no deja dos versiones identicas separadas por 300 ms.
    if (propuesta.estado === 'sin-cambios') {
      return { entrada: propuesta.entrada, creada: false, cambios: [] };
    }

    const guardada = await this.almacen.insertar(propuesta.entrada);
    await this.evento(firmante, accionDe(propuesta.cambios), guardada, propuesta.cambios);

    return { entrada: guardada, creada: true, cambios: propuesta.cambios };
  }

  // ── Mapa Dx → servicios (§7.2) ───────────────────────────────

  /** Resuelve un diagnostico contra la version vigente del mapa. */
  async resolver(dx: string | null | undefined): Promise<ResolucionDx> {
    return resolverDx(await this.almacen.filas('mapa_dx'), dx);
  }

  /**
   * El LLM propone, la tabla decide.
   *
   * Esta es la funcion que el pipeline de triage deberia llamar antes de armar
   * `serviciosRequeridos`. Hoy no la llama nadie: cablearla toca `triage/`,
   * que no es dominio de esta tarea. Se exporta desde `AdminModule` lista para
   * inyectar — ver la nota de dependencias en el reporte de 5.11.
   */
  async decidir(
    dx: string | null | undefined,
    propuestoPorLlm: readonly number[],
  ) {
    return decidirServicios(await this.resolver(dx), propuestoPorLlm);
  }

  // ── Auditoria ────────────────────────────────────────────────

  async eventos(filtro: {
    coleccion?: Coleccion;
    codigo?: string;
    limite?: number;
  }): Promise<EventoAdmin[]> {
    return this.almacen.eventos(filtro);
  }

  private async evento(
    firmante: Firmante,
    accion: AccionAdmin,
    entrada: VersionEntrada,
    cambios: Diferencia[],
  ): Promise<void> {
    await this.almacen.registrarEvento({
      id: randomUUID(),
      ocurridoEn: new Date().toISOString(),
      actor: firmante.actor,
      via: firmante.via,
      accion,
      coleccion: entrada.coleccion,
      codigo: entrada.codigo,
      version: entrada.version,
      motivo: entrada.motivo,
      cambios,
    });

    this.log.log(
      `${accion} · ${entrada.coleccion}/${entrada.codigo}@${entrada.version} · ` +
        `${firmante.actor} (${firmante.via})`,
    );
  }

  // ── Validacion ───────────────────────────────────────────────

  /**
   * Valida el cuerpo contra el esquema de su coleccion y, si es una fila del
   * mapa Dx, contra el CodeSystem REPS y contra el catalogo de protocolos.
   *
   * Un codigo REPS inventado aqui no da un error visible: da un filtro duro que
   * ninguna sede cumple, y por tanto un caso que escala al CRUE sin que nadie
   * entienda por que. Por eso se rechaza en la puerta.
   */
  private async validarDatos(
    coleccion: Coleccion,
    crudo: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const esquema = ESQUEMA_DATOS[coleccion] as z.ZodType;
    const leido = esquema.safeParse(crudo);
    if (!leido.success) {
      throw new BadRequestException(
        `Datos inválidos para ${coleccion}: ${resumirZod(leido.error)}`,
      );
    }

    const datos = leido.data as Record<string, unknown>;

    if (coleccion === 'mapa_dx') {
      const servicios = datos.serviciosRequeridos as number[];
      const desconocidos = servicios.filter((s) => !REPS_CONOCIDOS.has(s));
      if (desconocidos.length > 0) {
        throw new BadRequestException(
          `Códigos REPS desconocidos: ${desconocidos.join(', ')}. ` +
            'Solo se aceptan los del CodeSystem de MinSalud compilado en ' +
            'catalogo/servicios-reps.ts. Ojo: 408 es Radioterapia, hemodinamia es 743.',
        );
      }

      const protocolo = datos.protocolo;
      if (typeof protocolo === 'string' && protocolo.length > 0) {
        const conocidos = await this.activos('protocolo');
        if (!conocidos.some((p) => p.codigo === protocolo)) {
          throw new BadRequestException(
            `El protocolo ${protocolo} no existe o está retirado. ` +
              'Una fila del mapa no puede apuntar a un protocolo fantasma.',
          );
        }
      }
    }

    return datos;
  }
}

/** `activo` cambiando es lo unico que merece una accion propia en la bitacora. */
function accionDe(cambios: Diferencia[]): AccionAdmin {
  const activo = cambios.find((c) => c.campo === 'activo');
  if (!activo) return 'version.creada';
  return activo.despues === false ? 'entrada.retirada' : 'entrada.restituida';
}

function exigirEtiqueta(crudo: unknown): string {
  const etiqueta = typeof crudo === 'string' ? crudo.trim() : '';
  if (!etiqueta) throw new BadRequestException('Falta la etiqueta.');
  if (etiqueta.length > 200) {
    throw new BadRequestException('La etiqueta no puede pasar de 200 caracteres.');
  }
  return etiqueta;
}

function resumirZod(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)
    .join('; ');
}

export type { Catalogo };
