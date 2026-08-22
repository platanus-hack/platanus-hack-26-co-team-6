import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PoolClient } from 'pg';
import { EsquemaService } from './esquema.service';
import type { PostgresService } from './postgres.service';

describe('EsquemaService', () => {
  const originalDir = process.env.MIGRATIONS_DIR;

  afterEach(() => {
    if (originalDir === undefined) delete process.env.MIGRATIONS_DIR;
    else process.env.MIGRATIONS_DIR = originalDir;
  });

  it('applies each pending file and its checksum in one transaction', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pulso-migrations-'));
    await writeFile(join(dir, '0001_init.sql'), 'create table demo(id int);\n');
    process.env.MIGRATIONS_DIR = dir;

    const query = jest.fn().mockResolvedValue({ rows: [] });
    const enTransaccion = jest.fn(
      async (fn: (cx: PoolClient) => Promise<void>) =>
        fn({ query } as unknown as PoolClient),
    );
    const pg = {
      consultar: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
      enTransaccion,
    } as unknown as PostgresService;

    const applied = await new EsquemaService(pg).aplicarPendientes();

    expect(applied).toEqual(['0001_init.sql']);
    expect(enTransaccion).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenNthCalledWith(1, 'create table demo(id int);\n');
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('insert into schema_migrations'),
      ['0001_init.sql', expect.stringMatching(/^[a-f0-9]{64}$/)],
    );
  });

  it('detects a migration edited after it was applied', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pulso-migrations-'));
    await writeFile(join(dir, '0001_init.sql'), 'select 2;\n');
    process.env.MIGRATIONS_DIR = dir;
    const pg = {
      consultar: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            version: '0001_init.sql',
            checksum: 'checksum-from-old-content',
            aplicada_en: new Date('2026-01-01T00:00:00Z'),
          },
        ]),
    } as unknown as PostgresService;

    await expect(new EsquemaService(pg).aplicarPendientes()).rejects.toThrow(
      /cambiaron.*después de aplicarse/is,
    );
  });

  it('reports applied database versions whose files are missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pulso-migrations-'));
    await writeFile(join(dir, '0002_next.sql'), 'select 2;\n');
    process.env.MIGRATIONS_DIR = dir;
    const appliedAt = new Date('2026-02-01T00:00:00Z');
    const pg = {
      consultar: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            version: '0001_removed.sql',
            checksum: 'old-checksum',
            aplicada_en: appliedAt,
          },
        ]),
    } as unknown as PostgresService;

    await expect(new EsquemaService(pg).estado()).resolves.toEqual([
      {
        version: '0001_removed.sql',
        estado: 'ausente',
        aplicadaEn: appliedAt,
      },
      {
        version: '0002_next.sql',
        estado: 'pendiente',
        aplicadaEn: null,
      },
    ]);
  });

  it('refuses to migrate while an applied database version has no file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pulso-migrations-'));
    await writeFile(join(dir, '0002_next.sql'), 'select 2;\n');
    process.env.MIGRATIONS_DIR = dir;
    const enTransaccion = jest.fn();
    const pg = {
      consultar: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            version: '0001_removed.sql',
            checksum: 'old-checksum',
            aplicada_en: new Date('2026-02-01T00:00:00Z'),
          },
        ]),
      enTransaccion,
    } as unknown as PostgresService;

    await expect(new EsquemaService(pg).aplicarPendientes()).rejects.toThrow(
      /no tienen archivo.*0001_removed\.sql/is,
    );
    expect(enTransaccion).not.toHaveBeenCalled();
  });
});
