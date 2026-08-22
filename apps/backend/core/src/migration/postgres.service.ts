/**
 * Conexión Postgres directa. El ÚNICO lugar del proyecto que la abre.
 *
 * ¿Por qué no reusar SupabaseService? Porque `@supabase/supabase-js` habla
 * PostgREST, y PostgREST no ejecuta DDL: solo hace CRUD sobre tablas que ya
 * existen y llama RPCs ya definidas. `create table` necesita una conexión
 * Postgres de verdad.
 *
 * ⚠️ SUPABASE_DB_URL debe ser el connection string DIRECTO o en modo session
 *    (puerto 5432). El transaction pooler (6543) rompe con DDL y con prepared
 *    statements — y falla de una forma confusa, no con un error claro.
 *    Supabase → Project Settings → Database → Connection string → URI.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

/** Sale con código ≠ 0 y un mensaje accionable, sin stack trace de ruido. */
export class ErrorDeConfiguracion extends Error {}

@Injectable()
export class PostgresService implements OnModuleDestroy {
  private readonly log = new Logger(PostgresService.name);
  private pool: Pool | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * A diferencia de SedesService, esto NO cae a un fallback silencioso.
   * Un comando de migración que no hace nada calladito es mucho peor que uno
   * que falla: te deja creyendo que la base quedó lista.
   */
  private obtener(): Pool {
    if (this.pool) return this.pool;

    const url = this.config.get<string>('SUPABASE_DB_URL')?.trim();
    if (!url) {
      throw new ErrorDeConfiguracion(
        'Falta SUPABASE_DB_URL en apps/backend/core/.env\n\n' +
          '  Supabase → Project Settings → Database → Connection string → URI\n' +
          '  Usa el puerto 5432 (directo/session), NO el 6543 (transaction pooler):\n' +
          '  el pooler en modo transacción no soporta DDL.',
      );
    }

    if (url.includes(':6543')) {
      this.log.warn(
        'SUPABASE_DB_URL apunta al puerto 6543 (transaction pooler). ' +
          'El DDL puede fallar de forma confusa — usa el 5432.',
      );
    }

    this.pool = new Pool({
      connectionString: url,
      // Supabase exige TLS pero sirve un certificado que Node no valida contra
      // su store por defecto. Es la configuración que documenta Supabase.
      ssl: { rejectUnauthorized: false },
      max: 4,
    });
    return this.pool;
  }

  async consultar<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const res = await this.obtener().query<T>(sql, params);
    return res.rows;
  }

  /**
   * Corre `fn` dentro de una transacción. Postgres soporta DDL transaccional,
   * así que una migración que falla a la mitad no deja el esquema a medias.
   */
  async enTransaccion<T>(fn: (cx: PoolClient) => Promise<T>): Promise<T> {
    const cx = await this.obtener().connect();
    try {
      await cx.query('BEGIN');
      const resultado = await fn(cx);
      await cx.query('COMMIT');
      return resultado;
    } catch (e) {
      await cx.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      cx.release();
    }
  }

  /** Verifica que la conexión responde antes de intentar nada más. */
  async comprobar(): Promise<string> {
    const [fila] = await this.consultar<{ version: string }>(
      'select version() as version',
    );
    return fila?.version ?? 'desconocida';
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
    this.pool = null;
  }
}
