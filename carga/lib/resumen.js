/**
 * El resumen que se lee sin interpretar nada.
 *
 * Hace tres cosas que el resumen por defecto de k6 no hace:
 *
 *  1. **Separa SLO incumplido de presupuesto de cola excedido.** El §7.1
 *     promete percentiles concretos (p95 aqui, p50 alla). Un p99 en rojo
 *     cuando la promesa era el p95 NO es incumplir: es cola. Mezclarlos
 *     produce alarmas que nadie vuelve a mirar.
 *  2. **Le pone NOMBRE al cuello de botella.** No "algo va lento": la etapa
 *     con el p95 mas alto, cuanto pesa dentro del ciclo, y con que ruta se
 *     corresponde. Es el entregable de la tarea, no un adorno.
 *  3. **Dice si la corrida vale.** Si `pulso_corrida_concluyente` no es 1, el
 *     encabezado lo grita: estos numeros describen un `Map` en RAM.
 *
 * ⚠️ Exportar `handleSummary` reemplaza el resumen por defecto de k6. Es a
 *    proposito: el crudo completo queda en el JSON que se escribe al lado, y
 *    lo que hay que leer a las 3 a.m. cabe en una pantalla.
 */

import { ETAPAS, SLOS, CATALOGO_UMBRALES } from '../slos.js';

const LINEA = '─'.repeat(78);

/** k6 cambio la forma de `thresholds` entre versiones. Las dos se leen igual. */
function pasa(entrada) {
  if (entrada === true || entrada === false) return entrada;
  if (entrada && typeof entrada === 'object') {
    if (typeof entrada.ok === 'boolean') return entrada.ok;
    if (typeof entrada.fails === 'number') return entrada.fails === 0;
  }
  return true;
}

function valor(data, metrica, clave) {
  const m = data.metrics[metrica];
  if (!m || !m.values) return null;
  const v = m.values[clave];
  return typeof v === 'number' ? v : null;
}

