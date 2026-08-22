import { access, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, parse, resolve } from 'node:path';
import type { CamaSede, Complejidad, Sede } from '../contracts/types';
import { SEDES_MOCK } from '../sedes/semillas';

export type TipoFuente = 'semillas' | 'csv';

export interface FuenteDatos {
  sedes: Sede[];
  serviciosDisponibles: boolean;
}

type FilaCsv = Record<string, string>;

const ARCHIVOS_ETL_REQUERIDOS = ['sedes.csv', 'capacidad.csv'] as const;

export async function cargarFuente(fuente: TipoFuente): Promise<FuenteDatos> {
  if (fuente === 'semillas') {
    return {
      sedes: SEDES_MOCK.map((sede) => ({
        ...sede,
        coord: { ...sede.coord },
        servicios: [...sede.servicios],
        camas: sede.camas.map((cama) => ({ ...cama })),
      })),
      serviciosDisponibles: true,
    };
  }

  return cargarCsvDesde(await directorioDeSalidaEtL());
}

/**
 * Carga la salida del ETL. La ruta se recibe aparte para poder probar el
 * contrato de los CSV sin depender del cwd del proceso.
 */
export async function cargarCsvDesde(directorio: string): Promise<FuenteDatos> {
  const faltantes: string[] = [];
  for (const archivo of ARCHIVOS_ETL_REQUERIDOS) {
    try {
      await access(join(directorio, archivo));
    } catch {
      faltantes.push(archivo);
    }
  }

  if (faltantes.length > 0) {
    throw new Error(
      `No se encontró la salida del ETL (${faltantes.join(', ')}) en ${directorio}.\n` +
        'Corre el ETL primero: cd scripts/etl && python extraer_reps.py',
    );
  }

  const [filasSede, filasCapacidad] = await Promise.all([
    leerCsv(join(directorio, 'sedes.csv')),
    leerCsv(join(directorio, 'capacidad.csv')),
  ]);

  const sedes = filasSede.map((fila, indice) => sedeDesdeCsv(fila, indice + 2));
  const porCodigo = new Map<string, Sede>();
  for (const sede of sedes) {
    if (porCodigo.has(sede.codigo)) {
      throw new Error(`sedes.csv contiene el código duplicado ${sede.codigo}.`);
    }
    porCodigo.set(sede.codigo, sede);
  }

  for (const [indice, fila] of filasCapacidad.entries()) {
    const codigo = requerido(fila, 'codigo_sede', 'capacidad.csv', indice + 2);
    const sede = porCodigo.get(codigo);
    if (!sede) {
      throw new Error(
        `capacidad.csv:${indice + 2} referencia la sede desconocida ${codigo}.`,
      );
    }
    sede.camas.push(capacidadDesdeCsv(fila, indice + 2));
  }

  const rutaServicios = join(directorio, 'servicios.csv');
  let serviciosDisponibles = true;
  try {
    await access(rutaServicios);
  } catch {
    serviciosDisponibles = false;
  }

  if (serviciosDisponibles) {
    const filasServicio = await leerCsv(rutaServicios);
    for (const [indice, fila] of filasServicio.entries()) {
      const codigo = requerido(
        fila,
        'codigo_sede',
        'servicios.csv',
        indice + 2,
      );
      const sede = porCodigo.get(codigo);
      if (!sede) {
        throw new Error(
          `servicios.csv:${indice + 2} referencia la sede desconocida ${codigo}.`,
        );
      }
      const codServicio = enteroNoNegativo(
        requerido(fila, 'cod_servicio', 'servicios.csv', indice + 2),
        'cod_servicio',
        'servicios.csv',
        indice + 2,
      );
      if (codServicio === 0) {
        throw new Error(`servicios.csv:${indice + 2} tiene cod_servicio=0.`);
      }
      if (!sede.servicios.includes(codServicio)) {
        sede.servicios.push(codServicio);
      }
    }
  }

  return { sedes, serviciosDisponibles };
}

export async function directorioDeMigraciones(): Promise<string> {
  const override = process.env.MIGRATIONS_DIR?.trim();
  if (override) {
    const ruta = isAbsolute(override)
      ? resolve(override)
      : resolve(process.cwd(), override);
    if (!(await esDirectorio(ruta))) {
      throw new Error(`MIGRATIONS_DIR no apunta a un directorio: ${ruta}`);
    }
    return ruta;
  }

  return buscarDirectorio(['supabase', 'migrations']);
}

async function directorioDeSalidaEtL(): Promise<string> {
  return join(await buscarDirectorio(['scripts', 'etl']), 'salida');
}

/** Sube desde cwd hasta encontrar la ruta solicitada. */
export async function buscarDirectorio(segmentos: string[]): Promise<string> {
  let actual = resolve(process.cwd());
  const raiz = parse(actual).root;

  while (true) {
    const candidato = join(actual, ...segmentos);
    if (await esDirectorio(candidato)) return candidato;
    if (actual === raiz) break;
    actual = resolve(actual, '..');
  }

  throw new Error(
    `No se encontró ${segmentos.join('/')} subiendo desde ${process.cwd()}.`,
  );
}

async function esDirectorio(ruta: string): Promise<boolean> {
  try {
    return (await stat(ruta)).isDirectory();
  } catch {
    return false;
  }
}

async function leerCsv(ruta: string): Promise<FilaCsv[]> {
  return parsearCsv(await readFile(ruta, 'utf8'));
}

