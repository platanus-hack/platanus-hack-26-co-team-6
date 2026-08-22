/**
 * Extractor clinico de emergencia, por palabras clave.
 *
 * No pretende ser bueno. Existe para que el equipo no quede bloqueado si
 * falta ANTHROPIC_API_KEY o se cae la red del evento. Devuelve siempre
 * `confianza: 0.35` — ese numero es la senal de "esto NO salio del LLM".
 *
 * Neid: tu trabajo es que la rama de Claude sea claramente mejor que esto.
 * Si en un ensayo ves confianza 0.35 exacta, estas viendo la heuristica.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  LAS CATEGORIAS SALEN DE LA DEMANDA REAL, NO DE LA INTUICION
 * ═══════════════════════════════════════════════════════════════════
 *  Antes habia tres: cardiaco, neuro y trauma. Los 9206 incidentes reales
 *  del 123 (ver data/procesado/demanda.json) dicen que eso deja fuera la
 *  mitad de lo que pasa en Bogota:
 *
 *    2138  HERIDO                          -> trauma          (ya estaba)
 *    1040  TRASTORNO MENTAL                -> NO SE CUBRIA
 *    1009  EVENTO RESPIRATORIO             -> NO SE CUBRIA
 *     897  ENFERMO                         -> NO SE CUBRIA
 *     768  CONVULSION                      -> neuro           (ya estaba)
 *     735  INCONSCIENTE / PARO             -> NO SE CUBRIA
 *     711  INTENTO DE SUICIDIO             -> NO SE CUBRIA
 *     355  DOLOR TORACICO                  -> NO SE CUBRIA (!)
 *     286  SINTOMAS GASTROINTESTINALES     -> NO SE CUBRIA
 *     272  ACV                             -> neuro           (ya estaba)
 *
 *  "Dolor toracico" es el nombre con el que el 123 registra 355 incidentes al
 *  mes y era justo lo que la regex de cardiaco no miraba: pedia "precordial"
 *  o "supra ST", que es como lo escribe un medico, no como llega la llamada.
 *
 *  Si agregas una categoria, mirala primero contra `porTipoIncidente` en
 *  data/procesado/demanda.json. Cubrir algo que ocurre 3 veces al mes no
 *  mueve la aguja; los seis huecos de arriba si.
 * ═══════════════════════════════════════════════════════════════════
 *
 * (Vive aca y no dentro del route.ts porque Next valida los exports de los
 *  route handlers: exportar una funcion extra desde un route.ts rompe el
 *  typecheck. Ver lib/handshake.ts, mismo motivo.)
 */

import type {
  Complejidad,
  ExtraccionClinica,
  NivelTriage,
} from '../contracts/types';

interface Categoria {
  /** Solo para leer el codigo y los tests. No sale en la respuesta. */
  id: string;
  prueba: RegExp;
  /** Codigos REPS que este cuadro exige. Se ACUMULAN entre categorias. */
  servicios: number[];
  cie10: string | null;
  dx: string;
  triage: NivelTriage;
  complejidad: Complejidad;
}

/**
 * ORDEN = PRIORIDAD CLINICA. La primera que coincide manda el diagnostico,
 * el triage y la complejidad; los servicios se suman de TODAS las que
 * coincidan.
 *
 * Esa distincion importa: un trauma craneoencefalico coincide con `trauma` y
 * con `neuro`, y necesita cirugia general Y neurocirugia. Pero el dx que se
 * muestra tiene que ser uno solo, y en urgencias manda el mas urgente.
 */
