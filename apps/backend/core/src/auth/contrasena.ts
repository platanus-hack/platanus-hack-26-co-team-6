/**
 * Hash de contraseñas — tarea 1.3, paso 2.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  POR QUE NO `sha256` SIN SAL
 * ═══════════════════════════════════════════════════════════════════
 *  Lo que habia era `sha256(password)` sin sal. Para una contraseña de
 *  turno efimera, compartida y rotada a diario, alcanzaba. Para las
 *  credenciales de una persona —que reusa contraseñas, que dura años— es
 *  inaceptable: sha256 esta hecho para ser RAPIDO, y eso es exactamente lo
 *  que no se quiere aqui. Una GPU prueba miles de millones por segundo, y
 *  sin sal una tabla precomputada las rompe todas de una vez.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  ARGON2ID SI ESTA, SCRYPT SI NO — Y SE DICE CUAL
 * ═══════════════════════════════════════════════════════════════════
 *  El plan pide **Argon2id** y es lo correcto. `argon2` es un modulo nativo
 *  y este archivo no puede instalarlo solo, asi que se carga si esta
 *  presente y, si no, se usa **scrypt del propio Node** — que tambien es
 *  memory-hard y tambien es una KDF de contraseñas aceptada. Lo que NUNCA
 *  ocurre es caer a sha256, ni a texto plano, ni a "cualquiera entra":
 *  **la autenticacion es la unica excepcion a la regla de degradar**, y un
 *  fallback abierto aqui ES la vulnerabilidad.
 *
 *  Para cerrar el paso que falta:
 *
 *      pnpm --filter core add argon2
 *
 *  No hay que tocar una linea de este archivo ni migrar hashes: el prefijo
 *  del hash dice con que se creo, `verificar()` entiende los dos formatos y
 *  `requiereRehash()` avisa cuando toca re-hashear al siguiente login.
 */

import { Logger } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const log = new Logger('Contrasena');

/**
 * `promisify` pierde la sobrecarga con opciones de `scrypt`, y las opciones
 * son justo lo que fija el coste. Se re-declara el tipo aqui en vez de
 * renunciar a ellas.
 */
const scryptAsync = promisify(scrypt) as (
  clave: string,
  sal: Buffer,
  largo: number,
  opciones: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * OWASP da tres combinaciones equivalentes en trabajo para scrypt:
 * N=2^17,r=8,p=1 · N=2^16,r=8,p=2 · **N=2^15,r=8,p=3**.
 *
 * Se elige la tercera por la memoria: las tres cuestan lo mismo en CPU, pero
 * la primera reserva ~134 MB POR HASH EN VUELO. Con varios logins a la vez
 * —o con alguien probando contraseñas a proposito— eso es un camino directo
 * a tumbar core por memoria. 33 MB por hash aguanta la concurrencia real de
 * un turno sin regalar trabajo al que ataca.
 */
const SCRYPT = { N: 1 << 15, r: 8, p: 3, largo: 32 } as const;

/** §3.6. No es un capricho: 12 es donde una passphrase deja de ser adivinable. */
export const LARGO_MINIMO = 12;

export type Algoritmo = 'argon2id' | 'scrypt';

/**
 * El especificador va en una variable a proposito: con un literal, TypeScript
 * exigiria que `argon2` este instalado para compilar, y la gracia es que core
 * compile y arranque este o no.
 */
const MODULO_ARGON2 = 'argon2';

interface ModuloArgon2 {
  hash(clave: string, opciones: { type: number }): Promise<string>;
  verify(hash: string, clave: string): Promise<boolean>;
  argon2id: number;
}

let argon2: ModuloArgon2 | null = null;
let resuelto = false;

/**
 * `import()` de un especificador dinamico devuelve `any`. Se le pone tipo
 * aqui, una vez, en vez de dejar que ese `any` se derrame por el resto.
 */
const importarArgon2 = ((especificador: string) => import(especificador)) as (
  especificador: string,
) => Promise<ModuloArgon2>;

async function cargarArgon2(): Promise<ModuloArgon2 | null> {
  if (resuelto) return argon2;
  resuelto = true;
  try {
    argon2 = await importarArgon2(MODULO_ARGON2);
    log.log('Argon2id activo para contraseñas.');
  } catch {
    argon2 = null;
    log.warn(
      'argon2 no instalado: las contraseñas se hashean con scrypt ' +
        '(N=2^15, r=8, p=3, memory-hard, con sal por hash). Es una KDF ' +
        'legitima, no un modo abierto. Para Argon2id: pnpm --filter core add ' +
        'argon2 — los hashes viejos siguen validando solos.',
    );
  }
  return argon2;
}

/** Cual se esta usando ahora mismo. Lo reporta el arranque. */
export async function algoritmoActivo(): Promise<Algoritmo> {
  return (await cargarArgon2()) ? 'argon2id' : 'scrypt';
}

export async function hashear(clave: string): Promise<string> {
  if (clave.length < LARGO_MINIMO)
    throw new Error(
      `La contraseña necesita al menos ${LARGO_MINIMO} caracteres`,
    );

  const modulo = await cargarArgon2();
  if (modulo) return modulo.hash(clave, { type: modulo.argon2id });

  const sal = randomBytes(16);
  const derivada = await scryptAsync(clave, sal, SCRYPT.largo, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    // Sin esto Node rechaza estos parametros por su tope de memoria (32 MB).
    maxmem: 128 * 1024 * 1024,
  });

  return `$scrypt$N=${SCRYPT.N},r=${SCRYPT.r},p=${SCRYPT.p}$${sal.toString(
    'base64',
  )}$${derivada.toString('base64')}`;
}

/**
 * ¿Coincide? Nunca lanza: un hash corrupto es un `false`, no un 500 que le
 * diga a quien prueba que ese usuario existe y tiene el registro roto.
 */
export async function verificar(clave: string, hash: string): Promise<boolean> {
  try {
    if (hash.startsWith('$argon2')) {
      const modulo = await cargarArgon2();
      // Hash de Argon2 y el modulo ya no esta: NO se deja pasar. Prefiero un
      // login que falla y se ve, a uno que valida con algo mas debil.
      return modulo ? modulo.verify(hash, clave) : false;
    }

    if (hash.startsWith('$scrypt$')) {
      const [, , parametros, salB64, esperadoB64] = hash.split('$');
      const { N, r, p } = leerParametros(parametros);
      const esperado = Buffer.from(esperadoB64, 'base64');
      const derivada = await scryptAsync(
        clave,
        Buffer.from(salB64, 'base64'),
        esperado.length,
        { N, r, p, maxmem: 128 * 1024 * 1024 },
      );
      return igual(derivada, esperado);
    }

    return false;
  } catch {
    return false;
  }
}

/** true si el hash quedo con un algoritmo mas debil que el activo hoy. */
export async function requiereRehash(hash: string): Promise<boolean> {
  return (
    (await algoritmoActivo()) === 'argon2id' && !hash.startsWith('$argon2')
  );
}

function leerParametros(texto: string): { N: number; r: number; p: number } {
  const valores = Object.fromEntries(
    texto.split(',').map((par) => {
      const [clave, valor] = par.split('=');
      return [clave, Number(valor)];
    }),
  );
  return { N: valores.N, r: valores.r, p: valores.p };
}

/** timingSafeEqual revienta si las longitudes difieren; esto no. */
function igual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
