import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cargarCsvDesde, parsearCsv } from './fuentes';

describe('migration data sources', () => {
  it('parses RFC 4180 quoting, escaped quotes and embedded newlines', () => {
    expect(
      parsearCsv(
        'codigo,nombre,direccion\r\n' +
          'A,"Clínica, Norte","Calle ""Uno""\nBogotá"\r\n',
      ),
    ).toEqual([
      {
        codigo: 'A',
        nombre: 'Clínica, Norte',
        direccion: 'Calle "Uno"\nBogotá',
      },
    ]);
  });

  it('normalizes the ETL CSV files into Sede records', async () => {
    const output = await mkdtemp(join(tmpdir(), 'pulso-etl-'));
    await writeFile(
      join(output, 'sedes.csv'),
      [
        'codigo,nombre,direccion,localidad,lat,lng,naturaleza,complejidad,telefono',
        'A1,"Clínica, Norte",Calle 1,Usaquén,4.7,-74.03,Privada,alta,6011',
      ].join('\n'),
    );
    await writeFile(
      join(output, 'capacidad.csv'),
      [
        'codigo_sede,tipo_capacidad,camas_reps,ocupadas_snapshot',
        'A1,CAMAS-UCI Adultos,12,7',
      ].join('\n'),
    );
    await writeFile(
      join(output, 'servicios.csv'),
      ['codigo_sede,cod_servicio', 'A1,743'].join('\n'),
    );

    const result = await cargarCsvDesde(output);

    expect(result.serviciosDisponibles).toBe(true);
    expect(result.sedes).toEqual([
      expect.objectContaining({
        codigo: 'A1',
        nombre: 'Clínica, Norte',
        coord: { lat: 4.7, lng: -74.03 },
        servicios: [743],
        camas: [{ tipo: 'CAMAS-UCI Adultos', total: 12, ocupadasSnapshot: 7 }],
      }),
    ]);
  });

  it('explains how to recover when the ETL output is missing', async () => {
    const output = await mkdtemp(join(tmpdir(), 'pulso-etl-missing-'));

    await expect(cargarCsvDesde(output)).rejects.toThrow(
      /corre el ETL primero/i,
    );
  });
});
