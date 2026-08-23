/**
 * Donde viven los catalogos versionados.
 *
 * ── INTERFAZ PRIMERO, MEMORIA DESPUES ─────────────────────────────
 * Mismo patron que `persistence/routing-store.ts`: un simbolo de inyeccion, una
 * interfaz, y una implementacion en memoria que permite que todo el modulo
 * —y sus tests— corra sin Postgres. La tabla real ya esta escrita en
 * `supabase/migrations/0008_catalogos_versionados.sql`; la implementacion
 * Postgres es lo unico que falta y se conecta aqui sin tocar nada mas.
 *
 * ── Y LO DICE ─────────────────────────────────────────────────────
 * En memoria, un reinicio de core borra las versiones que un comite clinico
 * acaba de firmar. Eso NO se puede callar: `estadoPersistencia()` lo reporta,
 * `GET /admin/catalogos` lo devuelve y la consola pinta el aviso. Regla 2 del
 * repo. La diferencia con las demas degradaciones del sistema es que esta
 * pierde trabajo humano, asi que el aviso es mas fuerte.
 *
 * ── APPEND-ONLY ───────────────────────────────────────────────────
 * No hay `actualizar()` ni `borrar()` en esta interfaz. No es un olvido: es la
 * regla 4 del repo hecha superficie. Si algun dia hace falta corregir, se
 * agrega una version — y el trigger de la migracion 0008 lo impone tambien del
 * lado de la base, para que no dependa de la buena voluntad del codigo.
 */

import type {
  Coleccion,
  EventoAdmin,
  Modelo,
  RegistroProcesamiento,
  VersionEntrada,
} from './tipos';
import { semillas } from './semillas-catalogos';

export const ALMACEN_ADMIN = Symbol('ALMACEN_ADMIN');

export type EstadoPersistencia = 'memoria' | 'postgres';

export interface FiltroEventos {
  coleccion?: Coleccion;
  codigo?: string;
  limite?: number;
}

export interface FiltroProcesamiento {
  casoId?: string;
  coleccion?: Modelo;
  codigo?: string;
  version?: number;
  limite?: number;
}

export interface AlmacenAdmin {
  estadoPersistencia(): EstadoPersistencia;

  /** Historial COMPLETO de una coleccion. Todas las versiones de todos los codigos. */
  filas(coleccion: Coleccion): Promise<VersionEntrada[]>;

  /** Inserta una version. Nunca actualiza. */
  insertar(entrada: VersionEntrada): Promise<VersionEntrada>;

  registrarEvento(evento: EventoAdmin): Promise<EventoAdmin>;
  eventos(filtro: FiltroEventos): Promise<EventoAdmin[]>;

  /**
   * Anota que un caso se proceso con una version. Devuelve el registro
   * existente si ya estaba: append-only no significa duplicar el mismo hecho.
   */
  registrarProcesamiento(r: RegistroProcesamiento): Promise<RegistroProcesamiento>;
  procesamientos(filtro: FiltroProcesamiento): Promise<RegistroProcesamiento[]>;
}

/** Cuantos eventos devuelve la auditoria si nadie pide un limite. */
const LIMITE_DEFECTO = 200;

/**
 * Sin `@Injectable()` a proposito: se provee con una factory en `AdminModule`.
 * Decorarlo haria que Nest leyera los parametros del constructor e intentara
 * inyectar un `Boolean`, que es un fallo de arranque de los que solo se ven en
 * produccion.
 */
export class AlmacenAdminMemoria implements AlmacenAdmin {
  /** Todas las versiones de todas las colecciones, en orden de insercion. */
  private readonly versiones: VersionEntrada[] = [];
  private readonly bitacora: EventoAdmin[] = [];
  private readonly procesados: RegistroProcesamiento[] = [];

  constructor() {
    this.versiones.push(...semillas());
  }

  estadoPersistencia(): EstadoPersistencia {
    return 'memoria';
  }

  async filas(coleccion: Coleccion): Promise<VersionEntrada[]> {
    return this.versiones
      .filter((v) => v.coleccion === coleccion)
      .map((v) => structuredClone(v));
  }

  async insertar(entrada: VersionEntrada): Promise<VersionEntrada> {
    // Clon al entrar y al salir: quien llamo no puede mutar lo guardado por
    // tener todavia la referencia. El almacen del ruteo hace lo mismo y por el
    // mismo motivo — un test lo pillo alli.
    const guardada = structuredClone(entrada);
    this.versiones.push(guardada);
    return structuredClone(guardada);
  }

  async registrarEvento(evento: EventoAdmin): Promise<EventoAdmin> {
    this.bitacora.push(structuredClone(evento));
    return structuredClone(evento);
  }

  async eventos(filtro: FiltroEventos): Promise<EventoAdmin[]> {
    return this.bitacora
      .filter((e) => !filtro.coleccion || e.coleccion === filtro.coleccion)
      .filter((e) => !filtro.codigo || e.codigo === filtro.codigo)
      // Mas reciente primero: la auditoria se lee desde arriba.
      .slice()
      .reverse()
      .slice(0, filtro.limite ?? LIMITE_DEFECTO)
      .map((e) => structuredClone(e));
  }

  async registrarProcesamiento(
    r: RegistroProcesamiento,
  ): Promise<RegistroProcesamiento> {
    const previo = this.procesados.find(
      (p) =>
        p.casoId === r.casoId &&
        p.coleccion === r.coleccion &&
        p.codigo === r.codigo &&
        p.version === r.version,
    );
    if (previo) return structuredClone(previo);

    this.procesados.push(structuredClone(r));
    return structuredClone(r);
  }

  async procesamientos(filtro: FiltroProcesamiento): Promise<RegistroProcesamiento[]> {
    return this.procesados
      .filter((p) => !filtro.casoId || p.casoId === filtro.casoId)
      .filter((p) => !filtro.coleccion || p.coleccion === filtro.coleccion)
      .filter((p) => !filtro.codigo || p.codigo === filtro.codigo)
      .filter((p) => filtro.version === undefined || p.version === filtro.version)
      .slice()
      .sort((a, b) => b.procesadoEn.localeCompare(a.procesadoEn))
      .slice(0, filtro.limite ?? LIMITE_DEFECTO)
      .map((p) => structuredClone(p));
  }
}