const CATEGORIAS: Categoria[] = [
  {
    id: 'paro',
    // "Inconsciente o paro cardiorrespiratorio" es un solo tipo en el 123.
    prueba:
      /paro cardio|paro card[ií]aco|inconsciente|sin respuesta|no responde|reanimaci|rcp|p[eé]rdida de conscien|perdida de conscien|asistolia/,
    servicios: [110],
    cie10: 'I46.9',
    dx: 'Paro cardiorrespiratorio / alteración del estado de consciencia',
    triage: 1,
    complejidad: 'alta',
  },
  {
    id: 'trauma',
    prueba:
      /trauma|atropell|herida|fractura|deformidad|politrauma|arma|ca[ií]da de altura|aplastamiento/,
    servicios: [203],
    cie10: 'T07',
    dx: 'Politraumatismo',
    triage: 1,
    complejidad: 'alta',
  },
  {
    id: 'hemorragia',
    prueba:
      /hemorragia|sangrado abundante|sangrado activo|hemat[eé]mesis|exanguin/,
    servicios: [203, 110],
    cie10: 'R58',
    dx: 'Hemorragia activa',
    triage: 1,
    complejidad: 'alta',
  },
  {
    id: 'cardiaco',
    // Se agregan "dolor toracico" y "angina": es como llega la llamada.
    // \b en las siglas de tres letras: sin el, `sca` matchea "mascara de
    // oxigeno" y `iam` matchea "diametro pupilar". Un falso positivo aqui
    // manda la ambulancia a una sala de hemodinamia.
    prueba:
      /supra ?st|supradesnivel|precordial|infarto|\biam\b|\bsca\b|dolor tor[aá]cico|angina|opresivo/,
    servicios: [743, 110],
    cie10: 'I21.9',
    dx: 'Síndrome coronario agudo',
    triage: 2,
    complejidad: 'alta',
  },
  {
    id: 'neuro',
    prueba:
      /\bacv\b|hemipare|afasia|glasgow|cefalea s[uú]bita|convuls|tec\b|craneoencef|d[eé]ficit neurol/,
    servicios: [245, 110, 744],
    cie10: 'I63.9',
    dx: 'Evento cerebrovascular',
    triage: 2,
    complejidad: 'alta',
  },
  {
    id: 'respiratorio',
    prueba:
      /disnea|dificultad respiratoria|satura|broncoespasmo|asma|epoc|ahogo|cianosis|insuficiencia respiratoria/,
    servicios: [110],
    cie10: 'J96.0',
    dx: 'Insuficiencia respiratoria aguda',
    triage: 2,
    complejidad: 'alta',
  },
  {
    id: 'obstetrico',
    prueba: /gestante|embaraz|actividad uterina|parto|obst[eé]tric|ginecobst/,
    servicios: [320],
    cie10: 'O80',
    dx: 'Urgencia obstétrica',
    triage: 2,
    complejidad: 'media',
  },
  {
    id: 'intoxicacion',
    prueba: /intoxica|sobredosis|envenenamiento|ingesta de|abstinencia/,
    servicios: [110],
    cie10: 'T65.9',
    dx: 'Intoxicación aguda',
    triage: 2,
    complejidad: 'media',
  },
  {
    id: 'quemadura',
    prueba: /quemadura|quemado|escaldadura/,
    servicios: [203, 110],
    cie10: 'T30.0',
    dx: 'Paciente quemado',
    triage: 2,
    complejidad: 'alta',
  },
  {
    id: 'autolesion',
    // Intento de suicidio (711/mes) + amenaza (228). Va antes que salud
    // mental general porque el riesgo vital es distinto.
    prueba:
      /intento de suicidio|autolesi|ideaci[oó]n suicida|se cort[oó]|intoxicaci[oó]n voluntaria/,
    servicios: [],
    cie10: 'X84',
    dx: 'Lesión autoinfligida',
    triage: 2,
    complejidad: 'media',
  },
  {
    id: 'salud_mental',
    prueba:
      /trastorno mental|agitaci[oó]n|psicomotora|psiqui[aá]tr|brote psic|crisis de ansiedad/,
    servicios: [],
    cie10: 'F99',
    dx: 'Urgencia en salud mental',
    triage: 3,
    // Una urgencia psiquiatrica NO necesita alta complejidad. Exigirla
    // descartaba 59 de las 84 sedes sin ninguna razon clinica.
    complejidad: 'baja',
  },
  {
    id: 'gastrointestinal',
    prueba:
      /gastrointestinal|dolor abdominal|abdomen agudo|v[oó]mito|diarrea|emesis/,
    servicios: [203],
    cie10: 'R10.4',
    dx: 'Dolor abdominal / síndrome gastrointestinal',
    triage: 3,
    complejidad: 'media',
  },
];

