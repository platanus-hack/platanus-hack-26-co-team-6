/**
 * Mide la latencia REAL de la IA y la escribe en latencias-medidas.json.
 *
 * ── POR QUE ESTE ARCHIVO EXISTE ────────────────────────────────────
 * El doble de carga tiene que dormir lo que duerme Claude. Si duerme de menos,
 * la prueba dice que PULSO cumple un SLO que no cumple. Si duerme un numero
 * inventado, la prueba no dice nada de nada.
 *
 * Este script es la unica parte del harness que SI llama a Claude — pocas veces,
 * a proposito, y solo si se lo pides con todas las letras. Diez llamadas de
 * calibracion cuestan centavos; 3.000 llamadas de una prueba de carga, no.
 *
 * Usa `TriageResponse.latenciaMs`, que ya viaja en el contrato: no hace falta
 * instrumentar nada nuevo en core para tener este numero.
 *
 * Uso:
 *   CARGA_PASSWORD=... CALIBRAR_ACEPTO_COSTO=true node carga/calibrar.mjs
 *   CARGA_BASE=http://localhost:3001 CALIBRAR_N=10 ...
 *
 * ⚠️ Corre contra un core con ANTHROPIC_API_KEY (o con ai-core real). Si core
 *    esta degradado, lo detecta por `GET /capacidades` y se niega: calibrar
 *    contra la heuristica seria medir un `if` de palabras clave.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESTINO = join(AQUI, 'latencias-medidas.json');
const BASE = process.env.CARGA_BASE || 'http://localhost:3001';
const N = Number(process.env.CALIBRAR_N || 10);

const DICTADO =
  'Masculino de 58 anos, dolor toracico opresivo de una hora, sudoracion y ' +
  'disnea. Electro con elevacion del ST en cara anterior. Tension 90 sobre 60.';

if (process.env.CALIBRAR_ACEPTO_COSTO !== 'true') {
  console.error(
    'Esto llama a Claude de verdad y cuesta dinero.\n' +
      `Son ${N} llamadas. Si estas de acuerdo: CALIBRAR_ACEPTO_COSTO=true`,
  );
  process.exit(2);
}

const token = await entrar();
const cap = await pedir('/capacidades', token);
if (cap.ia !== 'llm') {
  console.error(
    `core dice ia: "${cap.ia}". Calibrar contra la heuristica seria medir un\n` +
      'if de palabras clave y guardarlo como si fuera la latencia del LLM.\n' +
      'Pon ANTHROPIC_API_KEY (o AI_CORE_BASE_URL con ai-core real) y repite.',
  );
  process.exit(3);
}

const muestras = [];
for (let i = 0; i < N; i++) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    // El dictado va en el cuerpo. Nunca en la URL: regla 5 del repo.
    body: JSON.stringify({ texto: DICTADO, tipoMovil: 'TAM' }),
  });
  const cuerpo = await res.json();
  if (!res.ok) {
    console.error(`llamada ${i + 1}: ${res.status} ${JSON.stringify(cuerpo)}`);
    continue;
  }
  // `latenciaMs` lo mide core de punta a punta de su propio triage; la resta
  // de relojes de aqui incluye la red hasta core. Se guarda el del servidor:
  // es lo que el doble tiene que imitar.
  const servidor = Number(cuerpo.latenciaMs) || Date.now() - t0;
  muestras.push(servidor);
  console.warn(`  ${i + 1}/${N}  ${servidor} ms  (motor: ${cuerpo.motor ?? '?'}, via: ${cuerpo.via ?? 'core'})`);
}

if (muestras.length < 3) {
  console.error('menos de 3 muestras utiles: no escribo nada.');
  process.exit(4);
}

const previo = JSON.parse(readFileSync(DESTINO, 'utf8'));
const ordenadas = [...muestras].sort((a, b) => a - b);
const perfil = {
  ...previo,
  estado: 'calibrado',
  medidoEn: new Date().toISOString(),
  medidoContra: `${BASE} · ia=${cap.ia} · ruteo=${cap.ruteo} · datos=${cap.datos}`,
  commit: commitActual(),
  triage: {
    ...previo.triage,
    muestras: ordenadas,
    resumen: {
      n: ordenadas.length,
      p50: percentil(ordenadas, 50),
      p95: percentil(ordenadas, 95),
      p99: percentil(ordenadas, 99),
      min: ordenadas[0],
      max: ordenadas[ordenadas.length - 1],
    },
  },
};
writeFileSync(DESTINO, `${JSON.stringify(perfil, null, 2)}\n`);
console.warn(
  `\nescrito ${DESTINO}\n  n=${ordenadas.length}  p50=${perfil.triage.resumen.p50} ms  ` +
    `p95=${perfil.triage.resumen.p95} ms  p99=${perfil.triage.resumen.p99} ms`,
);

// ── Piezas ────────────────────────────────────────────────────────

async function entrar() {
  const password = process.env.CARGA_PASSWORD;
  if (!password) {
    console.error('falta CARGA_PASSWORD (la de OPERADOR_PASSWORD).');
    process.exit(2);
  }
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    console.error(`login devolvio ${res.status}`);
    process.exit(2);
  }
  const galleta = res.headers.getSetCookie().find((c) => c.startsWith('pulso_sesion='));
  if (!galleta) {
    console.error('el login no dejo la cookie pulso_sesion');
    process.exit(2);
  }
  return decodeURIComponent(galleta.split(';')[0].slice('pulso_sesion='.length));
}

async function pedir(ruta, token) {
  const res = await fetch(`${BASE}${ruta}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`GET ${ruta} devolvio ${res.status}`);
    process.exit(2);
  }
  return res.json();
}

function percentil(ordenadas, p) {
  const i = Math.min(ordenadas.length - 1, Math.ceil((p / 100) * ordenadas.length) - 1);
  return ordenadas[Math.max(0, i)];
}

function commitActual() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: AQUI }).toString().trim();
  } catch {
    return null;
  }
}
