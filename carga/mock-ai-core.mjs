/**
 * El doble de carga de ai-core. Node puro, sin dependencias.
 *
 * ── POR QUE EXISTE, SI LA REGLA DEL REPO ES DEGRADAR ───────────────
 * La regla 2 dice: sin `ANTHROPIC_API_KEY` la IA cae a heuristica. Perfecto
 * para no gastar plata... salvo que la heuristica devuelve `confianza: 0.35`
 * fijo (`triage-heuristico.ts`) y `clinical-policy.ts` rechaza todo lo que baje
 * de 0.5. Resultado: en modo degradado **POST /triage responde 400
 * PULSO_LOW_CONFIDENCE el 100% de las veces** y una prueba de carga mediria
 * cuanto tarda un 400.
 *
 * Este servidor resuelve eso sin inventar un mock nuevo dentro de core: se
 * mete por la costura que core YA tiene, `AI_CORE_BASE_URL`. Core lo llama
 * exactamente igual que llamaria a ai-core de verdad (`AiCoreClient`), y este
 * devuelve una extraccion coherente con la confianza por encima de la puerta
 * clinica, tras dormir la latencia configurada.
 *
 *   AI_CORE_BASE_URL=http://localhost:8000  ← core apunta aqui
 *   MAPBOX_TOKEN sin poner                  ← el ETA cae a distancia (regla)
 *   TELEGRAM_/WHATSAPP_ sin poner           ← el handshake se imprime (regla)
 *   ANTHROPIC_API_KEY sin poner             ← core no llama a Claude jamas
 *
 * Se identifica como `ai-core-falso-de-carga` en `GET /health`, y core lo
 * republica en `GET /health/ai-core`. Asi `lib/preflight.js` puede DISTINGUIR
 * este doble de un ai-core real y abortar si alguien esta a punto de gastar
 * dinero sin querer.
 *
 * ── LA LATENCIA NO ES INVENTADA, PERO TAMPOCO ESTA MEDIDA ──────────
 * Sale de `latencias-medidas.json`. Mientras ese archivo diga
 * `estado: "sin-calibrar"`, la banda es la UNICA cifra que el repo documenta
 * (plan maestro §4.1: triage+match+dispatch "es 4-8 segundos con Claude") y es
 * una COTA DE DOCUMENTO, no una medicion. `node carga/calibrar.mjs` la
 * reemplaza por muestras reales. El servidor lo grita al arrancar y lo dice en
 * su propio nombre de servicio.
 *
 * Uso:
 *   node carga/mock-ai-core.mjs                 # puerto 8000
 *   MOCK_PUERTO=8010 node carga/mock-ai-core.mjs
 *   MOCK_LATENCIA_MS=250 node carga/mock-ai-core.mjs   # fija, para depurar
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.MOCK_PUERTO || 8000);
const LATENCIA_FIJA = process.env.MOCK_LATENCIA_MS
  ? Number(process.env.MOCK_LATENCIA_MS)
  : null;

const perfil = cargarPerfil();
const CALIBRADO = perfil.estado === 'calibrado' && perfil.triage.muestras.length > 0;
const NOMBRE = `ai-core-falso-de-carga(${CALIBRADO ? 'calibrado' : 'sin-calibrar'})`;

/**
 * Extracciones canonicas. Espejan `lib/dictados.js` — si cambias uno, cambia el
 * otro: el punto es que el ranking tenga a quien elegir. Los servicios REPS
 * estan escogidos para que SIEMPRE queden sedes compatibles entre las 84
 * semillas (743→25 sedes, 110→47, 203→47, 320→47, 744→47, 712→84).
 */
