/**
 * Carga del prompt clínico canónico.
 *
 * ⚠️ EL PROMPT YA NO VIVE EN CÓDIGO. Está en `data/prompts/triage.txt`, junto
 * con `data/catalogos/servicios-reps.json`, y lo leen los DOS motores: este y
 * el de Python en `ai-core`.
 *
 * Antes existía dos veces, idéntico carácter por carácter, y la única garantía
 * de que siguieran iguales era acordarse. Dos motores clínicos que discrepan
 * sin que nadie se entere es el bug más caro que este sistema puede tener.
 *
 * Se lee del disco una vez y se cachea. En un contenedor el `data/` viaja con
 * la imagen; si algún día no viajara, esto revienta al arrancar y no en el
 * primer dictado — que es el orden correcto para fallar.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MARCADOR = '{{CATALOGO_SERVICIOS}}';

interface CatalogoReps {
  servicios: Record<string, string>;
  seleccionables: number[];
  urgencias: number;
}

/**
 * `core/src/prompts/` → `core/src/` → `core/` → `backend/` → `apps/` → raíz.
 * Se resuelve desde `__dirname` y no desde `process.cwd()`: el cwd depende de
 * desde dónde se lanzó el proceso, y en producción no es el que uno cree.
 */
const RAIZ = join(__dirname, '..', '..', '..', '..', '..');
const PLANTILLA = join(RAIZ, 'data', 'prompts', 'triage.txt');
const CATALOGO = join(RAIZ, 'data', 'catalogos', 'servicios-reps.json');

let cache: { prompt: string; version: string } | null = null;

function renderizar(): string {
  const plantilla = readFileSync(PLANTILLA, 'utf8');
  // Las líneas de comentario son para quien edita el archivo, no para el
  // modelo.
  const cuerpo = plantilla
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .trim();

  const cat = JSON.parse(readFileSync(CATALOGO, 'utf8')) as CatalogoReps;
  // El ORDEN es el de `seleccionables`, no el numérico: cambiarlo cambiaría el
  // prompt y con él la salida del modelo. Es contenido, no formato.
  const lineas = cat.seleccionables
    .map((cod) => `  ${cod} = ${cat.servicios[String(cod)]}`)
    .join('\n');

  return cuerpo.replace(MARCADOR, lineas);
}

function cargar(): { prompt: string; version: string } {
  if (!cache) {
    const prompt = renderizar();
    cache = {
      prompt,
      // Se deriva del contenido, así que cambiar el prompt cambia la versión
      // sola. Prepara la tarea 3.12.
      version: createHash('sha256').update(prompt, 'utf8').digest('hex').slice(0, 12),
    };
  }
  return cache;
}

export function promptTriage(): string {
  return cargar().prompt;
}

export function versionPrompt(): string {
  return cargar().version;
}

/** Sólo para tests. */
export function limpiarCache(): void {
  cache = null;
}
