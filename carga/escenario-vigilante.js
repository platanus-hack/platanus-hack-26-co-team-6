/**
 * ESCENARIO 2 — el vigilante con 50 handshakes vivos.
 *
 * 50 usuarios virtuales despachan a la vez y NINGUNO responde. A los
 * `handshakeTimeoutS` segundos, `VigilanteService` tiene que:
 *   1. marcar los 50 como `timeout`,
 *   2. registrar el silencio como rechazo (mueve P(aceptacion) de la sede), y
 *   3. re-rutear cada caso al siguiente candidato, o escalarlo al CRUE si no
 *      queda ninguno.
 *
 * Lo que se prueba no es una latencia: es que **el barrido no se atrase ni
 * abandone un caso** cuando tiene 50 cosas que hacer en la misma pasada. Un
 * caso que vence y nadie recoge es un paciente en la camilla sin destino.
 *
 * ── DE DONDE SALE EL PRESUPUESTO DE ATRASO ─────────────────────────
 * No del §7.1: ahi no hay una fila para esto. Sale del CODIGO — `CADA_MS =
 * 5_000` en `apps/backend/core/src/vigilante/vigilante.service.ts`. El barrido
 * corre cada 5 s, asi que un handshake puede vencer justo despues de una
 * pasada y esperar hasta la siguiente. Presupuesto: p95 < 2 barridos (10 s),
 * p99 < 3 barridos (15 s). Si se pasa de ahi, el barrido esta tardando MAS que
 * su propio intervalo — que es la definicion de que se quedo corto.
 *
 * El atraso se mide con `respondidoEn - expiraEn`, los dos sellados por el
 * SERVIDOR. Asi el numero no depende de cada cuanto haga polling esta prueba.
 *
 * Variables: las de escenario-ciclo.js, mas
 *   CARGA_VIGILANTE_VUS   50
 *   CARGA_POLL_S          2    (cada cuanto mira /estado, como hace /campo)
 */

import http from 'k6/http';
import { sleep } from 'k6';
import exec from 'k6/execution';
import { Trend, Rate, Counter } from 'k6/metrics';
import { ESTADISTICAS_TENDENCIA } from './slos.js';
import { iniciarSesion, conSesion } from './lib/sesion.js';
import { revisarPrecondiciones, umbralPrecondicion } from './lib/preflight.js';
import { dictadoDe, origenDe, unidadDe } from './lib/dictados.js';
import { resumenPulso } from './lib/resumen.js';

const BASE = __ENV.CARGA_BASE || 'http://localhost:3001';
const VUS = Number(__ENV.CARGA_VIGILANTE_VUS || 50);
const POLL_S = Number(__ENV.CARGA_POLL_S || 2);
/** Margen sobre `handshakeTimeoutS` antes de rendirse esperando el barrido. */
const MARGEN_S = 90;

const tAtraso = new Trend('pulso_vigilante_atraso_ms', true);
const tEstado = new Trend('pulso_etapa_estado_ms', true);
const tDispatch = new Trend('pulso_etapa_dispatch_ms', true);

const vencio = new Rate('pulso_vigilante_vencio');
const siguioSolo = new Rate('pulso_vigilante_siguio_solo');
const concluyente = new Rate('pulso_corrida_concluyente');
const abandonados = new Counter('pulso_casos_abandonados');

export const options = {
  scenarios: {
    vigilante: {
      // Todos arrancan juntos: la gracia es que los 50 venzan en la misma
      // pasada del barrido. Escalonarlos seria probar otra cosa (mas facil).
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: __ENV.CARGA_VIGILANTE_MAX || '5m',
    },
  },
  thresholds: {
    // Presupuesto derivado de CADA_MS = 5 s. Ver la cabecera.
    pulso_vigilante_atraso_ms: ['p(95)<10000', 'p(99)<15000'],
    // Un handshake que no vence es el estado `timeout` que "existia en el tipo
    // y nadie escribia nunca" — el bug que el vigilante vino a cerrar.
    pulso_vigilante_vencio: ['rate==1'],
    // Y vencer sin recoger el caso es peor que no vencer.
    pulso_vigilante_siguio_solo: ['rate==1'],
    ...umbralPrecondicion(),
  },
  summaryTrendStats: ESTADISTICAS_TENDENCIA,
};