const GUIONES = [
  {
    clave: /dolor toracico|elevacion del ST/i,
    resumen: 'Varon 58, IAM con elevacion del ST, hipotenso',
    triage: 1,
    dxCie10: 'I21.0',
    dxDescripcion: 'Infarto agudo de miocardio con elevacion del ST',
    serviciosRequeridos: [743, 110],
    complejidadRequerida: 'alta',
    edad: 58,
    sexo: 'M',
    signosAlarma: ['elevacion del ST', 'hipotension', 'diaforesis'],
    requiereMedicoABordo: true,
  },
  {
    clave: /trauma abdominal|abdomen en tabla/i,
    resumen: 'Mujer 34, trauma abdominal cerrado con sospecha de sangrado',
    triage: 1,
    dxCie10: 'S36.9',
    dxDescripcion: 'Trauma abdominal cerrado con sospecha de sangrado',
    serviciosRequeridos: [203, 110],
    complejidadRequerida: 'alta',
    edad: 34,
    sexo: 'F',
    signosAlarma: ['taquicardia', 'abdomen en tabla'],
    requiereMedicoABordo: true,
  },
  {
    clave: /hemiparesia|afasia/i,
    resumen: 'Varon 71, ACV isquemico en ventana',
    triage: 1,
    dxCie10: 'I63.9',
    dxDescripcion: 'Ataque cerebrovascular isquemico en ventana',
    serviciosRequeridos: [744, 110],
    complejidadRequerida: 'alta',
    edad: 71,
    sexo: 'M',
    signosAlarma: ['deficit motor subito', 'afasia'],
    requiereMedicoABordo: true,
  },
  {
    clave: /gestante|sangrado vaginal/i,
    resumen: 'Mujer 26, gestante 38 semanas, sospecha de abrupcio',
    triage: 2,
    dxCie10: 'O45.9',
    dxDescripcion: 'Sospecha de abrupcio de placenta',
    serviciosRequeridos: [320, 110],
    complejidadRequerida: 'alta',
    edad: 26,
    sexo: 'F',
    signosAlarma: ['sangrado abundante', 'gestante a termino'],
    requiereMedicoABordo: true,
  },
  {
    clave: /arma blanca|neumotorax|murmullo vesicular/i,
    resumen: 'Varon 44, herida penetrante de torax con disnea',
    triage: 1,
    dxCie10: 'S21.9',
    dxDescripcion: 'Herida penetrante de torax, sospecha de neumotorax',
    serviciosRequeridos: [203, 744],
    complejidadRequerida: 'alta',
    edad: 44,
    sexo: 'M',
    signosAlarma: ['disnea progresiva', 'hipoventilacion unilateral'],
    requiereMedicoABordo: true,
  },
  {
    clave: /glucometria|hipoglucemia/i,
    resumen: 'Mujer 63, hipoglucemia severa con compromiso de conciencia',
    triage: 2,
    dxCie10: 'E16.2',
    dxDescripcion: 'Hipoglucemia severa con compromiso de conciencia',
    serviciosRequeridos: [110, 712],
    complejidadRequerida: 'media',
    edad: 63,
    sexo: 'F',
    signosAlarma: ['glucometria en 42', 'alteracion de conciencia'],
    requiereMedicoABordo: false,
  },
];

/**
 * Para un dictado que no reconoce. `712` (toma de muestras) lo tienen las 84
 * sedes: un dictado desconocido no puede quedarse sin candidatos por culpa del
 * doble — eso confundiria un problema del harness con un ranking vacio real.
 */
const GENERICO = {
  resumen: 'Paciente con cuadro agudo, requiere valoracion en urgencias',
  triage: 3,
  dxCie10: null,
  dxDescripcion: 'Cuadro agudo sin filiar',
  serviciosRequeridos: [712],
  complejidadRequerida: 'media',
  edad: null,
  sexo: 'ND',
  signosAlarma: ['sintoma agudo referido por la tripulacion'],
  requiereMedicoABordo: false,
};

const servidor = createServer(async (req, res) => {
  const ruta = (req.url || '').split('?')[0];

  if (req.method === 'GET' && ruta === '/health') {
    return responder(res, 200, { status: 'ok', service: NOMBRE });
  }

  if (req.method === 'POST' && ruta === '/v1/triage') {
    let cuerpo;
    try {
      cuerpo = JSON.parse(await leer(req));
    } catch {
      return responder(res, 400, { detail: 'cuerpo ilegible' });
    }
    const espera = muestraDeLatencia();
    await dormir(espera);
    return responder(res, 200, triageFalso(cuerpo, espera));
  }

  // Todo lo demas es 404 explicito: si core empieza a llamar una ruta nueva de
  // ai-core, es mejor enterarse por un 404 en el log que por un numero raro.
  responder(res, 404, {
    detail: `el doble de carga no implementa ${req.method} ${ruta}`,
  });
});