/** Marcadores de inestabilidad. Suben el triage sin cambiar el diagnostico. */
const INESTABLE =
  /inestable|hipoten|shock|taquic[aá]rd|palidez|diafor|v[ií]a a[eé]rea|intubad|bradic[aá]rd|cian[oó]tic/;

/**
 * ⚠️ Los limites de palabra NO son decoracion.
 *
 * `ni[nñ]` sin \b matchea "nin" dentro de "feme-NIN-a": una mujer de 68 anos
 * quedaba clasificada como pediatrica y el sistema le pedia UCI PEDIATRICA
 * en vez de UCI de adultos. Lo cazo un test; en vivo habria sido un
 * traslado a una sede que no puede recibirla.
 */
const PEDIATRICO =
  /\bmenor|\bni[nñ][oa]s?\b|pedi[aá]tric|lactante|meses de edad|\bbeb[eé]s?\b/;

export function extraccionHeuristica(texto: string): ExtraccionClinica {
  const t = texto.toLowerCase();

  const coincidencias = CATEGORIAS.filter((c) => c.prueba.test(t));
  const pediatrico = PEDIATRICO.test(t);
  const inestable = INESTABLE.test(t);

  // Servicios de TODAS las categorias que coinciden; dx y triage de la de
  // mayor prioridad, que por el orden del arreglo es la primera.
  const servicios = coincidencias.flatMap((c) => c.servicios);
  const principal = coincidencias[0];

  let triage: NivelTriage = principal?.triage ?? 3;
  const dxCie10 = principal?.cie10 ?? null;
  const dxDescripcion = principal?.dx ?? 'Cuadro clínico no clasificado';
  let complejidadRequerida: Complejidad = principal?.complejidad ?? 'media';

  // UCI pediatrica en vez de la de adultos. El filtro de servicios es duro:
  // mandar un menor a una sede con 110 y sin 109 lo deja sin cama.
  if (pediatrico) {
    for (let i = 0; i < servicios.length; i++) {
      if (servicios[i] === 110) servicios[i] = 109;
    }
  }

  // NO se inyecta ningun servicio por defecto.
  //
  // `serviciosFaltantes()` ya agrega urgencias (1102) a lo exigido, siempre.
  // Asi que una lista vacia significa "cualquier sede con urgencias sirve", y
  // el ranking decide por cercania y congestion — que es justo lo correcto
  // para una urgencia en salud mental o un cuadro sin clasificar.
  //
  // Antes se empujaba 110 (UCI adultos) cuando la lista quedaba vacia. Eso
  // exigia una cama de cuidado intensivo para una crisis de ansiedad y
  // recortaba las sedes candidatas de 82 a 47 sin una sola razon clinica.

  if (inestable) {
    triage = Math.min(triage, 2) as NivelTriage;
    // Un paciente inestable necesita respaldo, coincida o no una categoria.
    complejidadRequerida = 'alta';
  }

  // Acepta "54 anos" ademas de "54 años": las transcripciones de voz y los
  // teclados sin tilde se comen la enie constantemente.
  const mEdad = t.match(/(\d{1,3})\s*a[nñ]os/);
  const edad = mEdad ? parseInt(mEdad[1], 10) : pediatrico ? 8 : null;
  const sexo: 'M' | 'F' | 'desconocido' = /masculino|hombre|var[oó]n/.test(t)
    ? 'M'
    : /femenina|femenino|mujer/.test(t)
      ? 'F'
      : 'desconocido';

  const signosAlarma: string[] = [];
  if (inestable) signosAlarma.push('Inestabilidad hemodinámica');
  if (coincidencias.length > 1) {
    signosAlarma.push(
      `Cuadro mixto: ${coincidencias.map((c) => c.id).join(', ')}`,
    );
  }

  return {
    resumen: texto.slice(0, 140),
    triage,
    dxCie10,
    dxDescripcion,
    serviciosRequeridos: [...new Set(servicios)],
    complejidadRequerida,
    edad,
    sexo,
    signosAlarma,
    requiereMedicoABordo: inestable || triage === 1,
    confianza: 0.35,
  };
}
