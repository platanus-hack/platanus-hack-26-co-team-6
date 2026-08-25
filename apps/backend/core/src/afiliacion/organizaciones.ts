/**
 * De donde salen las organizaciones — tareas 2.1 y 2.5.
 *
 * ⚠️ HOY VIVEN EN MEMORIA. Mismo patron y misma razon que `auth/actores.ts`
 *    de la tarea 1.3: la tabla la crea `supabase/migrations/0006`, pero core
 *    tiene que arrancar y funcionar sin base de datos —es la regla del
 *    repo— y ademas `0006` se pisa con la tarea 1.1 de Zaid.
 *
 *    El repositorio es una interfaz con una implementacion en memoria. El
 *    dia que haya base se agrega `RepoOrganizacionesPostgres` y **ninguna
 *    ruta cambia**.
 *
 *    Lo que NO se hizo: dejar que la afiliacion «funcione» y se pierda en
 *    silencio. `AfiliacionService` lo dice en el log al arrancar y
 *    `GET /capacidades` lo hace visible.
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  EstadoAfiliacion,
  Organizacion,
  TipoOrganizacion,
} from '../contracts/types';
import { normalizarNit } from './nit';

export interface NuevaOrganizacion {
  tipo: TipoOrganizacion;
  razonSocial: string;
  nombreCorto?: string | null;
  nit: string;
  estado: EstadoAfiliacion;
  verificacion: Organizacion['verificacion'];
  sedes: string[];
  observaciones?: string[];
}

export interface RepoOrganizaciones {
  porId(id: string): Promise<Organizacion | undefined>;
  /** La unicidad del contrato es (tipo, nit), no el NIT a secas. */
  porTipoYNit(
    tipo: TipoOrganizacion,
    nit: string,
  ): Promise<Organizacion | undefined>;
  /** Quien reclamo esa sede. `undefined` = sede del REPS sin afiliar. */
  porSede(codigoSede: string): Promise<Organizacion | undefined>;
  crear(nueva: NuevaOrganizacion): Promise<Organizacion>;
  guardar(organizacion: Organizacion): Promise<Organizacion>;
  todas(): Promise<Organizacion[]>;
}

export const REPO_ORGANIZACIONES = Symbol('REPO_ORGANIZACIONES');

@Injectable()
export class RepoOrganizacionesMemoria implements RepoOrganizaciones {
  private readonly log = new Logger(RepoOrganizacionesMemoria.name);
  private readonly porUuid = new Map<string, Organizacion>();
  /** `${tipo}:${nit}` → id. Es el unique del contrato, en memoria. */
  private readonly porClave = new Map<string, string>();
  /** codigoSede → id. Una sede activa la reclama UNA organizacion. */
  private readonly porCodigoSede = new Map<string, string>();

  porId(id: string): Promise<Organizacion | undefined> {
    return Promise.resolve(this.porUuid.get(id));
  }

  porTipoYNit(
    tipo: TipoOrganizacion,
    nit: string,
  ): Promise<Organizacion | undefined> {
    const id = this.porClave.get(clave(tipo, nit));
    return Promise.resolve(id ? this.porUuid.get(id) : undefined);
  }

  porSede(codigoSede: string): Promise<Organizacion | undefined> {
    const id = this.porCodigoSede.get(codigoSede);
    return Promise.resolve(id ? this.porUuid.get(id) : undefined);
  }

  crear(nueva: NuevaOrganizacion): Promise<Organizacion> {
    const ahora = new Date().toISOString();
    const organizacion: Organizacion = {
      id: randomUUID(),
      tipo: nueva.tipo,
      razonSocial: nueva.razonSocial,
      nombreCorto: nueva.nombreCorto ?? null,
      nit: nueva.nit,
      estado: nueva.estado,
      verificacion: nueva.verificacion,
      sedes: [...nueva.sedes],
      observaciones: nueva.observaciones ?? [],
      creadaEn: ahora,
      actualizadaEn: ahora,
    };
    return this.guardar(organizacion);
  }

  guardar(organizacion: Organizacion): Promise<Organizacion> {
    const guardada: Organizacion = {
      ...organizacion,
      actualizadaEn: new Date().toISOString(),
    };
    this.porUuid.set(guardada.id, guardada);
    this.porClave.set(clave(guardada.tipo, guardada.nit), guardada.id);

    // El indice por sede se reconstruye entero para esta organizacion: si
    // solo se agregara, una sede desvinculada seguiria apuntando aqui y el
    // ranking la filtraria por un estado que ya no la gobierna.
    for (const [codigo, id] of this.porCodigoSede) {
      if (id === guardada.id) this.porCodigoSede.delete(codigo);
    }
    for (const codigo of guardada.sedes) {
      this.porCodigoSede.set(codigo, guardada.id);
    }

    return Promise.resolve(guardada);
  }

  todas(): Promise<Organizacion[]> {
    return Promise.resolve([...this.porUuid.values()]);
  }

  /** Cuantas hay. Lo usa `GET /capacidades` para no mentir sobre el modo. */
  get cantidad(): number {
    return this.porUuid.size;
  }

  /** Solo para los tests: deja el repositorio como recien arrancado. */
  vaciar(): void {
    this.porUuid.clear();
    this.porClave.clear();
    this.porCodigoSede.clear();
    this.log.debug('repositorio de organizaciones vaciado');
  }
}

/**
 * La clave del unique `(tipo, nit)`.
 *
 * Se normaliza el NIT aqui tambien —y no solo al entrar— porque este mapa
 * ES el indice de unicidad. Si «900123456» y «900123456-1» dieran claves
 * distintas, la misma clinica se afiliaria dos veces. Ver `nit.ts`.
 */
const clave = (tipo: TipoOrganizacion, nit: string): string =>
  `${tipo}:${normalizarNit(nit)}`;
