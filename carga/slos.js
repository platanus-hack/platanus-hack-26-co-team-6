/**
 * Los SLOs del plan maestro §7.1, escritos UNA vez.
 *
 * ── POR QUE ESTE ARCHIVO EXISTE ────────────────────────────────────
 * "Un numero prometido y no medido es una opinion" (tarea 5.7). Si cada
 * escenario copiara sus umbrales, el dia que el §7.1 cambie habria tres
 * verdades y ninguna seria la del documento. Aqui esta la unica, con la fila
 * exacta de la que sale cada techo.
 *
 * NINGUN numero de este archivo se invento. Cada uno tiene su `fuente`. Los
 * unicos umbrales derivados estan marcados con `clase: 'implicada'` y traen
 * escrita la derivacion.
 *
 * ── LAS TRES CLASES DE UMBRAL ──────────────────────────────────────
 *   slo         El techo textual del §7.1, en el percentil que el §7.1 nombra.
 *               Si esto se pone rojo, PULSO incumple lo que promete.
 *   implicada   Cota que se DEDUCE de un SLO, no una promesa nueva.
 *               Ej: si p95(triage) >= 8 s entonces p95(triage+match) >= 8 s,
 *               asi que el techo de la fila 1 aplica a cada sumando.
 *   cota        Presupuesto de cola en un percentil que el §7.1 NO nombra.
 *               Es mas estricto que la promesa a proposito. Si lo unico rojo
 *               de una corrida son cotas, EL SLO SE CUMPLIO — el resumen lo
 *               dice con esas palabras. Se apagan con CARGA_SOLO_SLO=true.
 */

/** El §7.1 pide tres percentiles por metrica; el doc solo nombra uno. */
const PERCENTILES = ['p(50)', 'p(95)', 'p(99)'];

/**
 * Las seis filas del §7.1. Ojo: la tarea 5.7 habla de "los cinco SLOs" y la
 * tabla tiene seis filas. Se implementan las seis y se dice cual es cual.
 */
export const SLOS = [
  {
    id: 'dictado_a_ranking',
    metrica: 'pulso_dictado_a_ranking_ms',
    titulo: 'Dictado → ranking en pantalla',
    tipo: 'tendencia',
    percentil: 'p(95)',
    techo: 8000,
    fuente: 'plan maestro §7.1, fila 1',
    porque: 'Mas alla, el paramedico deja de mirar la pantalla',
    mide: 'POST /triage + POST /match, cronometrados desde antes del dictado',
  },
  {
    id: 'ranking_a_handshake',
    metrica: 'pulso_ranking_a_handshake_ms',
    titulo: 'Ranking → handshake entregado',
    tipo: 'tendencia',
    percentil: 'p(95)',
    techo: 3000,
    fuente: 'plan maestro §7.1, fila 2',
    porque: 'Es la promesa del canal',
    mide: 'POST /dispatch: crea el handshake y dispara la notificacion',
  },
  {
    id: 'ciclo_completo',
    metrica: 'pulso_ciclo_completo_ms',
    titulo: 'Ciclo completo dictado → aceptacion',
    tipo: 'tendencia',
    percentil: 'p(50)',
    techo: 90000,
    fuente: 'plan maestro §7.1, fila 3',
    porque: 'Es la promesa del producto',
    mide:
      'triage → match → dispatch → respond, incluida la espera de hospital ' +
      'simulada (CARGA_ESPERA_HOSPITAL_S, 0 por defecto — ver README)',
  },
  {
    id: 'webhook_respondido',
    metrica: 'pulso_etapa_respond_ms',
    titulo: 'Webhook de entrada respondido',
    tipo: 'tendencia',
    percentil: 'p(99)',
    techo: 3000,
    fuente: 'plan maestro §7.1, fila 4',
    porque: 'Meta reintenta pasado ese umbral',
    mide:
      'POST /handshake/respond — el TRAMO EN CORE del webhook. El webhook de ' +
      'verdad entra por apps/services/voz y esa mitad la mide la tarea 0.3; ' +
      'esta prueba no la cubre y no puede pretender que si.',
  },
  {
    id: 'disponibilidad_triage',
    metrica: 'pulso_triage_disponible',
    titulo: 'Disponibilidad de POST /triage',
    tipo: 'proporcion',
    expresion: 'rate>0.995',
    fuente: 'plan maestro §7.1, fila 5',
    porque: 'Es la ruta critica',
    mide: 'fraccion de POST /triage que responde 2xx',
  },
  {
    id: 'escalados_falla_tecnica',
    metrica: 'pulso_escalado_falla_tecnica',
    titulo: 'Casos escalados al CRUE por falla tecnica',
    tipo: 'proporcion',
    expresion: 'rate<0.01',
    fuente: 'plan maestro §7.1, fila 6',
    porque: 'Distinguirlo de escalamiento clinico legitimo',
    mide:
      'iteraciones que terminaron en escalamiento por un 5xx, un timeout de ' +
      'red o un PULSO_INTERNAL — NO las que escalaron por sin-candidatos, ' +
      'que es ruteo clinico correcto (regla 3 del repo)',
  },
];

