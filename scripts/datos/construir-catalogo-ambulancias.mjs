/**
 * Compila `data/procesado/ambulancias.json` a un .ts que se pueda importar.
 *
 *   node scripts/datos/construir-catalogo-ambulancias.mjs
 *
 * ── POR QUÉ COMPILAR UN JSON QUE YA EXISTE ────────────────────────
 * Por la misma razón que `sedes/catalogo.generado.ts`: core tiene que poder
 * verificar afiliaciones SIN Supabase, y `dist/` no lleva `data/` adentro. Un
 * `readFileSync('data/procesado/ambulancias.json')` funciona en el repo y
 * revienta en el despliegue.
 *
 * ── POR QUÉ ESTÁ EN NODE Y NO EN construir.py ─────────────────────
 * `scripts/datos/construir.py` es el pipeline de DATOS: lee las fuentes crudas
 * de `data/` y produce `data/procesado/`. Esto es el paso siguiente y de otra
 * naturaleza — mover un JSON ya procesado a código del servicio — y meterlo
 * ahí acoplaría el pipeline a la estructura de `apps/backend/core/src/`.
 *
 * La transformación es un renombre de campos 1:1 y nada más. Si algún día hay
 * que decidir algo sobre el dato, la decisión va en el transformador de
 * Python, no aquí.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENTRADA = join(RAIZ, 'data', 'procesado', 'ambulancias.json');
const SALIDA = join(
  RAIZ,
  'apps',
  'backend',
  'core',
  'src',
  'afiliacion',
  'catalogo-ambulancias.generado.ts',
);

const bruto = JSON.parse(readFileSync(ENTRADA, 'utf8'));

const filas = bruto.prestadores.map((p) => ({
  prestador: p.prestador,
  sede: p.sede,
  direccion: p.direccion ?? null,
  telefono: p.telefono ?? null,
  correo: p.email ?? null,
  // La fuente NO publica NIT. El campo existe porque el cruce por NIT es el
  // camino preferido del módulo de afiliación y no queremos cambiar la lógica
  // el día que la Secretaría publique la columna.
  nit: null,
  tab: Boolean(p.basico),
  tam: Boolean(p.medicalizado),
  urgencias: Boolean(p.urgencias),
}));

const cabecera = `/**
 * ARCHIVO GENERADO — no editar a mano.
 *
 * Lo produce \`node scripts/datos/construir-catalogo-ambulancias.mjs\` desde
 * \`data/procesado/ambulancias.json\` (que a su vez sale del CSV de transporte
 * especial de pacientes de la Secretaria de Salud). Cualquier cambio aqui se
 * pierde en la siguiente corrida: para cambiar el contenido se cambia la
 * fuente o su transformador.
 *
 * La transformacion es un renombre de campos 1:1:
 *
 *     email        -> correo
 *     basico       -> tab   (Transporte Asistencial Basico)
 *     medicalizado -> tam   (Transporte Asistencial Medicalizado)
 *
 * Se compila, en vez de leerse de data/, por lo mismo que
 * \`sedes/catalogo.generado.ts\`: sin Supabase el modulo tiene que seguir
 * verificando afiliaciones, y \`dist/\` no lleva data/ adentro.
 *
 * Generado: ${new Date().toISOString().slice(0, 10)}
 * Fuente:   data/procesado/ambulancias.json
 *           (${bruto.fuente})
 */

import type { OperadorAmbulancia } from './tipos';

/**
 * ${bruto.total} prestadores de transporte asistencial de Bogota.
 * ${bruto.conBasico} con marca TAB, ${bruto.conMedicalizado} con TAM. Ver data/CATALOGO.md.
 *
 * \`nit\` va en null en las ${bruto.total}: la fuente publica razon social, sede,
 * direccion, telefono y correo, pero NO el NIT.
 */
export const AMBULANCIAS_CATALOGO: OperadorAmbulancia[] = `;

writeFileSync(SALIDA, cabecera + JSON.stringify(filas, null, 2) + ';\n', 'utf8');

console.log(
  `catalogo-ambulancias.generado.ts · ${filas.length} prestadores ` +
    `(${filas.filter((f) => f.tab).length} TAB, ${filas.filter((f) => f.tam).length} TAM)`,
);
