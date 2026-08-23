/**
 * Lo que se comprueba ANTES de medir nada.
 *
 * ── LA TRAMPA QUE NOMBRA LA TAREA 5.7 ──────────────────────────────
 * "Con AlmacenService en memoria, la prueba mide un sistema que no existe.
 *  Corre esto despues de 1.2, o no significa nada."
 *
 * La tarea 1.2 (persistir caso y handshake en Postgres) NO esta hecha. El
 * estado de core vive en un `Map` en RAM (apps/backend/core/src/almacen/).
 * Un Map no tiene pool, no tiene `SET LOCAL`, no tiene indices, no tiene
 * contencion de escritura y no se cae cuando se reinicia el proceso: medirlo
 * es medir la velocidad de V8, no la de PULSO.
 *
 * Por eso este modulo NO deja que una corrida se presente como concluyente
 * mientras esa condicion siga. No bloquea la corrida — bloquea la mentira.
 *
 * ── COMO LO DETECTA ────────────────────────────────────────────────
 * `GET /capacidades` es la ventana honesta del repo: dice en que modo corre
 * cada pieza. Pero HOY NO TIENE UN CAMPO PARA EL ALMACEN DE CASOS — solo
 * `datos: 'supabase' | 'semillas'`, que habla del catalogo de sedes. Asi que
 * se usa como PROXY y se dice que es un proxy.
 *
 *   → Lo que hace falta de 1.2 (ademas de persistir): un campo nuevo y
 *     OPCIONAL en `Capacidades`, del estilo `estado?: 'postgres' | 'memoria'`.
 *     Ese cambio toca contracts/types.ts y su espejo, asi que le toca al
 *     dueño de tipos de la ola, no a esta tarea.
 *
 * ── LAS OTRAS TRES COMPROBACIONES SON DE PLATA Y DE VERGUENZA ──────
 * Sin ellas, una prueba de carga llama 3.000 veces a Claude (cuesta dinero y
 * mide a Anthropic, no a PULSO), agota la cuota de Mapbox, y le manda 3.000
 * mensajes de Telegram al celular del jefe de urgencias del demo.
 */

import http from 'k6/http';
import exec from 'k6/execution';

const si = (v) => String(v) === 'true';

/**
 * @returns {{capacidades: object, conclusiva: boolean, motor: string,
 *            avisos: string[], razones: string[]}}
 */
export function revisarPrecondiciones(base, token) {
  const cap = pedirCapacidades(base, token);
  const upstream = sondearAiCore(base);
  const esMock = /falso|mock|carga/i.test(upstream ?? '');

  const avisos = [];
  const razones = [];
  const abortar = [];

  // 1. El almacen. La trampa de la tarea.
  if (cap.datos !== 'supabase') {
    razones.push(
      'El catalogo corre en semillas (`datos: "semillas"`), asi que casi seguro ' +
        'no hay Postgres detras y el estado de casos y handshakes vive en el ' +
        'Map de AlmacenService. LA TAREA 1.2 NO ESTA HECHA: estos numeros no ' +
        'miden el sistema que se va a desplegar.',
    );
  } else {
    avisos.push(
      'Ojo: `datos: "supabase"` dice que el CATALOGO DE SEDES sale de la base. ' +
        'No dice nada del almacen de casos. Hasta que `Capacidades` traiga un ' +
        'campo propio (1.2), esto es un proxy, no una prueba.',
    );
  }

  // 2. Claude de verdad. Cuesta dinero y mide a otro.
  if (cap.ia === 'llm' && !esMock) {
    abortar.push(
      'core dice `ia: "llm"` y ai-core no se identifica como el doble de ' +
        `carga (upstream: ${upstream ?? 'inalcanzable'}). Esta corrida llamaria ` +
        'a Claude de verdad: cuesta dinero y mide la latencia de Anthropic, no ' +
        'la de PULSO. Levanta `node carga/mock-ai-core.mjs` y apunta ' +
        'AI_CORE_BASE_URL ahi. Si de verdad quieres medir contra Claude: ' +
        'CARGA_ACEPTO_COSTO=true.',
    );
  }
  if (esMock) {
    avisos.push(`ai-core es el doble de carga (${upstream}). Latencia inyectada.`);
  }

  // 3. La heuristica NO pasa la puerta clinica. Esto sorprende a todo el mundo.
  if (cap.ia === 'heuristico') {
    abortar.push(
      'core corre en modo heuristico (sin ANTHROPIC_API_KEY y sin ai-core). ' +
        'El extractor heuristico devuelve `confianza: 0.35` y ' +
        'clinical-policy.ts rechaza todo lo que baje de 0.5, asi que ' +
        'POST /triage responderia 400 PULSO_LOW_CONFIDENCE en el 100% de las ' +
        'iteraciones y no habria nada que medir. Levanta el doble de carga ' +
        '(`node carga/mock-ai-core.mjs`). Si quieres medir justamente ese 400: ' +
        'CARGA_ACEPTO_HEURISTICA=true.',
    );
  }

  // 4. Mapbox de verdad: cuota y dinero.
  if (cap.ruteo === 'trafico') {
    abortar.push(
      'core dice `ruteo: "trafico"`: cada /match y cada /dispatch pegaria a la ' +
        'Matrix API de Mapbox. Quita MAPBOX_TOKEN del entorno de core y el ETA ' +
        'cae a distancia (22 km/h), que es la regla del repo. ' +
        'Para forzarlo igual: CARGA_ACEPTO_COSTO=true.',
    );
  }

  // 5. Canal real: 50 VUs por 5 minutos son miles de mensajes a un humano.
  if (cap.canal !== 'consola') {
    abortar.push(
      `core notificaria por ${cap.canal}: esta prueba le mandaria miles de ` +
        'mensajes a un chat real. Quita TELEGRAM_BOT_TOKEN / WHATSAPP_TOKEN del ' +
        'entorno de core (el handshake se imprime en el log, que es el modo ' +
        '"consola"). Para forzarlo igual: CARGA_ACEPTO_COSTO=true.',
    );
  }

  const perdonados = perdonar(abortar);
  imprimir(cap, upstream, razones, avisos, perdonados);

  if (perdonados.length) {
    exec.test.abort(
      'precondiciones no cumplidas — ver el bloque de arriba. Ninguna de estas ' +
        'comprobaciones es opinion: o cuesta dinero, o le escribe a un humano, ' +
        'o mide 400s.',
    );
  }

  return {
    capacidades: cap,
    conclusiva: razones.length === 0,
    motor: esMock ? `mock:${upstream}` : cap.ia,
    avisos,
    razones,
  };
}

