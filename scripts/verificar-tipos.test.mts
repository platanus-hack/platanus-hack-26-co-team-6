/**
 * Tests del verificador del espejo — tarea 0.7.
 *
 *   node --test scripts/verificar-tipos.test.mts
 *
 * Corredor nativo de Node, sin dependencia nueva: este script vive en la raíz
 * del monorepo, que no tiene ni jest ni vitest, y meter uno para dos archivos
 * sería peor que el problema.
 *
 * Lo que se prueba es el COMPORTAMIENTO que pide la tarea:
 *   · cambiar un tipo en core sin espejarlo → rojo, con el nombre del tipo
 *   · comentarios y comillas distintas → verde (los dos archivos difieren en
 *     eso a propósito y comparar texto daría rojo permanente)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comparar, firmas, firmasDeTexto } from './verificar-tipos.mts';

const par = (core: string, espejo: string, tolerar = false) =>
  comparar(firmasDeTexto(core, 'core.ts'), firmasDeTexto(espejo, 'espejo.ts'), tolerar);

// ── Lo que tiene que dar VERDE ───────────────────────────────────

test('comentarios distintos no son divergencia', () => {
  const core = `
    /** Codigo de servicio REPS. Sin tildes, como el resto de core. */
    export interface Caso { id: string }
  `;
  const espejo = `
    /**
     * Código de servicio del REPS de MinSalud.
     * En el front los comentarios van en español CON tildes, a propósito.
     */
    export interface Caso { id: string }
  `;
  assert.deepEqual(par(core, espejo).rotas, []);
});

test('comillas distintas no son divergencia', () => {
  // core usa simples, el front dobles. Prettier de cada app manda.
  const { rotas } = par(
    `export type Sexo = 'M' | 'F' | 'desconocido';`,
    `export type Sexo = "M" | "F" | "desconocido";`,
  );
  assert.deepEqual(rotas, []);
});

test('saltos de línea e indentación no son divergencia', () => {
  const core = `export interface Sede { codigo: string; nombre: string }`;
  const espejo = `
    export interface Sede {
      codigo: string;
      nombre: string;
    }
  `;
  assert.deepEqual(par(core, espejo).rotas, []);
});

test('lo que no se exporta no cuenta', () => {
  const { rotas } = par(
    `interface Interno { x: number }\nexport interface Caso { id: string }`,
    `export interface Caso { id: string }`,
  );
  assert.deepEqual(rotas, []);
});

// ── Lo que tiene que dar ROJO ────────────────────────────────────

test('un campo nuevo en core sin espejar da rojo y nombra el tipo', () => {
  const { rotas } = par(
    `export interface Caso { id: string; dxCie10?: string }`,
    `export interface Caso { id: string }`,
  );

  assert.equal(rotas.length, 1);
  assert.equal(rotas[0].nombre, 'Caso');
  assert.match(rotas[0].detalle.join('\n'), /falta en el espejo.*dxCie10/);
});

test('un campo que cambió de tipo da rojo con los dos tipos', () => {
  const { rotas } = par(
    `export interface Caso { triage: 1 | 2 | 3 | 4 | 5 }`,
    `export interface Caso { triage: number }`,
  );

  const texto = rotas[0].detalle.join('\n');
  assert.match(texto, /triage/);
  assert.match(texto, /core: `1\|2\|3\|4\|5`/);
  assert.match(texto, /espejo: `number`/);
});

test('un campo obligatorio en un lado y opcional en el otro da rojo', () => {
  // Es la divergencia más silenciosa: compila en los dos lados y revienta
  // en runtime cuando llega `undefined`.
  const { rotas } = par(
    `export interface Caso { origen: string }`,
    `export interface Caso { origen?: string }`,
  );
  assert.equal(rotas.length, 1);
  assert.equal(rotas[0].nombre, 'Caso');
});

test('un tipo nuevo en core sin espejar da rojo', () => {
  const { rotas } = par(
    `export interface Caso { id: string }\nexport type Nuevo = 'a' | 'b';`,
    `export interface Caso { id: string }`,
  );
  assert.equal(rotas.length, 1);
  assert.equal(rotas[0].nombre, 'Nuevo');
  assert.match(rotas[0].arreglo, /copia la declaración/);
});

test('un tipo que solo existe en el espejo también da rojo', () => {
  const { rotas } = par(``, `export interface Fantasma { x: number }`);
  assert.equal(rotas[0].nombre, 'Fantasma');
  assert.match(rotas[0].arreglo, /ese archivo es ley/);
});

test('un alias que cambió de valores da rojo', () => {
  const { rotas } = par(
    `export type Estado = 'enviado' | 'aceptado' | 'rechazado' | 'timeout';`,
    `export type Estado = 'enviado' | 'aceptado' | 'rechazado';`,
  );
  assert.equal(rotas[0].nombre, 'Estado');
});

test('interface en un lado y type en el otro da rojo', () => {
  const { rotas } = par(
    `export interface Coordenada { lat: number; lng: number }`,
    `export type Coordenada = { lat: number; lng: number };`,
  );
  assert.match(rotas[0].detalle.join('\n'), /core lo declara como `interface`/);
});

test('el mensaje dice qué hacer, no solo que falló', () => {
  const { rotas } = par(
    `export interface Caso { id: string; nuevo?: string }`,
    `export interface Caso { id: string }`,
  );
  assert.match(rotas[0].arreglo, /OPCIONAL en los dos lados/);
});

// ── La lista de tolerados ────────────────────────────────────────

test('sin tolerar, una divergencia declarada sigue siendo divergencia', () => {
  const core = `export interface TriageRequest { texto: string }`;
  assert.equal(par(core, ``, false).rotas.length, 1);
});

test('tolerando, la divergencia declarada sale de las rotas y queda listada', () => {
  const core = `export interface TriageRequest { texto: string }`;
  const { rotas, toleradas } = par(core, ``, true);
  assert.deepEqual(rotas, []);
  assert.equal(toleradas.length, 1);
  assert.match(toleradas[0], /TriageRequest/);
  // La razón viaja con la excepción: una lista sin razones es una lista muerta.
  assert.match(toleradas[0], /inline en lib\/api\.ts/);
});

test('tolerar un tipo NO tapa un cambio dentro de un tipo que sí está en los dos', () => {
  const { rotas } = par(
    `export interface Caso { id: string; nuevo: string }`,
    `export interface Caso { id: string }`,
    true,
  );
  assert.equal(rotas.length, 1);
  assert.equal(rotas[0].nombre, 'Caso');
});

// ── Contra los archivos de verdad ────────────────────────────────

test('los archivos reales del repo pasan el check', () => {
  const { rotas } = comparar(
    firmas('apps/backend/core/src/contracts/types.ts'),
    firmas('apps/frontend/lib/types.ts'),
    true,
  );
  assert.deepEqual(
    rotas.map((r) => r.nombre),
    [],
    'el espejo divergió: corre `node scripts/verificar-tipos.mts` para el detalle',
  );
});

test('el check corre en menos de 2 s', () => {
  const arranque = performance.now();
  comparar(
    firmas('apps/backend/core/src/contracts/types.ts'),
    firmas('apps/frontend/lib/types.ts'),
    true,
  );
  assert.ok(performance.now() - arranque < 2000);
});