export function setup() {
  const token = iniciarSesion(BASE, __ENV.CARGA_PASSWORD, 'la prueba del vigilante');
  const pre = revisarPrecondiciones(BASE, token);
  return {
    token,
    conclusiva: pre.conclusiva,
    timeoutS: Number(pre.capacidades.handshakeTimeoutS) || 45,
  };
}

export default function (datos) {
  const { token } = datos;
  concluyente.add(datos.conclusiva);

  const semilla = exec.vu.idInTest * 7919;
  const guion = dictadoDe(semilla);

  const rTriage = http.post(
    `${BASE}/triage`,
    JSON.stringify({
      texto: guion.texto,
      origen: origenDe(semilla),
      tipoMovil: guion.requiereMedicoABordo ? 'TAM' : 'TAB',
      unidad: unidadDe(__ENV.CARGA_MARCA || 'vigilante', exec.vu.idInTest, 0),
    }),
    conSesion(token, 'triage'),
  );
  if (!exitoso(rTriage)) return;
  const caso = rTriage.json().caso;

  const rMatch = http.post(
    `${BASE}/match`,
    JSON.stringify({ caso, limite: 5, radioKm: 25 }),
    conSesion(token, 'match'),
  );
  if (!exitoso(rMatch)) return;
  const elegido = (rMatch.json().candidatos || []).find((c) => c.motivoDescarte === null);
  if (!elegido) return;

  const rDispatch = http.post(
    `${BASE}/dispatch`,
    JSON.stringify({ casoId: caso.id, sedeCodigo: elegido.sede.codigo, canal: 'consola' }),
    conSesion(token, 'dispatch'),
  );
  tDispatch.add(rDispatch.timings.duration);
  if (!exitoso(rDispatch)) return;
  const handshake = rDispatch.json().handshake;

  // A partir de aqui NADIE contesta. Es todo el experimento.
  const limite = Date.now() + (datos.timeoutS + MARGEN_S) * 1000;
  let vencido = null;

  while (Date.now() < limite && !vencido) {
    sleep(POLL_S);
    const foto = mirar(token, caso.id);
    if (!foto) continue;
    vencido = (foto.handshakes || []).find(
      (h) => h.id === handshake.id && h.estado === 'timeout',
    );
  }

  vencio.add(Boolean(vencido));
  if (!vencido) {
    abandonados.add(1);
    siguioSolo.add(false);
    return;
  }

  // `respondidoEn` y `expiraEn` los sella el servidor: el atraso no depende
  // de cada cuanto mire esta prueba.
  tAtraso.add(
    new Date(vencido.respondidoEn).getTime() - new Date(vencido.expiraEn).getTime(),
  );

  // ¿Recogio el caso? Re-ruteo a otra sede, o escalamiento al CRUE. Cualquiera
  // de los dos vale; ninguno de los dos NO vale.
  const hasta = Date.now() + 20000;
  let recogido = false;
  while (Date.now() < hasta && !recogido) {
    const foto = mirar(token, caso.id);
    if (foto) {
      const otro = (foto.handshakes || []).some(
        (h) => h.id !== handshake.id && h.estado === 'enviado',
      );
      const escalado = (foto.escalamientos || []).length > 0;
      recogido = otro || escalado;
    }
    if (!recogido) sleep(POLL_S);
  }
  siguioSolo.add(recogido);
  if (!recogido) abandonados.add(1);
}

export function handleSummary(data) {
  return resumenPulso(data, {
    escenario: 'vigilante',
    notas: [
      `base=${BASE} handshakes vivos=${VUS} poll=${POLL_S}s`,
      'presupuesto de atraso derivado de CADA_MS=5s en vigilante.service.ts, no del §7.1',
    ],
  });
}

function mirar(token, casoId) {
  const res = http.get(
    `${BASE}/estado?casoId=${encodeURIComponent(casoId)}`,
    conSesion(token, 'estado'),
  );
  tEstado.add(res.timings.duration);
  if (!exitoso(res)) return null;
  try {
    return res.json();
  } catch (e) {
    return null;
  }
}

const exitoso = (res) => res.status >= 200 && res.status < 300;
