/**
 * ESCENARIO 3 — caso limite 18: el pooler filtra el contexto del inquilino.
 *
 * De docs/multitenancy-y-autenticacion.md §6.1:
 *
 *   "`SET LOCAL`, nunca `SET`. Con un pooler, un `SET` plano **filtra el
 *    contexto de un inquilino al siguiente request**. Solo aparece bajo
 *    concurrencia, que es cuando peor duele."
 *
 * y del checklist §9: "`SET LOCAL` dentro de transaccion, **con test de
 * concurrencia**". Este es ese test.
 *
 * ── POR QUE UNA PRUEBA DE CARGA Y NO UNA PRUEBA UNITARIA ───────────
 * Un `SET` plano es CORRECTO cuando hay una sola conexion y una sola peticion
 * a la vez: la prueba unitaria pasa. El bug solo existe cuando dos inquilinos
 * se turnan la misma conexion del pool. Hace falta concurrencia real, y por eso
 * vive aqui y no en un `.spec.ts`.
 *
 * ── QUE HACE, EXACTAMENTE ──────────────────────────────────────────
 * Cada usuario virtual alterna de inquilino en cada iteracion (asi se turnan
 * la conexion), crea un caso marcado con SU inquilino en `unidad.id`, y pide
 * dos lecturas:
 *
 *   1. `GET /estado`               → ningun caso de esta prueba puede llevar la
 *                                    marca de OTRO inquilino.
 *   2. `GET /estado?casoId=<cebo>` → el cebo de otro inquilino tiene que venir
 *                                    VACIO. (Caso limite 16: "UUID v4 ayuda,
 *                                    no autoriza".)
 *
 * Y una tercera que evita el falso verde mas tonto de todos: cada VU lee su
 * PROPIO cebo y exige verlo. Un endpoint que no devuelve nada a nadie tambien
 * pasaria las dos primeras.
 *
 * `unidad.id` es la marca porque es el unico campo que (a) el cliente controla,
 * (b) sobrevive a `despojar()` y sale en `CasoPublico`, y (c) no es PII: es una
 * placa de movil inventada. Marcar con `textoCrudo` seria imposible —no sale
 * del servidor, que es justamente como debe ser—.
 *
 * ── HOY NO SE PUEDE CONCLUIR, Y LA PRUEBA LO DICE EN ROJO ──────────
 * Core tiene UNA contraseña compartida para las tres consolas (tarea 1.3
 * pendiente) y no existe `organizacion_id` (1.1 y 1.5 pendientes). Sin dos
 * inquilinos de verdad esto no puede distinguir "no hay fuga" de "no hay
 * inquilinos": el umbral `pulso_inquilinato_evaluable == 1` se pone rojo y la
 * corrida falla. Es correcto que falle. Verde aqui, hoy, seria mentira.
 *
 * Variables:
 *   CARGA_INQUILINOS  JSON: [{"marca":"a","password":"..."},{"marca":"b","password":"..."}]
 *                     Las contraseñas SIEMPRE por entorno, nunca por argumento.
 *   CARGA_FUGA_VUS    50
 *   CARGA_FUGA_DUR    2m
 */

import http from 'k6/http';
import exec from 'k6/execution';
import { Trend, Rate, Counter } from 'k6/metrics';
import { ESTADISTICAS_TENDENCIA } from './slos.js';
import { iniciarSesion, conSesion } from './lib/sesion.js';
import { revisarPrecondiciones, umbralPrecondicion } from './lib/preflight.js';
import { dictadoDe, origenDe, marcaDe } from './lib/dictados.js';
import { resumenPulso } from './lib/resumen.js';

const BASE = __ENV.CARGA_BASE || 'http://localhost:3001';
const VUS = Number(__ENV.CARGA_FUGA_VUS || 50);
const DURACION = __ENV.CARGA_FUGA_DUR || '2m';

const fugas = new Counter('pulso_fugas_inquilino');
const evaluable = new Rate('pulso_inquilinato_evaluable');
const lecturaPropia = new Rate('pulso_lectura_propia_ok');
const concluyente = new Rate('pulso_corrida_concluyente');
const tEstado = new Trend('pulso_etapa_estado_ms', true);

export const options = {
  scenarios: {
    fuga: {
      // Sin pausa entre iteraciones: la contencion sobre el pool ES el
      // experimento. Un `sleep` aqui esconde justo lo que se busca.
      executor: 'constant-vus',
      vus: VUS,
      duration: DURACION,
    },
  },
  thresholds: {
    // Una sola fuga invalida el despliegue entero. No hay presupuesto de error.
    pulso_fugas_inquilino: ['count==0'],
    // Rojo mientras no haya dos inquilinos reales que comparar.
    pulso_inquilinato_evaluable: ['rate==1'],
    // Anti falso-verde.
    pulso_lectura_propia_ok: ['rate==1'],
    ...umbralPrecondicion(),
  },
  summaryTrendStats: ESTADISTICAS_TENDENCIA,
};

