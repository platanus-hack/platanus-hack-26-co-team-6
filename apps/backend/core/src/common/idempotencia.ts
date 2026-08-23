/**
 * Idempotencia generica — tarea 2.11.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  POR QUE ESTO NO ES UNA COMODIDAD
 * ═══════════════════════════════════════════════════════════════════
 *  Spec §0: *"Reintentos por mala conectividad de la ambulancia son la
 *  norma, no la excepcion."* Una ambulancia en un sotano de urgencias
 *  reintenta; el paramedico toca dos veces porque no vio respuesta; la cola
 *  offline reenvia al recuperar señal.
 *
 *  Hasta ahora la idempotencia existia SOLO dentro de `RoutingStore` —el
 *  guard de aceptacion unica— y nada mas la tenia. Un `POST /dispatch`
 *  reintentado creaba DOS handshakes; un `POST /escalamiento` reintentado
 *  ya era idempotente por caso, pero por casualidad de su propia logica, no
 *  porque alguien lo hubiera decidido.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  CLAVE Y HUELLA: DOS COSAS DISTINTAS
 * ═══════════════════════════════════════════════════════════════════
 *  · **clave**  — la manda el cliente en `Idempotency-Key`. Identifica LA
 *                 ACCION, no la peticion: el mismo despacho reintentado tres
 *                 veces lleva la misma clave las tres.
 *  · **huella** — la calcula el servidor con metodo, ruta y cuerpo. Detecta
 *                 que la MISMA clave llegue con un cuerpo DISTINTO, que casi
 *                 siempre significa un bug del cliente reusando claves. Eso
 *                 es `PULSO_IDEMPOTENCY_CONFLICT` y es un 409, no un 200:
 *                 devolver el resultado viejo ahi seria contestar a una
 *                 pregunta que nadie hizo.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

/** §2.11: purga a 24 h. Un reintento honesto no llega al dia siguiente. */
export const VENTANA_MS = 24 * 60 * 60 * 1000;

export interface ResultadoGuardado {
  estado: number;
  cuerpo: unknown;
}

/**
 * Lo que devuelve reservar una clave:
 *
 *   nuevo      — nadie la habia usado: adelante, ejecuta y despues completa
 *   repetido   — misma clave, misma huella, ya terminada: devuelve ESTO
 *   en_curso   — misma clave, misma huella, TODAVIA corriendo
 *   conflicto  — misma clave, huella distinta
 */
export type Reserva =
  | { tipo: 'nuevo' }
  | { tipo: 'repetido'; resultado: ResultadoGuardado }
  | { tipo: 'en_curso'; espera?: Promise<ResultadoGuardado | undefined> }
  | { tipo: 'conflicto' };

export interface AlmacenIdempotencia {
  reservar(clave: string, huella: string): Promise<Reserva>;
  completar(clave: string, resultado: ResultadoGuardado): Promise<void>;
  /** Libera una clave cuya peticion fallo: un 500 no se cachea. */
  liberar(clave: string): Promise<void>;
}

export const ALMACEN_IDEMPOTENCIA = Symbol('ALMACEN_IDEMPOTENCIA');

export const huellaDe = (
  metodo: string,
  ruta: string,
  cuerpo: unknown,
): string =>
  createHash('sha256')
    .update(`${metodo} ${ruta} ${canonico(cuerpo)}`)
    .digest('hex');

