/**
 * De dónde salen y a dónde van los `evento_caso`.
 *
 * Mismo patrón que `persistence/routing-store.ts`: una interfaz, un token de
 * inyección y una implementación en memoria. Sin `PULSO_EVENTOS_DATABASE_URL`
 * el registro vive en la RAM del proceso **y el log lo dice** (regla 2 del
 * repo: todo degrada, y lo dice). El adaptador de Postgres lo agrega la tarea
 * 3.1 contra `supabase/migrations/0007_evento_caso.sql`.
 *
 * ⚠️ LO QUE ESTO SÍ ARREGLA Y LO QUE NO. El override del CRUE vivía en el
 * `localStorage` del navegador del regulador: se perdía al limpiar caché, no
 * lo veía nadie más, y no lo había validado ningún servidor. Con esto vive en
 * el servidor: sobrevive a recargar la página y a cambiar de máquina, lo ven
 * todos los reguladores, y la justificación la valida core. Lo que todavía
 * NO sobrevive es reiniciar core — eso es 3.1, y es exactamente la misma
 * deuda que ya tienen `AlmacenService` y `MemoryRoutingStore`.
 *
 * NO HAY `actualizar` NI `borrar`. No es un olvido: la auditoría es
 * append-only y la interfaz es el primer lugar donde eso se hace cumplir. Si
 * alguien necesita cambiar un evento, lo que necesita es escribir otro con
 * `corrigeA`.
 */

import type { EventoCaso, TipoEvento } from './evento.tipos';

export const ALMACEN_EVENTOS = Symbol('ALMACEN_EVENTOS');

export interface AlmacenEventos {
  /** Devuelve el evento ya con su `id`. */
  agregar(evento: Omit<EventoCaso, 'id'>): Promise<EventoCaso>;
  /** El que ya se escribió con esta clave, si lo hay. Idempotencia. */
  porClave(
    casoId: string,
    tipo: TipoEvento,
    clave: string,
  ): Promise<EventoCaso | undefined>;
  porId(id: number): Promise<EventoCaso | undefined>;
  /** Del caso, en orden cronológico ascendente. Es la línea de tiempo. */
  deCaso(casoId: string): Promise<EventoCaso[]>;
  /** Los más recientes de todos los casos, descendente. Lo lee /crue. */
  recientes(limite: number): Promise<EventoCaso[]>;
  /** Para poder DECIR en qué modo corre. */
  modo(): 'memoria' | 'postgres';
}

export class MemoriaAlmacenEventos implements AlmacenEventos {
  private readonly eventos: EventoCaso[] = [];
  private siguienteId = 1;

  async agregar(evento: Omit<EventoCaso, 'id'>): Promise<EventoCaso> {
    // Copia profunda al entrar: quien llamó no puede seguir mutando el
    // `detalle` de un evento ya escrito. En Postgres esto lo da el `insert`
    // gratis; en memoria hay que hacerlo a mano o el append-only es de
    // mentira.
    const guardado: EventoCaso = structuredClone({
      ...evento,
      id: this.siguienteId++,
    });
    this.eventos.push(guardado);
    return structuredClone(guardado);
  }

  async porClave(
    casoId: string,
    tipo: TipoEvento,
    clave: string,
  ): Promise<EventoCaso | undefined> {
    const hallado = this.eventos.find(
      (e) =>
        e.casoId === casoId && e.tipo === tipo && e.claveIdempotencia === clave,
    );
    return hallado && structuredClone(hallado);
  }

  async porId(id: number): Promise<EventoCaso | undefined> {
    const hallado = this.eventos.find((e) => e.id === id);
    return hallado && structuredClone(hallado);
  }

  async deCaso(casoId: string): Promise<EventoCaso[]> {
    return this.eventos
      .filter((e) => e.casoId === casoId)
      .sort(porTiempo)
      .map((e) => structuredClone(e));
  }

  async recientes(limite: number): Promise<EventoCaso[]> {
    return [...this.eventos]
      .sort((a, b) => -porTiempo(a, b))
      .slice(0, Math.max(0, limite))
      .map((e) => structuredClone(e));
  }

  modo(): 'memoria' | 'postgres' {
    return 'memoria';
  }
}

/**
 * Cronológico, y con el `id` de desempate.
 *
 * Dos eventos del mismo milisegundo no son raros: el despacho y su
 * notificación caen juntos. Sin desempate estable, la línea de tiempo del
 * forense cambiaría de orden entre dos lecturas del mismo caso, y una
 * auditoría que no es reproducible no sirve de nada.
 */
function porTiempo(a: EventoCaso, b: EventoCaso): number {
  return a.ocurridoEn === b.ocurridoEn
    ? a.id - b.id
    : a.ocurridoEn.localeCompare(b.ocurridoEn);
}