servidor.listen(PUERTO, () => {
  const linea = '─'.repeat(72);
  console.warn(linea);
  console.warn(`[PULSO · carga] doble de ai-core en http://localhost:${PUERTO}`);
  console.warn(`  se identifica como: ${NOMBRE}`);
  console.warn(
    LATENCIA_FIJA !== null
      ? `  latencia FIJA de ${LATENCIA_FIJA} ms (MOCK_LATENCIA_MS)`
      : `  latencia: ${describirLatencia()}`,
  );
  if (!CALIBRADO && LATENCIA_FIJA === null) {
    console.warn(
      '  ⚠️  SIN CALIBRAR. La banda sale del plan maestro §4.1 ("4-8 segundos\n' +
        '      con Claude" para triage+match+dispatch), que es una COTA DE\n' +
        '      DOCUMENTO, no una medicion. Corre `node carga/calibrar.mjs`\n' +
        '      contra un core con credenciales para reemplazarla por muestras.',
    );
  }
  console.warn(`  apunta core aqui:  AI_CORE_BASE_URL=http://localhost:${PUERTO}`);
  console.warn(linea);
});

// ── Piezas ────────────────────────────────────────────────────────

function triageFalso(cuerpo, latenciaMs) {
  const texto = String(cuerpo?.texto ?? '');
  const guion = GUIONES.find((g) => g.clave.test(texto)) ?? GENERICO;
  const { clave, ...extraccion } = guion;

  return {
    caso: {
      ...extraccion,
      // Por encima de 0.5, que es la puerta de clinical-policy.ts. No es 0.95
      // a proposito: un numero perfecto esconderia el dia que la puerta se
      // mueva. 0.72 es "el LLM contesto y se le cree", que es lo que simula.
      confianza: 0.72,
      id: randomUUID(),
      textoCrudo: texto,
      origen: cuerpo?.origen ?? { lat: 4.5981, lng: -74.0758 },
      tipoMovil: cuerpo?.tipoMovil ?? 'TAB',
      unidad: cuerpo?.unidad ?? null,
      telefonoReporta: cuerpo?.telefonoReporta ?? null,
      creadoEn: new Date().toISOString(),
    },
    latenciaMs,
    motor: 'claude',
  };
}

/**
 * Una muestra de la distribucion. Si hay muestras reales se sortea una de
 * ellas (bootstrap: conserva la forma de la cola, que es lo que importa para
 * un p99); si no, uniforme dentro de la banda del documento.
 */
function muestraDeLatencia() {
  if (LATENCIA_FIJA !== null) return LATENCIA_FIJA;
  const m = perfil.triage.muestras;
  if (m.length) return m[Math.floor(Math.random() * m.length)];
  const { minMs, maxMs } = perfil.triage.banda;
  return Math.round(minMs + Math.random() * (maxMs - minMs));
}

function describirLatencia() {
  const m = perfil.triage.muestras;
  if (m.length) return `bootstrap sobre ${m.length} muestras medidas (${perfil.medidoEn})`;
  return `uniforme en [${perfil.triage.banda.minMs}, ${perfil.triage.banda.maxMs}] ms — ${perfil.triage.banda.procedencia}`;
}

function cargarPerfil() {
  try {
    return JSON.parse(readFileSync(join(AQUI, 'latencias-medidas.json'), 'utf8'));
  } catch (e) {
    console.error(`[carga] no pude leer latencias-medidas.json: ${e.message}`);
    process.exit(1);
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function leer(req) {
  return new Promise((resolve, reject) => {
    let datos = '';
    req.on('data', (c) => (datos += c));
    req.on('end', () => resolve(datos));
    req.on('error', reject);
  });
}

function responder(res, codigo, cuerpo) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(texto),
  });
  res.end(texto);
}