/** JSON con las claves ordenadas: `{a,b}` y `{b,a}` son la misma peticion. */
function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  return `{${Object.keys(valor as Record<string, unknown>)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${canonico((valor as Record<string, unknown>)[k])}`,
    )
    .join(',')}}`;
}

// ─────────────────────────────────────────────────────────────────

interface Entrada {
  huella: string;
  creadoEn: number;
  resultado?: ResultadoGuardado;
  /** Se resuelve cuando la peticion original termina. Ver `en_curso`. */
  espera?: Promise<ResultadoGuardado | undefined>;
  resolver?: (r: ResultadoGuardado | undefined) => void;
}

/**
 * En memoria. Es el modo por defecto, igual que `MemoryRoutingStore`.
 *
 * Ventaja sobre la version Postgres: un reintento que llega MIENTRAS la
 * primera peticion sigue corriendo se queda esperando el mismo resultado en
 * vez de recibir un error. Es el caso real de la ambulancia que toca dos
 * veces con mala señal, y aqui se puede resolver bien porque las dos
 * peticiones viven en el mismo proceso.
 */
@Injectable()
export class IdempotenciaMemoria implements AlmacenIdempotencia {
  private readonly entradas = new Map<string, Entrada>();

  reservar(clave: string, huella: string): Promise<Reserva> {
    this.purgar();
    const previa = this.entradas.get(clave);

    if (!previa) {
      const entrada: Entrada = { huella, creadoEn: Date.now() };
      entrada.espera = new Promise((resolver) => {
        entrada.resolver = resolver;
      });
      this.entradas.set(clave, entrada);
      return Promise.resolve({ tipo: 'nuevo' });
    }

    if (previa.huella !== huella) return Promise.resolve({ tipo: 'conflicto' });
    if (previa.resultado)
      return Promise.resolve({ tipo: 'repetido', resultado: previa.resultado });
    return Promise.resolve({ tipo: 'en_curso', espera: previa.espera });
  }

  completar(clave: string, resultado: ResultadoGuardado): Promise<void> {
    const entrada = this.entradas.get(clave);
    if (!entrada) return Promise.resolve();
    entrada.resultado = resultado;
    entrada.resolver?.(resultado);
    return Promise.resolve();
  }

  liberar(clave: string): Promise<void> {
    const entrada = this.entradas.get(clave);
    entrada?.resolver?.(undefined);
    this.entradas.delete(clave);
    return Promise.resolve();
  }

  private purgar(): void {
    const limite = Date.now() - VENTANA_MS;
    for (const [clave, entrada] of this.entradas)
      if (entrada.creadoEn < limite) this.entradas.delete(clave);
  }
}

/**
 * En Postgres, sobre la tabla `idempotencia` (migracion 0005) — que es la
 * generalizacion de `pulso_routing_idempotency`, hoy limitada al ruteo.
 *
 * El candado es el propio `insert`: la llave primaria decide quien gana la
 * carrera, sin locks a mano. Quien pierde el insert es un reintento.
 */
export class IdempotenciaPostgres implements AlmacenIdempotencia {
  constructor(private readonly pool: Pool) {}

  async reservar(clave: string, huella: string): Promise<Reserva> {
    const insertado = await this.pool.query(
      'insert into idempotencia (clave, huella) values ($1, $2) on conflict (clave) do nothing returning clave',
      [clave, huella],
    );
    if (insertado.rowCount) return { tipo: 'nuevo' };

    const previa = await this.pool.query<{
      huella: string;
      resultado: ResultadoGuardado | null;
    }>('select huella, resultado from idempotencia where clave = $1', [clave]);

    const fila = previa.rows[0];
    // Pudo purgarse entre el insert y el select. Tratarlo como conflicto es
    // el lado seguro: no ejecuta dos veces algo que quiza ya se ejecuto.
    if (!fila) return { tipo: 'conflicto' };
    if (fila.huella !== huella) return { tipo: 'conflicto' };
    // Con varias instancias no se puede esperar a la otra: vive en otro
    // proceso. Se responde 'en_curso' sin promesa y el interceptor devuelve
    // un 409 reintentable con Retry-After.
    return fila.resultado
      ? { tipo: 'repetido', resultado: fila.resultado }
      : { tipo: 'en_curso' };
  }

  async completar(clave: string, resultado: ResultadoGuardado): Promise<void> {
    await this.pool.query(
      'update idempotencia set resultado = $2::jsonb, completado_en = now() where clave = $1',
      [clave, JSON.stringify(resultado)],
    );
  }

  async liberar(clave: string): Promise<void> {
    await this.pool.query('delete from idempotencia where clave = $1', [clave]);
  }
}

/**
 * Igual que `PersistenceModule`: si hay URL, Postgres; si no, memoria, y se
 * dice en el log. La regla del repo es degradar y decirlo.
 */
export const proveedorIdempotencia = {
  provide: ALMACEN_IDEMPOTENCIA,
  inject: [ConfigService, IdempotenciaMemoria],
  useFactory: (
    config: ConfigService,
    memoria: IdempotenciaMemoria,
  ): AlmacenIdempotencia => {
    const log = new Logger('Idempotencia');
    const url = config.get<string>('PULSO_ROUTING_DATABASE_URL');

    if (config.get<string>('ROUTING_STORE') === 'memory' || !url) {
      log.warn(
        'Idempotencia en memoria: un reintento que caiga en OTRA instancia ' +
          'no se reconoce. Con una sola instancia es exacta; con varias, ' +
          'pon PULSO_ROUTING_DATABASE_URL.',
      );
      return memoria;
    }

    // max bajo a proposito: este pool solo sirve peticiones cortisimas y no
    // tiene por que competir por conexiones con el estado de ruteo.
    return new IdempotenciaPostgres(
      new Pool({ connectionString: url, max: 4 }),
    );
  },
};