/**
 * Las cinco cosas que la tarea manda medir, cada una con su Trend propia para
 * que el resumen pueda nombrar el cuello de botella. Las cuatro primeras son
 * peticiones sueltas; el ciclo es la suma.
 *
 * `etiqueta` es el valor de la etiqueta `etapa` que lleva cada peticion HTTP,
 * asi que k6 tambien las separa por su cuenta en http_req_duration.
 */
export const ETAPAS = [
  { id: 'triage', metrica: 'pulso_etapa_triage_ms', ruta: 'POST /triage' },
  { id: 'match', metrica: 'pulso_etapa_match_ms', ruta: 'POST /match' },
  { id: 'dispatch', metrica: 'pulso_etapa_dispatch_ms', ruta: 'POST /dispatch' },
  { id: 'respond', metrica: 'pulso_etapa_respond_ms', ruta: 'POST /handshake/respond' },
  { id: 'estado', metrica: 'pulso_etapa_estado_ms', ruta: 'GET /estado' },
];

/**
 * Cotas IMPLICADAS por un SLO, no promesas nuevas.
 *
 * p95(triage) y p95(match) heredan el techo de la fila 1 porque el SLO mide la
 * suma de los dos: si un sumando ya se lo come, la suma tambien. Es aritmetica,
 * no una promesa que nadie hizo.
 */
const IMPLICADAS = [
  {
    metrica: 'pulso_etapa_triage_ms',
    percentil: 'p(95)',
    techo: 8000,
    de: 'dictado_a_ranking',
    derivacion: 'triage es sumando de dictado→ranking: p95 del sumando ≤ techo de la suma',
  },
  {
    metrica: 'pulso_etapa_match_ms',
    percentil: 'p(95)',
    techo: 8000,
    de: 'dictado_a_ranking',
    derivacion: 'match es el otro sumando de dictado→ranking',
  },
  {
    metrica: 'pulso_etapa_dispatch_ms',
    percentil: 'p(95)',
    techo: 3000,
    de: 'ranking_a_handshake',
    derivacion: 'ranking→handshake ES la llamada a /dispatch',
  },
];

/** Indice `metrica|expresion` → { clase, ... }. Lo lee el resumen. */
export const CATALOGO_UMBRALES = {};

function anotar(metrica, expresion, datos) {
  CATALOGO_UMBRALES[`${metrica}|${expresion}`] = datos;
}

/**
 * Los `thresholds` de k6. Que la prueba FALLE SOLA: nadie tiene que leer un
 * numero a ojo y decidir si esta bien.
 *
 * @param {{soloSlo?: boolean, etapas?: boolean}} opciones
 */
export function umbrales(opciones = {}) {
  const soloSlo = opciones.soloSlo ?? String(__ENV.CARGA_SOLO_SLO) === 'true';
  const salida = {};
  const agregar = (metrica, expresion) => {
    (salida[metrica] = salida[metrica] ?? []).push(expresion);
  };

  for (const slo of SLOS) {
    if (slo.tipo === 'proporcion') {
      agregar(slo.metrica, slo.expresion);
      anotar(slo.metrica, slo.expresion, { clase: 'slo', slo });
      continue;
    }
    for (const p of PERCENTILES) {
      const esElDelDoc = p === slo.percentil;
      if (!esElDelDoc && soloSlo) continue;
      const expresion = `${p}<${slo.techo}`;
      agregar(slo.metrica, expresion);
      anotar(slo.metrica, expresion, {
        clase: esElDelDoc ? 'slo' : 'cota',
        slo,
        percentil: p,
      });
    }
  }

  if (!soloSlo) {
    for (const imp of IMPLICADAS) {
      const expresion = `${imp.percentil}<${imp.techo}`;
      agregar(imp.metrica, expresion);
      anotar(imp.metrica, expresion, { clase: 'implicada', implicada: imp });
    }
  }

  // Materializa las sub-metricas por etapa sin afirmar nada sobre ellas:
  // `count>=0` siempre pasa y es lo que hace que k6 las guarde y las imprima.
  // Sin esto no hay p95 por etapa en http_req_duration y el cuello de botella
  // se queda sin nombre.
  if (opciones.etapas !== false) {
    for (const etapa of ETAPAS) {
      agregar(`http_req_duration{etapa:${etapa.id}}`, 'count>=0');
    }
  }

  return salida;
}

/** Los percentiles que el resumen imprime para TODA tendencia. */
export const ESTADISTICAS_TENDENCIA = [
  'min',
  'avg',
  'p(50)',
  'p(95)',
  'p(99)',
  'max',
  'count',
];