export function setup() {
  const inquilinos = leerInquilinos();
  const primero = inquilinos[0];
  const pre = revisarPrecondiciones(BASE, primero.token);

  if (inquilinos.length < 2) {
    console.error(
      '\n⛔ [carga · fuga de inquilino] SOLO HAY UN INQUILINO.\n' +
        '   Core usa hoy una contraseña compartida (tarea 1.3) y no tiene\n' +
        '   organizacion_id (1.1 / 1.5). Esta corrida NO puede concluir que no\n' +
        '   hay fuga: solo puede concluir que no hay a quien filtrarle nada.\n' +
        '   Cuando 1.3 aterrice: CARGA_INQUILINOS con dos credenciales reales.\n',
    );
  }

  // Un cebo por inquilino: un caso conocido, creado por su dueño, cuyo id se
  // reparte a TODOS los VUs para que intenten leerlo desde el inquilino que no
  // es. Es la prueba directa del caso limite 16.
  for (const inq of inquilinos) {
    inq.cebo = crearCaso(inq.token, inq.marca, 0, 'cebo');
  }

  return {
    inquilinos,
    conclusiva: pre.conclusiva,
    evaluable: inquilinos.length >= 2,
  };
}

export default function (datos) {
  const { inquilinos } = datos;
  concluyente.add(datos.conclusiva);
  evaluable.add(datos.evaluable);

  // Alternar inquilino POR ITERACION y no por VU: asi la misma conexion de
  // k6 —y con suerte la misma del pool del otro lado— pasa de un inquilino al
  // siguiente sin respirar. Es la condicion exacta del caso limite 18.
  const yo = inquilinos[(exec.vu.idInTest + exec.vu.iterationInInstance) % inquilinos.length];

  crearCaso(yo.token, yo.marca, exec.vu.idInTest, exec.vu.iterationInInstance);

  // ── 1. El listado no puede traer marcas ajenas ──────────────────
  const foto = mirar(yo.token, null);
  if (foto) {
    for (const caso of foto.casos || []) {
      const marca = marcaDe(caso.unidad);
      if (marca && marca !== yo.marca) {
        fugas.add(1, { visto: marca, portador: yo.marca, via: 'estado' });
        console.error(
          `⛔ FUGA DE INQUILINO: sesion de "${yo.marca}" vio un caso marcado ` +
            `"${marca}" en GET /estado (caso ${caso.id}).`,
        );
      }
    }
  }

  // ── 2. El cebo ajeno tiene que venir vacio ──────────────────────
  for (const otro of inquilinos) {
    if (otro.marca === yo.marca || !otro.cebo) continue;
    const ajeno = mirar(yo.token, otro.cebo);
    if (ajeno && (ajeno.casos || []).length > 0) {
      fugas.add(1, { visto: otro.marca, portador: yo.marca, via: 'casoId' });
      console.error(
        `⛔ FUGA DE INQUILINO: sesion de "${yo.marca}" leyo por id el caso ` +
          `cebo de "${otro.marca}" (${otro.cebo}).`,
      );
    }
  }

  // ── 3. Y el propio TIENE que verse ──────────────────────────────
  const propio = yo.cebo ? mirar(yo.token, yo.cebo) : null;
  lecturaPropia.add(Boolean(propio && (propio.casos || []).length > 0));
}

export function handleSummary(data) {
  return resumenPulso(data, {
    escenario: 'fuga-inquilino',
    notas: [
      `base=${BASE} vus=${VUS} duracion=${DURACION}`,
      'caso limite 18 de docs/multitenancy-y-autenticacion.md',
    ],
  });
}

// ── Utilidades ────────────────────────────────────────────────────

/**
 * Lee `CARGA_INQUILINOS` y hace login de cada uno. Si no viene, cae a la
 * contraseña unica de hoy — y devuelve UN inquilino, que es lo que dispara el
 * rojo de `pulso_inquilinato_evaluable`.
 */
function leerInquilinos() {
  const crudo = __ENV.CARGA_INQUILINOS;
  const lista = crudo
    ? JSON.parse(crudo)
    : [{ marca: 'unico', password: __ENV.CARGA_PASSWORD }];

  return lista.map((inq, i) => {
    // La marca viaja dentro de `unidad.id`, que se parte por guiones: una
    // marca con guion romperia el parseo y haria invisible una fuga real.
    const marca = String(inq.marca || `inq${i}`).replace(/[^a-z0-9]/gi, '');
    return {
      marca,
      cebo: null,
      token: iniciarSesion(BASE, inq.password, `el inquilino ${marca}`),
    };
  });
}

/** Crea un caso marcado y devuelve su id, o null. `iteracion` puede ser texto
 *  ('cebo'), asi que la semilla se calcula sin depender de que sea un numero. */
function crearCaso(token, marca, vu, iteracion) {
  const n = Number(iteracion);
  const semilla = vu * 100003 + (Number.isFinite(n) ? n : 1);
  const guion = dictadoDe(semilla);
  const res = http.post(
    `${BASE}/triage`,
    JSON.stringify({
      texto: guion.texto,
      origen: origenDe(semilla),
      tipoMovil: guion.requiereMedicoABordo ? 'TAM' : 'TAB',
      unidad: { id: `CG-${marca}-${vu}-${iteracion}`, tripulante: 'carga' },
    }),
    conSesion(token, 'triage'),
  );
  if (res.status < 200 || res.status >= 300) return null;
  try {
    return res.json().caso.id;
  } catch (e) {
    return null;
  }
}

function mirar(token, casoId) {
  const url = casoId
    ? `${BASE}/estado?casoId=${encodeURIComponent(casoId)}`
    : `${BASE}/estado`;
  const res = http.get(url, conSesion(token, 'estado'));
  tEstado.add(res.timings.duration);
  if (res.status < 200 || res.status >= 300) return null;
  try {
    return res.json();
  } catch (e) {
    return null;
  }
}