function ms(n) {
  if (n === null) return '   —   ';
  return n >= 10000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`;
}

/** Veredicto por umbral, clasificado con el catalogo de slos.js. */
function veredictos(data) {
  const filas = [];
  for (const [metrica, m] of Object.entries(data.metrics)) {
    if (!m.thresholds) continue;
    for (const [expresion, resultado] of Object.entries(m.thresholds)) {
      if (expresion === 'count>=0') continue; // solo materializa sub-metricas
      const meta = CATALOGO_UMBRALES[`${metrica}|${expresion}`];
      filas.push({
        metrica,
        expresion,
        ok: pasa(resultado),
        clase: meta ? meta.clase : 'otro',
        titulo: meta && meta.slo ? meta.slo.titulo : metrica,
        fuente: meta && meta.slo ? meta.slo.fuente : meta && meta.implicada ? `implicada de ${meta.implicada.de}` : '—',
      });
    }
  }
  return filas;
}

/**
 * El cuello de botella, con nombre.
 *
 * Primero se descarta que el problema sea una PUERTA y no una demora: si el
 * triage se esta rechazando por confianza, medir milisegundos es medir el
 * tiempo que tarda un 400 — y ese seria el hallazgo, no la latencia.
 */
function cuelloDeBotella(data) {
  const bloqueados = valor(data, 'pulso_triage_bloqueado_confianza', 'count');
  if (bloqueados) {
    return {
      nombre: 'la puerta clinica, no la latencia',
      detalle:
        `${bloqueados} dictados rechazados con PULSO_LOW_CONFIDENCE. ` +
        'clinical-policy.ts exige confianza ≥ 0.5 y el extractor heuristico ' +
        'devuelve 0.35 fijo: en modo degradado /triage no deja pasar nada.',
    };
  }

  let peor = null;
  for (const etapa of ETAPAS) {
    const p95 = valor(data, etapa.metrica, 'p(95)');
    if (p95 === null) continue;
    if (!peor || p95 > peor.p95) peor = { ...etapa, p95 };
  }
  if (!peor) return { nombre: 'sin datos', detalle: 'ninguna etapa registro muestras.' };

  const ciclo = valor(data, 'pulso_ciclo_completo_ms', 'p(95)');
  const cuota = ciclo ? Math.round((peor.p95 / ciclo) * 100) : null;
  return {
    nombre: `${peor.id} (${peor.ruta})`,
    detalle:
      `p95 ${ms(peor.p95)}` +
      (cuota === null ? '' : `, ${cuota}% del p95 del ciclo completo`) +
      '. Es la etapa mas lenta de las cinco medidas.',
  };
}

function tablaTendencias(data) {
  const filas = [];
  const metricas = [
    ...SLOS.filter((s) => s.tipo === 'tendencia').map((s) => ({ metrica: s.metrica, titulo: s.titulo })),
    ...ETAPAS.map((e) => ({ metrica: e.metrica, titulo: e.ruta })),
    { metrica: 'pulso_ciclo_maquina_ms', titulo: 'ciclo sin la espera de hospital simulada' },
    { metrica: 'pulso_vigilante_atraso_ms', titulo: 'atraso del vigilante sobre expiraEn' },
  ];
  const vistas = new Set();
  const rutaDe = {};
  for (const e of ETAPAS) rutaDe[e.metrica] = e.ruta;
  for (const { metrica, titulo } of metricas) {
    if (vistas.has(metrica)) continue;
    vistas.add(metrica);
    if (!data.metrics[metrica]) continue;
    filas.push({
      // Una metrica puede ser SLO y etapa a la vez (respond lo es). Se imprime
      // con los dos nombres o el lector no sabe que ruta esta mirando.
      titulo: rutaDe[metrica] && rutaDe[metrica] !== titulo ? `${titulo} · ${rutaDe[metrica]}` : titulo,
      metrica,
      p50: valor(data, metrica, 'p(50)'),
      p95: valor(data, metrica, 'p(95)'),
      p99: valor(data, metrica, 'p(99)'),
      n: valor(data, metrica, 'count'),
    });
  }
  return filas;
}

function proporciones(data) {
  const filas = [];
  for (const slo of SLOS.filter((s) => s.tipo === 'proporcion')) {
    const r = valor(data, slo.metrica, 'rate');
    if (r === null) continue;
    filas.push({ titulo: slo.titulo, metrica: slo.metrica, rate: r, expresion: slo.expresion });
  }
  const fugas = valor(data, 'pulso_fugas_inquilino', 'count');
  if (fugas !== null) filas.push({ titulo: 'Fugas de inquilino detectadas', metrica: 'pulso_fugas_inquilino', conteo: fugas });
  return filas;
}

/**
 * @param {object} data     lo que k6 le pasa a handleSummary
 * @param {object} contexto { escenario, notas: string[] }
 */
export function resumenPulso(data, contexto) {
  const concluyente = valor(data, 'pulso_corrida_concluyente', 'rate');
  const cuello = cuelloDeBotella(data);
  const filas = veredictos(data);
  const slosRotos = filas.filter((f) => !f.ok && f.clase === 'slo');
  const implicadasRotas = filas.filter((f) => !f.ok && f.clase === 'implicada');
  const cotasRotas = filas.filter((f) => !f.ok && f.clase === 'cota');
  const otrosRotos = filas.filter((f) => !f.ok && f.clase === 'otro');
  const tendencias = tablaTendencias(data);
  const props = proporciones(data);
  const fecha = new Date().toISOString();
  const commit = __ENV.CARGA_COMMIT || 'sin declarar (pasa CARGA_COMMIT=$(git rev-parse --short HEAD))';

  const l = [];
  l.push('', LINEA, `PULSO · prueba de carga · escenario "${contexto.escenario}"`, LINEA);
  l.push(`fecha   ${fecha}`);
  l.push(`version ${commit}`);
  for (const nota of contexto.notas || []) l.push(`nota    ${nota}`);
  l.push('');

  if (concluyente !== null && concluyente < 1) {
    l.push('⚠️  CORRIDA NO CONCLUYENTE — el estado de core vive en un Map en RAM');
    l.push('    (tarea 1.2 pendiente). Lo de abajo mide V8, no PULSO. No se');
    l.push('    copia a RESULTADOS.md como si fuera una medicion del sistema.');
    l.push('');
  }

  l.push(`CUELLO DE BOTELLA: ${cuello.nombre}`);
  l.push(`  ${cuello.detalle}`);
  l.push('');

  l.push('LATENCIAS                                                      p50       p95       p99      n');
  for (const f of tendencias) {
    l.push(
      `  ${f.titulo.slice(0, 58).padEnd(59)}${ms(f.p50).padStart(8)}  ${ms(f.p95).padStart(8)}  ${ms(f.p99).padStart(8)}  ${String(f.n ?? '—').padStart(5)}`,
    );
  }
  l.push('');

  if (props.length) {
    l.push('PROPORCIONES');
    for (const p of props) {
      l.push(
        p.conteo !== undefined
          ? `  ${p.titulo.padEnd(59)}${String(p.conteo).padStart(8)}`
          : `  ${p.titulo.padEnd(59)}${(p.rate * 100).toFixed(2).padStart(7)}%   (exige ${p.expresion})`,
      );
    }
    l.push('');
  }

  l.push('VEREDICTO');
  if (slosRotos.length) {
    l.push(`  ⛔ ${slosRotos.length} SLO(s) del §7.1 INCUMPLIDO(s):`);
    for (const f of slosRotos) l.push(`     · ${f.titulo} — ${f.metrica} ${f.expresion} (${f.fuente})`);
  } else {
    l.push('  ✓ Ningun SLO del §7.1 incumplido en esta corrida.');
  }
  if (implicadasRotas.length) {
    l.push(`  ⛔ ${implicadasRotas.length} cota(s) implicada(s) rota(s) — una etapa sola ya se come el techo:`);
    for (const f of implicadasRotas) l.push(`     · ${f.metrica} ${f.expresion} (${f.fuente})`);
  }
  if (cotasRotas.length) {
    l.push(`  ⚠️  ${cotasRotas.length} presupuesto(s) de cola excedido(s) — NO es incumplir el §7.1:`);
    for (const f of cotasRotas) l.push(`     · ${f.metrica} ${f.expresion} (percentil que el §7.1 no promete)`);
  }
  if (otrosRotos.length) {
    l.push(`  ⛔ ${otrosRotos.length} umbral(es) del harness roto(s):`);
    for (const f of otrosRotos) l.push(`     · ${f.metrica} ${f.expresion}`);
  }
  l.push(LINEA, '');

  const texto = l.join('\n');
  const dir = __ENV.CARGA_SALIDA || 'carga/resultados';
  const salida = {};
  salida.stdout = texto;
  salida[`${dir}/${contexto.escenario}-resumen.txt`] = texto;
  salida[`${dir}/${contexto.escenario}-crudo.json`] = JSON.stringify(
    { fecha, commit, escenario: contexto.escenario, concluyente, cuello, data },
    null,
    2,
  );
  return salida;
}
