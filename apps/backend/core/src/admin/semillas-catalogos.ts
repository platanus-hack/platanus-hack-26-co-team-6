/**
 * Semillas de arranque de los catalogos versionados.
 *
 * ── QUE SON Y QUE NO SON ──────────────────────────────────────────
 * Son la version 1 de cada entrada: el punto de partida que un comite clinico
 * revisa y corrige desde `/admin/catalogos`. **No son guia oficial.** Cada
 * correccion que hagan crea una version 2 firmada, y el historico dira que
 * hasta esa fecha rigio esto. Esa trazabilidad es justamente lo que hace
 * honesto arrancar con semillas en vez de con la tabla vacia.
 *
 * Los codigos REPS salen de `catalogo/servicios-reps.ts` — el CodeSystem de
 * MinSalud compilado, 130 conceptos, con la nota de que el README original del
 * proyecto traia codigos equivocados (408 es RADIOTERAPIA; hemodinamia es 743).
 * Se importan por nombre, no por numero: escribir `743` a mano en veinte sitios
 * es como se cuela el error que ese archivo documenta.
 *
 * ── EL CREADOR ES `sistema` ───────────────────────────────────────
 * No se atribuyen a una persona. Nadie las firmo; son el estado inicial. La
 * primera firma humana aparece en la version 2, y esa distincion importa
 * cuando alguien audite quien decidio que.
 */

import { SERVICIOS as S } from '../catalogo/servicios-reps';
import type { Coleccion, VersionEntrada } from './tipos';

const CREADO_EN = '2026-01-01T00:00:00.000Z';
const ACTOR = 'sistema';

interface Semilla {
  coleccion: Coleccion;
  codigo: string;
  etiqueta: string;
  datos: Record<string, unknown>;
}

/**
 * MOTIVOS DE RECHAZO — §7.4: "enum cerrado y versionado, para que el dataset
 * de aceptacion sea consistente en el tiempo".
 *
 * Las cuatro etiquetas son LITERALMENTE las que hoy estan escritas a mano en
 * `apps/frontend/components/hospital/MotivosCapacidad.tsx`, sin codigo y sin
 * version. Ese archivo es el problema que esta tarea resuelve: hoy, cambiarle
 * una coma parte la serie historica en dos y nadie se entera.
 *
 * Vocabulario: NO son "negar atencion". La Ley 1751/2015 obliga a la atencion
 * inicial de urgencias sin autorizacion previa; esto es una DECLARACION DE
 * CAPACIDAD con fecha y hora.
 */
const MOTIVOS: Semilla[] = [
  {
    coleccion: 'motivo_rechazo',
    codigo: 'SIN_CAMA_UCI',
    etiqueta: 'Sin camas UCI disponibles',
    datos: { categoria: 'capacidad', requiereDetalle: false },
  },
  {
    coleccion: 'motivo_rechazo',
    codigo: 'HEMODINAMIA_OCUPADA',
    etiqueta: 'Sala de hemodinamia en procedimiento',
    datos: { categoria: 'infraestructura', requiereDetalle: false },
  },
  {
    coleccion: 'motivo_rechazo',
    codigo: 'URGENCIAS_SATURADA',
    etiqueta: 'Urgencias en capacidad máxima',
    datos: { categoria: 'capacidad', requiereDetalle: false },
  },
  {
    coleccion: 'motivo_rechazo',
    codigo: 'SIN_ESPECIALISTA',
    etiqueta: 'Sin especialista de turno',
    datos: { categoria: 'talento_humano', requiereDetalle: true },
  },
];

/**
 * PROTOCOLOS CLINICOS. Las ventanas son las que se citan en el resto del repo
 * y en la literatura corriente; el comite las confirma o las corrige, y esa
 * correccion queda versionada.
 */
