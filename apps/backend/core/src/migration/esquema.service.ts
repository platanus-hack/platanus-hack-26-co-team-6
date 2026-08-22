/**
 * Runner de migraciones de esquema.
 *
 * Aplica los .sql de `supabase/migrations/` en orden alfabético, uno por
 * transacción, y deja registro en `schema_migrations`.
 *
 * POR QUÉ EL CHECKSUM: el caso feo no es olvidar aplicar una migración — eso se
 * ve. El caso feo es que alguien EDITE un .sql después de aplicarlo. Ahí `up`
 * no hace nada, la base queda distinta al archivo, y nadie se entera hasta que
 * algo falla en un lugar sin relación. El SHA-256 lo grita.
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PostgresService } from './postgres.service';
import { directorioDeMigraciones } from './fuentes';

export interface Migracion {
  version: string;
  checksum: string;
  sql: string;
}

export interface EstadoMigracion {
  version: string;
  estado: 'aplicada' | 'pendiente' | 'modificada';
  aplicadaEn: Date | null;
}

const TABLA_CONTROL = `
  create table if not exists schema_migrations (
    version     text primary key,
    checksum    text not null,
    aplicada_en timestamptz not null default now()
  )
`;

@Injectable()
export class EsquemaService {
  private readonly log = new Logger(EsquemaService.name);

  constructor(private readonly pg: PostgresService) {}

  /** Lee los .sql del disco, ordenados. El nombre del archivo ES la versión. */
  async migracionesEnDisco(): Promise<Migracion[]> {
    const dir = await directorioDeMigraciones();
    const archivos = (await readdir(dir))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    return Promise.all(
      archivos.map(async (version) => {
        const sql = await readFile(join(dir, version), 'utf8');
        return { version, checksum: sha256(sql), sql };
      }),
    );
  }

  private async aplicadas(): Promise<
    Map<string, { checksum: string; aplicada_en: Date }>
  > {
    await this.pg.consultar(TABLA_CONTROL);
    const filas = await this.pg.consultar<{
      version: string;
      checksum: string;
      aplicada_en: Date;
    }>('select version, checksum, aplicada_en from schema_migrations');
    return new Map(filas.map((f) => [f.version, f]));
  }

  async estado(): Promise<EstadoMigracion[]> {
    const [enDisco, yaAplicadas] = await Promise.all([
      this.migracionesEnDisco(),
      this.aplicadas(),
    ]);

    return enDisco.map((m) => {
      const registro = yaAplicadas.get(m.version);
      if (!registro) {
        return {
          version: m.version,
          estado: 'pendiente' as const,
          aplicadaEn: null,
        };
      }
      return {
        version: m.version,
        // El archivo cambió después de aplicarse: la DB y el repo no coinciden.
        estado:
          registro.checksum === m.checksum
            ? ('aplicada' as const)
            : ('modificada' as const),
        aplicadaEn: registro.aplicada_en,
      };
    });
  }

  /**
   * Aplica las pendientes. Devuelve las versiones que corrieron.
   *
   * Una migración `modificada` NO se re-aplica sola: re-correr un DDL editado
   * puede destruir datos. Se avisa y se para.
   */
  async aplicarPendientes(): Promise<string[]> {
    const estados = await this.estado();

    const modificadas = estados.filter((e) => e.estado === 'modificada');
    if (modificadas.length > 0) {
      throw new Error(
        `Estas migraciones cambiaron DESPUÉS de aplicarse:\n` +
          modificadas.map((m) => `  · ${m.version}`).join('\n') +
          `\n\nLa base y el repo ya no coinciden. No las re-aplico solo: un DDL\n` +
          `editado puede borrar datos. Decide a mano — normalmente la salida es\n` +
          `una migración NUEVA que corrija, no editar la vieja.`,
      );
    }

    const pendientes = estados.filter((e) => e.estado === 'pendiente');
    if (pendientes.length === 0) return [];

    const porVersion = new Map(
      (await this.migracionesEnDisco()).map((m) => [m.version, m]),
    );
    const aplicadas: string[] = [];

    for (const { version } of pendientes) {
      const m = porVersion.get(version)!;
      this.log.log(`aplicando ${version}…`);

      // El registro en schema_migrations va DENTRO de la misma transacción: si
      // el DDL falla, tampoco queda marcada como aplicada.
      await this.pg.enTransaccion(async (cx) => {
        await cx.query(m.sql);
        await cx.query(
          'insert into schema_migrations (version, checksum) values ($1, $2)',
          [version, m.checksum],
        );
      });

      aplicadas.push(version);
    }

    return aplicadas;
  }
}

function sha256(texto: string): string {
  // Normalizamos CRLF → LF: si no, el mismo archivo da distinto checksum en
  // Windows y en Linux, y el equipo entero ve "modificada" sin haber tocado nada.
  return createHash('sha256')
    .update(texto.replace(/\r\n/g, '\n'))
    .digest('hex');
}
