import { Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatosService } from './datos.service';
import type { PostgresService } from './postgres.service';

describe('DatosService', () => {
  it('seeds geometry and child records with idempotent upserts', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const pg = {
      enTransaccion: jest.fn(async (fn: (cx: PoolClient) => Promise<void>) =>
        fn({ query } as unknown as PoolClient),
      ),
      consultar: jest.fn().mockResolvedValue([{ cantidad: 0 }]),
    } as unknown as PostgresService;
    const service = new DatosService(pg);

    const result = await service.sembrarSedes(
      {
        sedes: [
          {
            codigo: 'A1',
            nombre: 'Clínica Uno',
            direccion: 'Calle 1',
            localidad: 'Usaquén',
            coord: { lat: 4.7, lng: -74.03 },
            naturaleza: 'Privada',
            complejidad: 'alta',
            telefono: null,
            servicios: [1102],
            camas: [{ tipo: 'CAMAS-Adultos', total: 10, ocupadasSnapshot: 2 }],
          },
        ],
        serviciosDisponibles: true,
      },
      'semillas',
    );

    const sql = (query.mock.calls as unknown[][])
      .map((call) => String(call[0]))
      .join('\n');
    expect(sql).toContain('st_makepoint');
    expect(sql.match(/on conflict/g)).toHaveLength(3);
    expect(result).toEqual(
      expect.objectContaining({ sedes: 1, servicios: 1, capacidades: 1 }),
    );
  });

  it('fails verification when the IAM demo has no hemodynamics provider', async () => {
    const pg = {
      consultar: jest
        .fn()
        .mockResolvedValueOnce([
          {
            total_sedes: 14,
            fuera_bogota: 0,
            sin_geom: 0,
            con_urgencias: 14,
            con_hemodinamia: 0,
          },
        ])
        .mockResolvedValueOnce([{ cantidad: 14 }]),
    } as unknown as PostgresService;

    await expect(new DatosService(pg).verificar()).rejects.toThrow(
      /hemodinamia/i,
    );
  });

  it('warns and counts missing services from this CSV batch, not stale DB rows', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const consultar = jest.fn().mockResolvedValue([{ cantidad: 0 }]);
    const pg = {
      enTransaccion: jest.fn(async (fn: (cx: PoolClient) => Promise<void>) =>
        fn({ query } as unknown as PoolClient),
      ),
      consultar,
    } as unknown as PostgresService;
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const result = await new DatosService(pg).sembrarSedes(
      {
        sedes: [
          {
            codigo: 'CSV-1',
            nombre: 'Clínica CSV',
            direccion: 'Calle 1',
            localidad: 'Usaquén',
            coord: { lat: 4.7, lng: -74.03 },
            naturaleza: 'Privada',
            complejidad: 'alta',
            telefono: null,
            servicios: [],
            camas: [],
          },
        ],
        serviciosDisponibles: false,
      },
      'csv',
    );

    expect(result.sedesSinServicios).toBe(1);
    expect(consultar).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/servicios\.csv.*1 sede.*este lote/is),
    );
    warn.mockRestore();
  });
});
