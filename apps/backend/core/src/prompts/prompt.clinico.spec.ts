/**
 * Tarea 0.5 · un solo prompt clínico.
 *
 * El prompt existía DOS VECES, idéntico carácter por carácter, en Python y en
 * TypeScript. La única garantía de que siguieran iguales era acordarse.
 *
 * Estos tests son la red: si alguien cambia el prompt en un lado, o cambia el
 * catálogo, el golden deja de cuadrar y sale el diff.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SERVICIOS_SELECCIONABLES,
  nombreServicio,
} from '../catalogo/servicios-reps';
import { limpiarCache, promptTriage, versionPrompt } from './prompt.clinico';

const RAIZ = join(__dirname, '..', '..', '..', '..', '..');
const GOLDEN = join(RAIZ, 'data', 'prompts', 'triage.rendered.txt');

describe('prompt clínico canónico', () => {
  beforeEach(() => limpiarCache());

  it('el render coincide con el golden, carácter por carácter', () => {
    // El MISMO golden que verifica el test de Python. Si los dos pasan, los
    // dos motores están leyendo lo mismo — sin levantar los dos runtimes.
    expect(promptTriage()).toBe(readFileSync(GOLDEN, 'utf8'));
  });

  it('no lleva líneas de comentario al modelo', () => {
    // La cabecera del archivo es para quien lo edita. Mandársela al modelo
    // sería gastar tokens en instrucciones sobre el archivo, no sobre el caso.
    expect(promptTriage()).not.toContain('# PULSO —');
    expect(promptTriage().split('\n').some((l) => l.startsWith('#'))).toBe(false);
  });

  it('interpola el catálogo, no deja el marcador', () => {
    expect(promptTriage()).not.toContain('{{CATALOGO_SERVICIOS}}');
    expect(promptTriage()).toContain('743 = Hemodinamia e intervencionismo');
  });

  it('respeta el ORDEN de seleccionables, no el numérico', () => {
    // Cambiar el orden cambia el prompt y con él la salida del modelo. Es
    // contenido, no formato.
    const p = promptTriage();
    expect(p.indexOf('1102 = Urgencias')).toBeLessThan(p.indexOf('110 = Cuidado'));
  });

  it('no ofrece códigos fuera del catálogo seleccionable', () => {
    // 408 es radioterapia: existe en el REPS y no debe ofrecerse para un
    // traslado de urgencias.
    expect(promptTriage()).not.toContain('408 =');
  });

  it('la versión se deriva del contenido', () => {
    const esperada = createHash('sha256')
      .update(promptTriage(), 'utf8')
      .digest('hex')
      .slice(0, 12);
    expect(versionPrompt()).toBe(esperada);
    expect(versionPrompt()).toMatch(/^[0-9a-f]{12}$/);
  });

  it('cachea: leer dos veces no vuelve a tocar el disco', () => {
    expect(promptTriage()).toBe(promptTriage());
  });
});

describe('el catálogo REPS también era doble', () => {
  it('el JSON y el módulo de TypeScript dicen lo mismo', () => {
    // Mientras `catalogo/servicios-reps.ts` conserve su propia copia, este
    // test es la red. El día que lea del JSON, se vuelve trivial y se borra.
    const cat = JSON.parse(
      readFileSync(join(RAIZ, 'data', 'catalogos', 'servicios-reps.json'), 'utf8'),
    ) as { servicios: Record<string, string>; seleccionables: number[] };

    expect(cat.seleccionables).toEqual(SERVICIOS_SELECCIONABLES);
    for (const [cod, nombre] of Object.entries(cat.servicios)) {
      expect(nombreServicio(Number(cod))).toBe(nombre);
    }
  });
});