/** Parser RFC 4180 pequeño: comillas, comillas escapadas, CRLF y saltos internos. */
export function parsearCsv(contenido: string): FilaCsv[] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;
  const texto = contenido.replace(/^\uFEFF/, '');

  for (let i = 0; i < texto.length; i += 1) {
    const caracter = texto[i];
    if (entreComillas) {
      if (caracter === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          entreComillas = false;
        }
      } else {
        campo += caracter;
      }
      continue;
    }

    if (caracter === '"') {
      if (campo.length > 0) {
        throw new Error(
          'CSV inválido: comilla dentro de un campo sin escapar.',
        );
      }
      entreComillas = true;
    } else if (caracter === ',') {
      fila.push(campo);
      campo = '';
    } else if (caracter === '\n' || caracter === '\r') {
      if (caracter === '\r' && texto[i + 1] === '\n') i += 1;
      fila.push(campo);
      campo = '';
      if (fila.some((valor) => valor.length > 0)) filas.push(fila);
      fila = [];
    } else {
      campo += caracter;
    }
  }

  if (entreComillas)
    throw new Error('CSV inválido: campo entre comillas sin cerrar.');
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    if (fila.some((valor) => valor.length > 0)) filas.push(fila);
  }
  if (filas.length === 0) throw new Error('CSV vacío.');

  const encabezados = filas[0].map((valor) => valor.trim());
  if (encabezados.some((valor) => !valor)) {
    throw new Error('CSV inválido: hay un encabezado vacío.');
  }
  if (new Set(encabezados).size !== encabezados.length) {
    throw new Error('CSV inválido: hay encabezados duplicados.');
  }

  return filas.slice(1).map((valores, indice) => {
    if (valores.length !== encabezados.length) {
      throw new Error(
        `CSV inválido en la fila ${indice + 2}: se esperaban ` +
          `${encabezados.length} columnas y llegaron ${valores.length}.`,
      );
    }
    return Object.fromEntries(
      encabezados.map((encabezado, posicion) => [
        encabezado,
        valores[posicion],
      ]),
    );
  });
}

function sedeDesdeCsv(fila: FilaCsv, numeroFila: number): Sede {
  const archivo = 'sedes.csv';
  return {
    codigo: requerido(fila, 'codigo', archivo, numeroFila),
    nombre: requerido(fila, 'nombre', archivo, numeroFila),
    direccion: requerido(fila, 'direccion', archivo, numeroFila),
    localidad: opcional(fila.localidad),
    coord: {
      lat: decimal(
        requerido(fila, 'lat', archivo, numeroFila),
        'lat',
        archivo,
        numeroFila,
      ),
      lng: decimal(
        requerido(fila, 'lng', archivo, numeroFila),
        'lng',
        archivo,
        numeroFila,
      ),
    },
    naturaleza: naturaleza(fila.naturaleza, archivo, numeroFila),
    complejidad: complejidad(fila.complejidad, archivo, numeroFila),
    telefono: opcional(fila.telefono),
    servicios: [],
    camas: [],
  };
}

function capacidadDesdeCsv(fila: FilaCsv, numeroFila: number): CamaSede {
  const archivo = 'capacidad.csv';
  return {
    tipo: requerido(fila, 'tipo_capacidad', archivo, numeroFila),
    total: enteroNoNegativo(
      requerido(fila, 'camas_reps', archivo, numeroFila),
      'camas_reps',
      archivo,
      numeroFila,
    ),
    ocupadasSnapshot: enteroNoNegativo(
      requerido(fila, 'ocupadas_snapshot', archivo, numeroFila),
      'ocupadas_snapshot',
      archivo,
      numeroFila,
    ),
  };
}

function requerido(
  fila: FilaCsv,
  columna: string,
  archivo: string,
  numeroFila: number,
): string {
  const valor = fila[columna]?.trim();
  if (!valor) {
    throw new Error(`${archivo}:${numeroFila} no tiene ${columna}.`);
  }
  return valor;
}

function opcional(valor: string | undefined): string | null {
  const limpio = valor?.trim();
  return limpio ? limpio : null;
}

function decimal(
  valor: string,
  columna: string,
  archivo: string,
  numeroFila: number,
): number {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    throw new Error(
      `${archivo}:${numeroFila} tiene ${columna} inválido: ${valor}.`,
    );
  }
  return numero;
}

function enteroNoNegativo(
  valor: string,
  columna: string,
  archivo: string,
  numeroFila: number,
): number {
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero < 0) {
    throw new Error(
      `${archivo}:${numeroFila} tiene ${columna} inválido: ${valor}.`,
    );
  }
  return numero;
}

function naturaleza(
  valor: string | undefined,
  archivo: string,
  numeroFila: number,
): Sede['naturaleza'] {
  const clave = sinTildes(valor?.trim().toLowerCase() ?? '');
  if (clave.includes('public')) return 'Pública';
  if (clave.includes('privad')) return 'Privada';
  if (clave.includes('mixt')) return 'Mixta';
  throw new Error(
    `${archivo}:${numeroFila} tiene naturaleza inválida: ${valor ?? ''}.`,
  );
}

function complejidad(
  valor: string | undefined,
  archivo: string,
  numeroFila: number,
): Complejidad {
  const limpia = valor?.trim().toLowerCase();
  if (limpia === 'baja' || limpia === 'media' || limpia === 'alta')
    return limpia;
  throw new Error(
    `${archivo}:${numeroFila} tiene complejidad inválida: ${valor ?? ''}.`,
  );
}

function sinTildes(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