const PROTOCOLOS: Semilla[] = [
  {
    coleccion: 'protocolo',
    codigo: 'CODIGO_INFARTO',
    etiqueta: 'Código infarto — IAM con elevación del ST',
    datos: {
      pasos: [
        'ECG de 12 derivaciones en los primeros 10 minutos',
        'Activar sala de hemodinamia antes de salir hacia la sede',
        'Traslado a IPS con hemodinamia habilitada, no a la más cercana',
      ],
      // Door-to-balloon. Aparece tambien en AGENTS.md y en §6.4.
      ventanaMin: 90,
      referencia: 'Guía de práctica clínica SCA con elevación del ST — MinSalud',
    },
  },
  {
    coleccion: 'protocolo',
    codigo: 'CODIGO_ACV',
    etiqueta: 'Código ACV — ventana de trombólisis',
    datos: {
      pasos: [
        'Hora de inicio de síntomas: es el dato que decide el destino',
        'Imagen cerebral antes de cualquier antitrombótico',
        'Traslado a sede con imágenes diagnósticas y UCI adultos',
      ],
      // 4,5 h desde el inicio de sintomas.
      ventanaMin: 270,
      referencia: 'Guía de ataque cerebrovascular isquémico agudo — MinSalud',
    },
  },
  {
    coleccion: 'protocolo',
    codigo: 'CODIGO_TRAUMA',
    etiqueta: 'Código trauma — hora dorada',
    datos: {
      pasos: [
        'Control de vía aérea y hemorragia externa en escena',
        'Traslado a centro con cirugía e imágenes, no al más cercano',
        'Avisar a la sede antes de salir: el quirófano se prepara en camino',
      ],
      ventanaMin: 60,
      referencia: 'ATLS 10.ª ed. — concepto de hora dorada',
    },
  },
];

/**
 * MAPA Dx → SERVICIOS. §7.2, la tabla que decide.
 *
 * El `codigo` es el prefijo CIE-10 normalizado (sin punto). La resolucion va
 * del prefijo mas especifico al mas general, asi que `I21` cubre `I21.0` y
 * todas sus subcategorias sin repetir filas.
 *
 * ⚠️ LA TABLA ESTA INCOMPLETA A PROPOSITO Y ESO NO ES UN BUG. Cubre los
 *    cuadros de alta letalidad tiempo-dependiente y nada mas. Un diagnostico
 *    que no este aqui NO se adivina: `resolverDx()` devuelve `sin-mapeo` y el
 *    caso escala a criterio humano. Rellenar la tabla "por si acaso" con
 *    exigencias que nadie firmo seria peor que dejar el hueco visible.
 */
const MAPA_DX: Semilla[] = [
  {
    coleccion: 'mapa_dx',
    codigo: 'I21',
    etiqueta: 'Infarto agudo de miocardio',
    datos: {
      serviciosRequeridos: [S.HEMODINAMIA],
      complejidadMinima: 'alta',
      requiereMedicoABordo: true,
      protocolo: 'CODIGO_INFARTO',
    },
  },
  {
    coleccion: 'mapa_dx',
    codigo: 'I63',
    etiqueta: 'Infarto cerebral (ACV isquémico)',
    datos: {
      serviciosRequeridos: [S.IMAGENES_IONIZANTES, S.UCI_ADULTOS],
      complejidadMinima: 'alta',
      requiereMedicoABordo: true,
      protocolo: 'CODIGO_ACV',
    },
  },
  {
    coleccion: 'mapa_dx',
    codigo: 'I61',
    etiqueta: 'Hemorragia intraencefálica',
    datos: {
      serviciosRequeridos: [S.NEUROCIRUGIA, S.IMAGENES_IONIZANTES, S.UCI_ADULTOS],
      complejidadMinima: 'alta',
      requiereMedicoABordo: true,
      protocolo: 'CODIGO_ACV',
    },
  },
  {
    coleccion: 'mapa_dx',
    codigo: 'S06',
    etiqueta: 'Traumatismo intracraneal',
    datos: {
      serviciosRequeridos: [S.NEUROCIRUGIA, S.IMAGENES_IONIZANTES, S.UCI_ADULTOS],
      complejidadMinima: 'alta',
      requiereMedicoABordo: true,
      protocolo: 'CODIGO_TRAUMA',
    },
  },
  {
    coleccion: 'mapa_dx',
    codigo: 'O15',
    etiqueta: 'Eclampsia',
    datos: {
      serviciosRequeridos: [S.GINECOBSTETRICIA, S.UCI_ADULTOS],
      complejidadMinima: 'alta',
      requiereMedicoABordo: true,
      protocolo: null,
    },
  },
  {
    coleccion: 'mapa_dx',
    codigo: 'J96',
    etiqueta: 'Insuficiencia respiratoria aguda',
    datos: {
      serviciosRequeridos: [S.UCI_ADULTOS],
      complejidadMinima: 'alta',
      requiereMedicoABordo: true,
      protocolo: null,
    },
  },
  {
    coleccion: 'mapa_dx',
    codigo: 'P07',
    etiqueta: 'Prematuridad extrema y bajo peso al nacer',
    datos: {
      serviciosRequeridos: [S.UCI_NEONATAL],
      complejidadMinima: 'alta',
      requiereMedicoABordo: true,
      protocolo: null,
    },
  },
  {
    coleccion: 'mapa_dx',
    codigo: 'K35',
    etiqueta: 'Apendicitis aguda',
    datos: {
      serviciosRequeridos: [S.CIRUGIA_GENERAL],
      complejidadMinima: 'media',
      requiereMedicoABordo: false,
      protocolo: null,
    },
  },
];

