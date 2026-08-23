/**
 * ESCENARIO PRINCIPAL — 50 casos a la vez contra los SLOs del §7.1.
 *
 * Cada usuario virtual hace el ciclo del producto entero:
 *
 *   POST /triage  →  POST /match  →  POST /dispatch  →  GET /estado
 *                                 →  POST /handshake/respond   (hospital simulado)
 *
 * y cronometra las cinco cosas que la tarea 5.7 manda medir, cada una con su
 * p50/p95/p99 y con umbrales atados al plan maestro §7.1 (ver slos.js). La
 * prueba falla sola: nadie tiene que leer un numero a ojo.
 *
 * ── LO QUE ESTA PRUEBA NO PUEDE PROMETER ───────────────────────────
 * 1. Mientras la tarea 1.2 no persista casos y handshakes, el sistema bajo
 *    prueba es un `Map` en RAM. `lib/preflight.js` lo detecta con
 *    `GET /capacidades` y marca la corrida como NO CONCLUYENTE.
 * 2. El SLO del ciclo completo (p50 < 90 s) incluye el tiempo que tarda un
 *    HUMANO en apretar "aceptar". Esta prueba no tiene un humano. Por defecto
 *    `CARGA_ESPERA_HOSPITAL_S=0`, o sea que mide el tramo de maquina y NADA
 *    MAS, y con eso el p50 < 90 s se cumple casi por construccion. Poner ahi
 *    un numero inventado seria peor: se registran las dos metricas
 *    (`pulso_ciclo_completo_ms` con la espera, `pulso_ciclo_maquina_ms` sin
 *    ella) y el resumen dice con que espera se corrio.
 *
 * Variables:
 *   CARGA_BASE               http://localhost:3001
 *   CARGA_PASSWORD           la de OPERADOR_PASSWORD (o la que core imprimio)
 *   CARGA_VUS                50
 *   CARGA_DURACION           5m   (tiempo SOSTENIDO; hay 30s de rampa antes)
 *   CARGA_ESPERA_HOSPITAL_S  0    (espera simulada del jefe de urgencias)
 *   CARGA_PIENSA_S           1    (pausa entre ciclos de un mismo VU)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Trend, Rate, Counter } from 'k6/metrics';
import { umbrales, ESTADISTICAS_TENDENCIA } from './slos.js';
import { iniciarSesion, conSesion } from './lib/sesion.js';
import { revisarPrecondiciones, umbralPrecondicion } from './lib/preflight.js';
import { dictadoDe, origenDe, unidadDe } from './lib/dictados.js';
import { resumenPulso } from './lib/resumen.js';

const BASE = __ENV.CARGA_BASE || 'http://localhost:3001';
const VUS = Number(__ENV.CARGA_VUS || 50);
const DURACION = __ENV.CARGA_DURACION || '5m';
const ESPERA_HOSPITAL_S = Number(__ENV.CARGA_ESPERA_HOSPITAL_S || 0);
const PIENSA_S = Number(__ENV.CARGA_PIENSA_S || 1);

// ── Metricas ──────────────────────────────────────────────────────
// `true` como segundo argumento = es tiempo, k6 lo formatea como tal.
const tDictadoRanking = new Trend('pulso_dictado_a_ranking_ms', true);
const tRankingHandshake = new Trend('pulso_ranking_a_handshake_ms', true);
const tCiclo = new Trend('pulso_ciclo_completo_ms', true);
const tCicloMaquina = new Trend('pulso_ciclo_maquina_ms', true);
const tTriage = new Trend('pulso_etapa_triage_ms', true);
const tMatch = new Trend('pulso_etapa_match_ms', true);
const tDispatch = new Trend('pulso_etapa_dispatch_ms', true);
const tRespond = new Trend('pulso_etapa_respond_ms', true);
const tEstado = new Trend('pulso_etapa_estado_ms', true);

const triageDisponible = new Rate('pulso_triage_disponible');
const escaladoFallaTecnica = new Rate('pulso_escalado_falla_tecnica');
const concluyente = new Rate('pulso_corrida_concluyente');

const sinCandidatos = new Counter('pulso_sin_candidatos');
const bloqueadoConfianza = new Counter('pulso_triage_bloqueado_confianza');
const respuestaNoAplicada = new Counter('pulso_respuesta_no_aplicada');

export const options = {
  scenarios: {
    ciclo: {
      // Rampa corta antes del sostenido: los primeros golpes contra un Nest
      // recien arrancado miden el JIT de V8 y ensucian el p99 para siempre.
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: VUS },
        { duration: DURACION, target: VUS },
        { duration: '15s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: { ...umbrales(), ...umbralPrecondicion() },
  summaryTrendStats: ESTADISTICAS_TENDENCIA,
};

export function setup() {
  const token = iniciarSesion(BASE, __ENV.CARGA_PASSWORD, 'la prueba de carga');
  const pre = revisarPrecondiciones(BASE, token);
  return { token, conclusiva: pre.conclusiva, capacidades: pre.capacidades };
}

export default function (datos) {
  const { token } = datos;
  concluyente.add(datos.conclusiva);

  const semilla = exec.vu.idInTest * 100003 + exec.vu.iterationInInstance;
  const guion = dictadoDe(semilla);
  let fallaTecnica = false;

  const t0 = Date.now();

  // ── 1. Dictado → caso estructurado ──────────────────────────────
  // El dictado va en el CUERPO. Nunca en la URL: regla 5 del repo.
  const rTriage = http.post(
    `${BASE}/triage`,
    JSON.stringify({
      texto: guion.texto,
      origen: origenDe(semilla),
      tipoMovil: guion.requiereMedicoABordo ? 'TAM' : 'TAB',
      unidad: unidadDe(__ENV.CARGA_MARCA || 'demo', exec.vu.idInTest, exec.vu.iterationInInstance),
    }),
    conSesion(token, 'triage'),
  );
  tTriage.add(rTriage.timings.duration);
  triageDisponible.add(exitoso(rTriage));

  if (!exitoso(rTriage)) {
    const codigo = codigoPulso(rTriage);
    if (codigo === 'PULSO_LOW_CONFIDENCE' || codigo === 'PULSO_INCONSISTENT_TRIAGE') {
      bloqueadoConfianza.add(1);
    }
    fallaTecnica = esFallaTecnica(rTriage, codigo);
    escaladoFallaTecnica.add(fallaTecnica);
    sleep(PIENSA_S);
    return;
  }
  const caso = rTriage.json().caso;
  // Un 2xx sin `caso` no deberia existir; si existe, es un hallazgo y no una
  // excepcion a mitad de iteracion que ensucie el resto de la corrida.
  if (!caso || !caso.id) {
    escaladoFallaTecnica.add(true);
    console.error('[carga] POST /triage devolvio 2xx sin caso — contrato roto');
    sleep(PIENSA_S);
    return;
  }

  // ── 2. Ranking ──────────────────────────────────────────────────
  const rMatch = http.post(
    `${BASE}/match`,
    JSON.stringify({ caso, limite: 5, radioKm: 25 }),
    conSesion(token, 'match'),
  );
  tMatch.add(rMatch.timings.duration);
  const tRanking = Date.now();
  tDictadoRanking.add(tRanking - t0);

  if (!exitoso(rMatch)) {
    const codigo = codigoPulso(rMatch);
    // Ranking vacio NO es una falla tecnica: es la regla 3 del repo — el
    // conjunto vacio es un evento y el caso escala al CRUE. Contarlo como
    // falla tecnica ensuciaria justo el SLO que existe para distinguirlos.
    if (codigo === 'PULSO_NO_ELIGIBLE_DESTINATION') sinCandidatos.add(1);
    fallaTecnica = esFallaTecnica(rMatch, codigo);
    escaladoFallaTecnica.add(fallaTecnica);
    sleep(PIENSA_S);
    return;
  }

  const candidatos = rMatch.json().candidatos || [];
  // El MISMO criterio que RoutingService.match(): la primera no descartada.
  // Despachar a otra devuelve PULSO_INCOMPLETE_EVIDENCE y estariamos midiendo
  // un error nuestro, no el sistema.
  const elegido = candidatos.find((c) => c.motivoDescarte === null);
  if (!elegido) {
    sinCandidatos.add(1);
    escaladoFallaTecnica.add(false);
    sleep(PIENSA_S);
    return;
  }

  // ── 3. Handshake al hospital ────────────────────────────────────
  const rDispatch = http.post(
    `${BASE}/dispatch`,
    JSON.stringify({
      casoId: caso.id,
      sedeCodigo: elegido.sede.codigo,
      // 'consola' explicito: aunque el preflight ya aborta si hay un canal
      // real configurado, una prueba de carga no puede depender de una sola
      // linea de defensa para no escribirle a un humano miles de veces.
      canal: 'consola',
    }),
    conSesion(token, 'dispatch'),
  );
  tDispatch.add(rDispatch.timings.duration);
  const tHandshake = Date.now();
  tRankingHandshake.add(tHandshake - tRanking);

  if (!exitoso(rDispatch)) {
    fallaTecnica = esFallaTecnica(rDispatch, codigoPulso(rDispatch));
    escaladoFallaTecnica.add(fallaTecnica);
    sleep(PIENSA_S);
    return;
  }
  const handshake = rDispatch.json().handshake;

  // ── 4. La consola mira el estado ────────────────────────────────
  // /campo y /hospital hacen polling cada 2 s. Sin esta lectura la prueba
  // mediria un sistema donde nadie mira la pantalla, y GET /estado recalcula
  // la congestion de las 84 sedes en cada llamada: es candidato a cuello.
  const rEstado = http.get(
    `${BASE}/estado?casoId=${encodeURIComponent(caso.id)}`,
    conSesion(token, 'estado'),
  );
  tEstado.add(rEstado.timings.duration);

  // ── 5. El hospital responde ─────────────────────────────────────
  if (ESPERA_HOSPITAL_S > 0) sleep(ESPERA_HOSPITAL_S);

  const rRespond = http.post(
    `${BASE}/handshake/respond`,
    JSON.stringify({ handshakeId: handshake.id, decision: 'aceptado' }),
    conSesion(token, 'respond'),
  );
  tRespond.add(rRespond.timings.duration);

  const fin = Date.now();
  const ok = exitoso(rRespond);
  if (ok) {
    const cuerpo = rRespond.json();
    // `aplicada: false` = la respuesta no cambio nada (doble toque o el
    // handshake ya vencio). Cerrar el ciclo con eso y contarlo como aceptado
    // seria exactamente la mentira contra la que advierte el contrato.
    if (cuerpo.aplicada) {
      tCiclo.add(fin - t0);
      tCicloMaquina.add(fin - t0 - ESPERA_HOSPITAL_S * 1000);
    } else {
      respuestaNoAplicada.add(1);
    }
  }

  check(rRespond, { 'respond 2xx': (r) => exitoso(r) });
  fallaTecnica = esFallaTecnica(rRespond, codigoPulso(rRespond));
  escaladoFallaTecnica.add(fallaTecnica);

  sleep(PIENSA_S);
}

export function handleSummary(data) {
  return resumenPulso(data, {
    escenario: 'ciclo',
    notas: [
      `base=${BASE} vus=${VUS} duracion=${DURACION}`,
      `espera de hospital simulada = ${ESPERA_HOSPITAL_S}s ` +
        (ESPERA_HOSPITAL_S === 0
          ? '(el ciclo completo NO incluye tiempo humano: ver la cabecera del escenario)'
          : ''),
    ],
  });
}

// ── Utilidades ────────────────────────────────────────────────────

const exitoso = (res) => res.status >= 200 && res.status < 300;

/** El `code` del sobre de error de PULSO, si vino uno. */
function codigoPulso(res) {
  try {
    const cuerpo = res.json();
    return cuerpo && cuerpo.error ? cuerpo.error.code : null;
  } catch (e) {
    return null;
  }
}

/**
 * Falla TECNICA = el sistema no pudo, no "el caso no tenia a donde ir".
 * status 0 es k6 diciendo que la conexion ni se hizo.
 */
function esFallaTecnica(res, codigo) {
  return res.status === 0 || res.status >= 500 || codigo === 'PULSO_INTERNAL';
}
