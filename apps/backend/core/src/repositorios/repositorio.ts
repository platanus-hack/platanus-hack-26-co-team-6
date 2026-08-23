/**
 * Interfaz de persistencia de `caso` y `handshake`.
 *
 * ⚠️ LA DECISIÓN DE DISEÑO QUE HAY QUE ENTENDER ANTES DE TOCAR ESTO
 *
 * `AlmacenService` expone DIECISÉIS métodos SÍNCRONOS y lo consumen dieciséis
 * archivos. Postgres es asíncrono. Volver async la superficie rompe a todos
 * sus consumidores de golpe, y la tarea 1.2 lo advierte explícitamente:
 * *"cambia la implementación detrás de la misma interfaz y no toques a los
 * consumidores, o el PR se vuelve inmergeable"*.
 *
 * La salida es un **write-through con caché en proceso**:
 *
 *   · Al arrancar, `AlmacenService` se hidrata desde el repositorio.
 *   · Las lecturas salen de la caché — siguen siendo síncronas.
 *   · Las escrituras van a la caché Y al repositorio, sin bloquear.
 *
 * QUÉ ARREGLA: la durabilidad, que es lo que pedía la tarea. Reiniciar core
 * ya no borra los casos, ni los handshakes, ni `pAceptacion`.
 *
 * QUÉ NO ARREGLA, Y HAY QUE DECIRLO: la coherencia entre instancias. Con dos
 * réplicas, cada una tiene su caché y sólo ve lo que había al arrancar más lo
 * que escribió ella. Es estrictamente mejor que hoy —donde una réplica no ve
 * NUNCA lo de la otra— pero no es multi-instancia de verdad. Eso es la 3.8
 * (worker con lock distribuido), y hasta que exista, core corre con una sola.
 */

import type { Caso, Handshake } from '../contracts/types';

export const REPOSITORIO = Symbol('REPOSITORIO_PULSO');

/** Todo lo que hay que traer al arrancar para que la caché quede completa. */
export interface Instantanea {
  casos: Caso[];
  handshakes: Handshake[];
}

export interface RepositorioPulso {
  /** Qué respaldo hay detrás. Va al log y a `/health`, para no adivinar. */
  readonly clase: 'memoria' | 'postgres';

  /**
   * Hidratación al arrancar. Si falla, el servicio arranca igual con la
   * caché vacía: un core que no levanta es peor que uno sin historia.
   */
  cargar(): Promise<Instantanea>;

  guardarCaso(caso: Caso): Promise<void>;
  guardarHandshake(h: Handshake): Promise<void>;

  /** Sólo para tests y para dejar limpio antes del pitch. */
  limpiar(): Promise<void>;
}
