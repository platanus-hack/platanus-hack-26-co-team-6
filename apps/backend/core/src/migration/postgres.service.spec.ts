import { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';
import { ErrorDeConfiguracion, PostgresService } from './postgres.service';

describe('PostgresService', () => {
  it('fails clearly before connecting when SUPABASE_DB_URL is missing', async () => {
    const service = new PostgresService(new ConfigService({}));

    await expect(service.consultar('select 1')).rejects.toThrow(
      ErrorDeConfiguracion,
    );
    await expect(service.consultar('select 1')).rejects.toThrow(
      /Falta SUPABASE_DB_URL/,
    );
  });

  it('rolls back and releases the client when a transaction fails', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const release = jest.fn();
    const connect = jest.fn().mockResolvedValue({ query, release });
    const service = new PostgresService(new ConfigService({}));
    (service as unknown as { pool: Pick<Pool, 'connect'> }).pool = { connect };

    await expect(
      service.enTransaccion(() => Promise.reject(new Error('DDL failed'))),
    ).rejects.toThrow('DDL failed');

    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(query).toHaveBeenNthCalledWith(2, 'ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