/**
 * MODELOS. La version 1 describe lo que core corre HOY.
 *
 * `config_scoring/RUTEO` copia los parametros calibrables de
 * `scoring/scoring.service.ts`. Copiarlos no los pone en vigor: core sigue
 * leyendo sus constantes. Lo que hace esta fila es DAR NOMBRE Y VERSION a la
 * configuracion con la que se proceso un caso, que es lo que la tarea pide
 * poder consultar. Que el motor lea de aqui es otra tarea y toca
 * `scoring/`, que no es dominio de esta.
 */
const MODELOS: Semilla[] = [
  {
    coleccion: 'prompt_clinico',
    codigo: 'TRIAGE_EXTRACCION',
    etiqueta: 'Extracción clínica del dictado',
    datos: {
      // No se guarda el texto: ya esta duplicado en Python y TypeScript y esa
      // duplicacion es la tarea 0.5. Una tercera copia empeoraria el problema.
      referencia: 'apps/backend/ai-core (fuente) + core/src/triage/triage.service.ts (respaldo)',
      huella: null,
      notas:
        'Cascada vigente: ai-core (Claude) → Claude local → heurística por palabras clave.',
    },
  },
  {
    coleccion: 'config_scoring',
    codigo: 'RUTEO',
    etiqueta: 'Configuración de ruteo — costo en minutos',
    datos: {
      parametros: {
        ESPERA_RESPUESTA_PRIOR: 4,
        SOBRECOSTO_REBOTE: 18,
        PENALIZACION_REBOTE: 22,
        ESPERA_PUERTA_MAX: 25,
        BONO_CAPACIDAD_MAX: 5,
        FUERZA_PRIOR: 10,
        FUERZA_PRIOR_LATENCIA: 3,
      },
      notas:
        'Todo en minutos (invariante 2 del contrato). Espeja las constantes de scoring.service.ts.',
    },
  },
];

/** Todas las semillas como versiones 1. */
export function semillas(): VersionEntrada[] {
  return [...MOTIVOS, ...PROTOCOLOS, ...MAPA_DX, ...MODELOS].map((s) => ({
    id: `semilla:${s.coleccion}:${s.codigo}`,
    coleccion: s.coleccion,
    codigo: s.codigo,
    version: 1,
    etiqueta: s.etiqueta,
    datos: s.datos,
    activo: true,
    motivo: null,
    creadoEn: CREADO_EN,
    creadoPor: ACTOR,
  }));
}