/** Las que el operador NO perdono con una variable de entorno explicita. */
function perdonar(abortar) {
  const costo = si(__ENV.CARGA_ACEPTO_COSTO);
  const heuristica = si(__ENV.CARGA_ACEPTO_HEURISTICA);
  return abortar.filter((linea) => {
    if (/CARGA_ACEPTO_COSTO/.test(linea) && costo) return false;
    if (/CARGA_ACEPTO_HEURISTICA/.test(linea) && heuristica) return false;
    return true;
  });
}

function pedirCapacidades(base, token) {
  const res = http.get(`${base}/capacidades`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { etapa: 'capacidades' },
  });
  if (res.status !== 200) {
    exec.test.abort(
      `[carga] GET /capacidades devolvio ${res.status}. Sin saber en que modo ` +
        'corre cada pieza, esta prueba no sabe que esta midiendo.',
    );
  }
  return res.json();
}

/** `GET /health/ai-core` es publico y dice quien contesta del otro lado. */
function sondearAiCore(base) {
  const res = http.get(`${base}/health/ai-core`, {
    tags: { etapa: 'capacidades' },
  });
  if (res.status !== 200) return null;
  const cuerpo = res.json();
  return cuerpo && cuerpo.upstream ? String(cuerpo.upstream) : null;
}

function imprimir(cap, upstream, razones, avisos, abortar) {
  const linea = '─'.repeat(72);
  const modo = [
    `ia=${cap.ia}`,
    `ruteo=${cap.ruteo}`,
    `canal=${cap.canal}`,
    `datos=${cap.datos}`,
    `handshakeTimeoutS=${cap.handshakeTimeoutS}`,
    `ai-core=${upstream ?? 'no configurado'}`,
  ].join('  ');

  console.warn(`\n${linea}\n[PULSO · carga] modo del sistema bajo prueba\n  ${modo}`);

  if (razones.length) {
    console.warn(
      `\n⚠️  ESTA CORRIDA NO ES CONCLUYENTE\n` +
        razones.map((r) => `   · ${r}`).join('\n') +
        '\n   Los numeros que salgan describen un Map en RAM. Sirven para ver ' +
        'si el harness funciona; NO sirven para decir si PULSO cumple el §7.1.',
    );
  } else {
    console.warn('\n✓ Precondiciones de persistencia: sin objeciones detectables.');
  }

  for (const a of avisos) console.warn(`   · ${a}`);
  for (const a of abortar) console.error(`\n⛔ ${a}`);
  console.warn(`${linea}\n`);
}

/**
 * El umbral que hace que una corrida no concluyente se vea ROJA.
 *
 * Se apaga con CARGA_PERMITIR_MEMORIA=true — y apagarlo es una decision que
 * queda escrita en el comando, no un descuido.
 */
export function umbralPrecondicion() {
  return si(__ENV.CARGA_PERMITIR_MEMORIA)
    ? {}
    : { pulso_corrida_concluyente: ['rate==1'] };
}
