/**
 * Los dictados sinteticos y de donde salen las ambulancias.
 *
 * ── SON INVENTADOS, Y AUN ASI VIAJAN COMO SI FUERAN REALES ─────────
 * Ninguno describe a una persona: no hay nombres, ni documentos, ni telefonos,
 * ni direcciones de portal. Aun asi se tratan con la regla 5 del repo:
 * **van SIEMPRE en el cuerpo de un POST, nunca en una query string**. La razon
 * no es que estos textos importen; es que el dia que alguien copie este archivo
 * para reproducir un caso real, el molde ya sea el correcto. Un `?texto=` en
 * este repo es un `?texto=` en los logs del proxy para siempre.
 *
 * Los servicios REPS que cada dictado deberia disparar estan anotados para que
 * el doble de carga (mock-ai-core.mjs) devuelva algo coherente y el filtro duro
 * de `serviciosFaltantes()` tenga a quien dejar pasar. Con 84 sedes semilla:
 * 743 hemodinamia → 25 sedes, 110 UCI adultos → 47, 203 cirugia general → 47.
 * Ninguno se queda sin candidatos por construccion.
 */

import { SharedArray } from 'k6/data';

/**
 * Centro de gravedad de los origenes: el mismo ORIGEN_DEMO de
 * `apps/backend/core/src/sedes/semillas.ts`. Se dispersa +-4 km para que no
 * todas las iteraciones pidan el mismo ranking y el ETA no salga cacheable.
 */
export const ORIGEN_BASE = { lat: 4.5981, lng: -74.0758 };

/** ~1 grado de latitud son 111 km; a esta latitud la longitud pesa parecido. */
const GRADOS_POR_KM = 1 / 111;

export const DICTADOS = new SharedArray('dictados', () => [
  {
    texto:
      'Masculino de 58 anos, dolor toracico opresivo de una hora, sudoracion ' +
      'y disnea. Electro con elevacion del ST en cara anterior. Tension 90 sobre 60.',
    serviciosRequeridos: [743, 110],
    triage: 1,
    dxCie10: 'I21.0',
    dxDescripcion: 'Infarto agudo de miocardio con elevacion del ST',
    complejidadRequerida: 'alta',
    edad: 58,
    sexo: 'M',
    signosAlarma: ['elevacion del ST', 'hipotension', 'diaforesis'],
    requiereMedicoABordo: true,
  },
  {
    texto:
      'Femenina de 34 anos, accidente de transito, trauma abdominal cerrado, ' +
      'abdomen en tabla, palidez marcada, frecuencia cardiaca en 130.',
    serviciosRequeridos: [203, 110],
    triage: 1,
    dxCie10: 'S36.9',
    dxDescripcion: 'Trauma abdominal cerrado con sospecha de sangrado',
    complejidadRequerida: 'alta',
    edad: 34,
    sexo: 'F',
    signosAlarma: ['taquicardia', 'abdomen en tabla', 'palidez'],
    requiereMedicoABordo: true,
  },
  {
    texto:
      'Masculino de 71 anos, hemiparesia derecha de inicio subito hace ' +
      'cuarenta minutos, afasia, Glasgow 14. Ultima vez visto bien a las seis.',
    serviciosRequeridos: [744, 110],
    triage: 1,
    dxCie10: 'I63.9',
    dxDescripcion: 'Ataque cerebrovascular isquemico en ventana',
    complejidadRequerida: 'alta',
    edad: 71,
    sexo: 'M',
    signosAlarma: ['deficit motor subito', 'afasia', 'en ventana de trombolisis'],
    requiereMedicoABordo: true,
  },
  {
    texto:
      'Femenina de 26 anos, gestante de 38 semanas, sangrado vaginal abundante ' +
      'y dolor abdominal continuo. Fetal presente. Tension 100 sobre 60.',
    serviciosRequeridos: [320, 110],
    triage: 2,
    dxCie10: 'O45.9',
    dxDescripcion: 'Sospecha de abrupcio de placenta',
    complejidadRequerida: 'alta',
    edad: 26,
    sexo: 'F',
    signosAlarma: ['sangrado abundante', 'gestante a termino'],
    requiereMedicoABordo: true,
  },
  {
    texto:
      'Masculino de 44 anos, herida por arma blanca en hemitorax izquierdo, ' +
      'consciente, disnea progresiva, murmullo vesicular disminuido a la izquierda.',
    serviciosRequeridos: [203, 744],
    triage: 1,
    dxCie10: 'S21.9',
    dxDescripcion: 'Herida penetrante de torax, sospecha de neumotorax',
    complejidadRequerida: 'alta',
    edad: 44,
    sexo: 'M',
    signosAlarma: ['disnea progresiva', 'hipoventilacion unilateral'],
    requiereMedicoABordo: true,
  },
  {
    texto:
      'Femenina de 63 anos, diabetica, alteracion del estado de conciencia, ' +
      'glucometria en 42, responde a estimulo doloroso. Sin trauma aparente.',
    serviciosRequeridos: [110, 712],
    triage: 2,
    dxCie10: 'E16.2',
    dxDescripcion: 'Hipoglucemia severa con compromiso de conciencia',
    complejidadRequerida: 'media',
    edad: 63,
    sexo: 'F',
    signosAlarma: ['glucometria en 42', 'alteracion de conciencia'],
    requiereMedicoABordo: false,
  },
]);

/**
 * Un origen distinto por iteracion, deterministico a partir de la semilla que
 * se le pase (VU + iteracion). Deterministico a proposito: dos corridas con la
 * misma configuracion tienen que ser comparables, o el reporte no sirve.
 */
export function origenDe(semilla) {
  const a = Math.sin(semilla * 12.9898) * 43758.5453;
  const b = Math.sin(semilla * 78.233) * 43758.5453;
  const dx = ((a - Math.floor(a)) * 2 - 1) * 4; // km
  const dy = ((b - Math.floor(b)) * 2 - 1) * 4; // km
  return {
    lat: Number((ORIGEN_BASE.lat + dy * GRADOS_POR_KM).toFixed(6)),
    lng: Number((ORIGEN_BASE.lng + dx * GRADOS_POR_KM).toFixed(6)),
  };
}

export function dictadoDe(semilla) {
  return DICTADOS[semilla % DICTADOS.length];
}

/**
 * El id de movil que lleva el caso.
 *
 * `unidad.id` es trazabilidad operativa (el equivalente a decir el indicativo
 * por radio) y SI sale en `CasoPublico` — por eso es el campo que usa la prueba
 * de fuga de inquilino para marcar de quien es cada caso. No es autenticacion y
 * no es PII: es una placa inventada.
 */
export function unidadDe(marca, vu, iteracion) {
  return { id: `CG-${marca}-${vu}-${iteracion}`, tripulante: 'carga' };
}

/** De un `unidad.id` de esta prueba, la marca de inquilino. `null` si no es nuestro. */
export function marcaDe(unidad) {
  if (!unidad || typeof unidad.id !== 'string') return null;
  const partes = unidad.id.split('-');
  return partes.length >= 4 && partes[0] === 'CG' ? partes[1] : null;
}
