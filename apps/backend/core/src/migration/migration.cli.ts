import { NestFactory } from '@nestjs/core';
import { DatosService } from './datos.service';
import { EsquemaService } from './esquema.service';
import type { TipoFuente } from './fuentes';
import { MigrationModule } from './migration.module';
import { PostgresService } from './postgres.service';

type Comando = 'up' | 'status' | 'seed' | 'verify';

async function main(): Promise<void> {
  const argumentos = process.argv
    .slice(2)
    .filter((argumento) => argumento !== '--');
  const comando = argumentos[0] as Comando | undefined;
  if (!comando || !['up', 'status', 'seed', 'verify'].includes(comando)) {
    throw new Error(
      'Uso: migrate <up|status|seed|verify> [--fuente=semillas|csv]',
    );
  }

  const app = await NestFactory.createApplicationContext(MigrationModule, {
    logger: ['error', 'warn'],
  });

  try {
    await app.get(PostgresService).comprobar();

    if (comando === 'up') {
      const aplicadas = await app.get(EsquemaService).aplicarPendientes();
      if (aplicadas.length === 0) {
        console.log('Sin migraciones pendientes.');
      } else {
        console.log(`Migraciones aplicadas: ${aplicadas.join(', ')}.`);
      }
      return;
    }

    if (comando === 'status') {
      const estados = await app.get(EsquemaService).estado();
      if (estados.length === 0) {
        console.log('No hay archivos .sql en el directorio de migraciones.');
        return;
      }
      for (const estado of estados) {
        const fecha = estado.aplicadaEn?.toISOString() ?? '-';
        console.log(`${estado.version} · ${estado.estado} · ${fecha}`);
      }
      const modificadas = estados.filter(
        (estado) => estado.estado === 'modificada',
      );
      if (modificadas.length > 0) {
        throw new Error(
          `El checksum no coincide para: ${modificadas.map((m) => m.version).join(', ')}. ` +
            'La migración cambió desde que se aplicó.',
        );
      }
      return;
    }

    const datos = app.get(DatosService);
    if (comando === 'seed') {
      const fuente = leerFuente(argumentos.slice(1));
      const resultado = await datos.sembrar(fuente);
      console.log(
        `Semilla ${resultado.fuente}: ${resultado.sedes} sedes, ` +
          `${resultado.servicios} servicios y ${resultado.capacidades} capacidades.`,
      );
      if (resultado.sedesSinServicios > 0) {
        console.warn(
          `Advertencia: ${resultado.sedesSinServicios} sede(s) no tienen servicios.`,
        );
      }
      return;
    }

    const resultado = await datos.verificar();
    console.log(`OK · ${resultado.totalSedes} sedes cargadas`);
    console.log(`OK · ${resultado.fueraBogota} fuera de Bogotá`);
    console.log(`OK · ${resultado.sinGeom} con geom nulo`);
    console.log(`OK · ${resultado.conUrgencias} con urgencias (1102)`);
    console.log(`OK · ${resultado.conHemodinamia} con hemodinamia (743)`);
    console.log(`OK · ${resultado.cercanas} sedes cercanas a Plaza de Bolívar`);
  } finally {
    await app.close();
  }
}

function leerFuente(argumentos: string[]): TipoFuente {
  const desconocidos = argumentos.filter(
    (argumento) => !argumento.startsWith('--fuente='),
  );
  if (desconocidos.length > 0) {
    throw new Error(`Argumento desconocido: ${desconocidos[0]}.`);
  }
  const argumento = argumentos.find((valor) => valor.startsWith('--fuente='));
  const fuente = argumento?.slice('--fuente='.length) ?? 'semillas';
  if (fuente !== 'semillas' && fuente !== 'csv') {
    throw new Error(`Fuente inválida: ${fuente}. Usa semillas o csv.`);
  }
  return fuente;
}

void main().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${mensaje}`);
  process.exitCode = 1;
});
