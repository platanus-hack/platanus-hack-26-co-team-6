/**
 * Dónde vive el estado de la flota.
 *
 * Detrás de una interfaz a propósito: hoy es un `Map` en RAM —el mismo patrón
 * y la misma limitación que `almacen/almacen.service.ts`— y mañana es Postgres
 * sin que `MovilesService` se entere.
 *
 * ── LO QUE FALTA, DICHO EN VOZ ALTA ───────────────────────────────
 * Reiniciar core borra las posiciones. La persistencia real llega con la
 * tarea 1.2 (Neid, `caso` y `handshake` en Postgres) y con la 3.6 (Zaid,
 * tablas `movil` y `movil_estado`); la migración `0006_moviles_posicion.sql`
 * ya deja el esquema listo para cuando alguien enchufe el store.
 * **No lo "arregles" con un archivo JSON**: el sitio correcto es Postgres.
 */

import { Injectable } from '@nestjs/common';
import type { EstadoMovil, MovilRegistrado } from './posicion';

export interface AlmacenMoviles {
  listar(): EstadoMovil[];
  obtener(movilId: string): EstadoMovil | undefined;
  guardar(estado: EstadoMovil): EstadoMovil;
  /** Solo para el demo y los tests: dejar la flota limpia. */
  reiniciar(flota?: readonly MovilRegistrado[]): void;
}

/** Token de inyección. Cambiar de implementación es cambiar un provider. */
export const ALMACEN_MOVILES = 'ALMACEN_MOVILES';

/**
 * Flota provisional.
 *
 * ⚠️ NO SON DATOS REALES y no pretenden serlo: son cuatro registros para que
 * el alcance por organización sea comprobable de verdad (dos organizaciones
 * distintas) antes de que exista la tabla `movil` de la tarea 3.6.
 *
 * Nacen SIN posición a propósito. Inventar coordenadas de ambulancias sería
 * pintar cobertura que nadie reportó, que es justo lo que este módulo existe
 * para dejar de hacer: un móvil sin reporte se ve como "sin posición", no como
 * un pin en un cruce cualquiera.
 */
export const FLOTA_PROVISIONAL: readonly MovilRegistrado[] = [
  { id: 'AMB-014', organizacionId: 'org-demo', tipo: 'TAB' },
  { id: 'AMB-021', organizacionId: 'org-demo', tipo: 'TAM' },
  { id: 'AMB-102', organizacionId: 'org-vecina', tipo: 'TAB' },
  { id: 'AMB-118', organizacionId: 'org-vecina', tipo: 'TAM' },
];

@Injectable()
export class MovilesMemoria implements AlmacenMoviles {
  private readonly estados = new Map<string, EstadoMovil>();

  /**
   * Sin parámetros a propósito. Un `constructor(flota = FLOTA_PROVISIONAL)`
   * parece inofensivo y rompe el arranque: Nest emite `design:paramtypes` para
   * toda clase `@Injectable()` y trata ese parámetro como una dependencia que
   * no sabe resolver (`Nest can't resolve dependencies of MovilesMemoria`), sin
   * que ningún test que instancie la clase a mano se entere. Para sembrar otra
   * flota está `reiniciar(flota)`.
   */
  constructor() {
    this.reiniciar();
  }

  listar(): EstadoMovil[] {
    // Orden estable por indicativo: el tablero del CRUE no puede reordenarse
    // solo en cada poll — el ojo pierde el móvil que estaba mirando.
    return [...this.estados.values()].sort((a, b) =>
      a.movil.id.localeCompare(b.movil.id),
    );
  }

  obtener(movilId: string): EstadoMovil | undefined {
    return this.estados.get(movilId);
  }

  guardar(estado: EstadoMovil): EstadoMovil {
    this.estados.set(estado.movil.id, estado);
    return estado;
  }

  reiniciar(flota: readonly MovilRegistrado[] = FLOTA_PROVISIONAL): void {
    this.estados.clear();
    for (const movil of flota) {
      this.estados.set(movil.id, { movil, disponible: true, ultima: null });
    }
  }
}
