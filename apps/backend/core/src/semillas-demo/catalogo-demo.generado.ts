/**
 * ARCHIVO GENERADO — no editar a mano.
 *
 * Lo produce `python3 scripts/datos/generar_sintetico.py` desde
 * data/sintetico/*.csv. Cualquier cambio aqui se pierde en la siguiente
 * corrida: para cambiar el contenido se cambia el generador.
 *
 * ⚠️ DATOS SINTETICOS. Los pacientes, los dictados, las respuestas de los
 *    hospitales y las personas de este archivo NO EXISTEN. Las sedes y sus
 *    codigos REPS de 12 digitos si son reales (data/procesado/sedes.json).
 *
 * Solo se carga con PULSO_DEMO_SINTETICO=true. Ver semillas-demo.service.ts.
 *
 * Generado: 2026-08-23
 * Turno:    2026-08-22 19:00 → 2026-08-23 07:00
 */

import type { Caso, Escalamiento, Handshake } from '../contracts/types';

/** 120 casos del turno de noche. */
export const CASOS_DEMO: Caso[] = [
  {
    "id": "CAS-0001",
    "resumen": "Mujer de 35 años, apendicitis aguda",
    "triage": 3,
    "dxCie10": "K35.8",
    "dxDescripcion": "Apendicitis aguda",
    "serviciosRequeridos": [
      1102,
      203
    ],
    "complejidadRequerida": "media",
    "edad": 35,
    "sexo": "F",
    "signosAlarma": [
      "Blumberg positivo",
      "Fiebre 38",
      "Dolor en fosa ilíaca derecha"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.66,
    "telefonoReporta": "+5716015550101",
    "textoCrudo": "dolor abdominal, femenino de 35, doce horas de evolución, defensa en cuadrante inferior derecho, signos vitales normales",
    "origen": {
      "lat": 4.495137,
      "lng": -74.114371
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-004"
    },
    "creadoEn": "2026-08-22T19:01:44-05:00"
  },
  {
    "id": "CAS-0002",
    "resumen": "Hombre de 41 años, crisis asmática severa",
    "triage": 2,
    "dxCie10": "J46",
    "dxDescripcion": "Crisis asmática severa",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "media",
    "edad": 41,
    "sexo": "M",
    "signosAlarma": [
      "Uso de músculos accesorios",
      "Sibilancias generalizadas",
      "Saturación 86%"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.66,
    "telefonoReporta": "+5716015550102",
    "textoCrudo": "crisis asmática, masculino de 41, satura ochenta y seis con oxígeno, sibilancias en todo el campo, ya lleva dos micronebulizaciones",
    "origen": {
      "lat": 4.601679,
      "lng": -74.061715
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-007"
    },
    "creadoEn": "2026-08-22T19:05:10-05:00"
  },
  {
    "id": "CAS-0003",
    "resumen": "Hombre de 43 años, trauma craneoencefálico severo con hematoma subdural",
    "triage": 1,
    "dxCie10": "S06.5",
    "dxDescripcion": "Trauma craneoencefálico severo con hematoma subdural",
    "serviciosRequeridos": [
      1102,
      110,
      245
    ],
    "complejidadRequerida": "alta",
    "edad": 43,
    "sexo": "M",
    "signosAlarma": [
      "Vómito en proyectil",
      "Glasgow 7",
      "Anisocoria"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.78,
    "telefonoReporta": "+5716015550103",
    "textoCrudo": "masculino de 43, golpe en la cabeza, deterioro progresivo, glasgow ocho, anisocoria, vamos con TAM, cambio",
    "origen": {
      "lat": 4.638455,
      "lng": -74.207614
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-010"
    },
    "creadoEn": "2026-08-22T19:08:05-05:00"
  },
  {
    "id": "CAS-0004",
    "resumen": "Mujer de 41 años, preeclampsia severa",
    "triage": 2,
    "dxCie10": "O14.1",
    "dxDescripcion": "Preeclampsia severa",
    "serviciosRequeridos": [
      1102,
      320,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 41,
    "sexo": "F",
    "signosAlarma": [
      "Tensión 170/110",
      "36 semanas",
      "Edema de miembros inferiores"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.72,
    "telefonoReporta": "+5716015550104",
    "textoCrudo": "materna de 41 años, dolor en epigastrio, tensión alta, edema, sospecha de preeclampsia severa, cambio",
    "origen": {
      "lat": 4.641241,
      "lng": -74.203327
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-013"
    },
    "creadoEn": "2026-08-22T19:11:40-05:00"
  },
  {
    "id": "CAS-0005",
    "resumen": "Mujer de 87 años, accidente cerebrovascular isquémico agudo",
    "triage": 1,
    "dxCie10": "I63.9",
    "dxDescripcion": "Accidente cerebrovascular isquémico agudo",
    "serviciosRequeridos": [
      1102,
      110,
      744
    ],
    "complejidadRequerida": "alta",
    "edad": 87,
    "sexo": "F",
    "signosAlarma": [
      "Afasia",
      "Glasgow 13",
      "Hemiparesia derecha"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.71,
    "telefonoReporta": "+5716015550105",
    "textoCrudo": "posible ACV, femenino de 87, boca desviada, debilidad en brazo derecho, inicio de síntomas siete y media, necesita tomografía ya",
    "origen": {
      "lat": 4.631957,
      "lng": -74.144915
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-016"
    },
    "creadoEn": "2026-08-22T19:12:32-05:00"
  },
  {
    "id": "CAS-0006",
    "resumen": "Mujer de 47 años, politraumatismo grave",
    "triage": 1,
    "dxCie10": "T07",
    "dxDescripcion": "Politraumatismo grave",
    "serviciosRequeridos": [
      1102,
      110,
      203
    ],
    "complejidadRequerida": "alta",
    "edad": 47,
    "sexo": "F",
    "signosAlarma": [
      "Taquicardia 130",
      "Trauma cerrado de tórax",
      "Fractura de fémur abierta"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.72,
    "telefonoReporta": "+5716015550106",
    "textoCrudo": "atropellado, femenino de 47, trauma cerrado de tórax y abdomen, tensión ochenta sobre cuarenta, va inestable, necesitamos cirugía y UCI",
    "origen": {
      "lat": 4.610547,
      "lng": -74.076988
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-019"
    },
    "creadoEn": "2026-08-22T19:19:39-05:00"
  },
  {
    "id": "CAS-0007",
    "resumen": "Mujer de 42 años, herida penetrante de abdomen",
    "triage": 1,
    "dxCie10": "S31.1",
    "dxDescripcion": "Herida penetrante de abdomen",
    "serviciosRequeridos": [
      1102,
      203,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 42,
    "sexo": "F",
    "signosAlarma": [
      "Información insuficiente en el dictado"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.41,
    "telefonoReporta": "+5716015550107",
    "textoCrudo": "una señora dice que le duele todo desde ayer, no me sé la edad, se ve regular, cambio",
    "origen": {
      "lat": 4.641998,
      "lng": -74.210648
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-022"
    },
    "creadoEn": "2026-08-22T19:23:39-05:00"
  },
  {
    "id": "CAS-0008",
    "resumen": "Hombre de 68 años, hemorragia de vías digestivas altas",
    "triage": 2,
    "dxCie10": "K92.2",
    "dxDescripcion": "Hemorragia de vías digestivas altas",
    "serviciosRequeridos": [
      1102,
      203,
      712
    ],
    "complejidadRequerida": "media",
    "edad": 68,
    "sexo": "M",
    "signosAlarma": [
      "Hematemesis",
      "Palidez mucocutánea",
      "Melenas de dos días"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.77,
    "telefonoReporta": "+5716015550108",
    "textoCrudo": "masculino de 68, vomitó sangre dos veces, deposiciones negras desde ayer, pálido, tensión cien sobre sesenta",
    "origen": {
      "lat": 4.591034,
      "lng": -74.08937
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-025"
    },
    "creadoEn": "2026-08-22T19:31:52-05:00"
  },
  {
    "id": "CAS-0009",
    "resumen": "Hombre de 15 años, crisis convulsiva",
    "triage": 3,
    "dxCie10": "R56.8",
    "dxDescripcion": "Crisis convulsiva",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 15,
    "sexo": "M",
    "signosAlarma": [
      "Postictal",
      "Convulsión tónico-clónica de 3 minutos",
      "Glasgow 14 al llegar"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.7,
    "telefonoReporta": "+5716015550109",
    "textoCrudo": "masculino de 15, episodio convulsivo, sin antecedente conocido, ahora somnoliento, estable",
    "origen": {
      "lat": 4.693887,
      "lng": -74.109416
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-028"
    },
    "creadoEn": "2026-08-22T19:33:12-05:00"
  },
  {
    "id": "CAS-0010",
    "resumen": "Mujer de 31 años, preeclampsia severa",
    "triage": 2,
    "dxCie10": "O14.1",
    "dxDescripcion": "Preeclampsia severa",
    "serviciosRequeridos": [
      1102,
      320,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 31,
    "sexo": "F",
    "signosAlarma": [
      "36 semanas",
      "Edema de miembros inferiores",
      "Cefalea y fosfenos"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.96,
    "telefonoReporta": "+5716015550110",
    "textoCrudo": "gestante de 31, treinta y seis semanas, tensión ciento setenta sobre ciento diez, cefalea y ve lucecitas, requiere ginecobstetricia, cambio",
    "origen": {
      "lat": 4.698543,
      "lng": -74.111356
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-031"
    },
    "creadoEn": "2026-08-22T19:38:35-05:00"
  },
  {
    "id": "CAS-0011",
    "resumen": "Mujer de 51 años, politraumatismo grave",
    "triage": 1,
    "dxCie10": "T07",
    "dxDescripcion": "Politraumatismo grave",
    "serviciosRequeridos": [
      1102,
      110,
      203
    ],
    "complejidadRequerida": "alta",
    "edad": 51,
    "sexo": "F",
    "signosAlarma": [
      "Taquicardia 130",
      "Fractura de fémur abierta",
      "Glasgow 12"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.66,
    "telefonoReporta": "+5716015550111",
    "textoCrudo": "atropellado, femenino de 51, trauma cerrado de tórax y abdomen, tensión ochenta sobre cuarenta, va inestable, necesitamos cirugía y UCI",
    "origen": {
      "lat": 4.698792,
      "lng": -74.106217
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-034"
    },
    "creadoEn": "2026-08-22T19:40:35-05:00"
  },
  {
    "id": "CAS-0012",
    "resumen": "Hombre de 2 años, bronquiolitis con dificultad respiratoria",
    "triage": 2,
    "dxCie10": "J21.9",
    "dxDescripcion": "Bronquiolitis con dificultad respiratoria",
    "serviciosRequeridos": [
      1102,
      109
    ],
    "complejidadRequerida": "alta",
    "edad": 2,
    "sexo": "M",
    "signosAlarma": [
      "Tiraje subcostal",
      "Rechazo de la vía oral",
      "Saturación 89%"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.92,
    "telefonoReporta": "+5716015550112",
    "textoCrudo": "menor de 2 años, cuadro gripal de tres días, hoy respira rápido, tiraje subcostal, cambio",
    "origen": {
      "lat": 4.720524,
      "lng": -74.040512
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-037"
    },
    "creadoEn": "2026-08-22T19:41:30-05:00"
  },
  {
    "id": "CAS-0013",
    "resumen": "Mujer de 0 años, bronquiolitis con dificultad respiratoria",
    "triage": 2,
    "dxCie10": "J21.9",
    "dxDescripcion": "Bronquiolitis con dificultad respiratoria",
    "serviciosRequeridos": [
      1102,
      109
    ],
    "complejidadRequerida": "alta",
    "edad": 0,
    "sexo": "F",
    "signosAlarma": [
      "Saturación 89%",
      "Tiraje subcostal",
      "Rechazo de la vía oral"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.87,
    "telefonoReporta": "+5716015550113",
    "textoCrudo": "lactante de 0 años, dificultad respiratoria, satura ochenta y nueve, tiraje, no recibe seno, requiere pediatría",
    "origen": {
      "lat": 4.668576,
      "lng": -74.074653
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-040"
    },
    "creadoEn": "2026-08-22T19:43:06-05:00"
  },
  {
    "id": "CAS-0014",
    "resumen": "Mujer de 31 años, crisis asmática severa",
    "triage": 2,
    "dxCie10": "J46",
    "dxDescripcion": "Crisis asmática severa",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "media",
    "edad": 31,
    "sexo": "F",
    "signosAlarma": [
      "Saturación 86%",
      "Sibilancias generalizadas",
      "Uso de músculos accesorios"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.86,
    "telefonoReporta": "+5716015550114",
    "textoCrudo": "femenino de 31, no puede completar frases, tiraje, satura ochenta y ocho, antecedente de asma, cambio",
    "origen": {
      "lat": 4.621083,
      "lng": -74.144229
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-003"
    },
    "creadoEn": "2026-08-22T19:51:45-05:00"
  },
  {
    "id": "CAS-0015",
    "resumen": "Mujer de 1 años, bronquiolitis con dificultad respiratoria",
    "triage": 2,
    "dxCie10": "J21.9",
    "dxDescripcion": "Bronquiolitis con dificultad respiratoria",
    "serviciosRequeridos": [
      1102,
      109
    ],
    "complejidadRequerida": "alta",
    "edad": 1,
    "sexo": "F",
    "signosAlarma": [
      "Rechazo de la vía oral",
      "Tiraje subcostal",
      "Saturación 89%"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.88,
    "telefonoReporta": "+5716015550115",
    "textoCrudo": "lactante de 1 años, dificultad respiratoria, satura ochenta y nueve, tiraje, no recibe seno, requiere pediatría",
    "origen": {
      "lat": 4.632829,
      "lng": -74.152664
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-006"
    },
    "creadoEn": "2026-08-22T19:55:00-05:00"
  },
  {
    "id": "CAS-0016",
    "resumen": "Mujer de 59 años, infarto agudo de miocardio con elevación del st",
    "triage": 1,
    "dxCie10": "I21.0",
    "dxDescripcion": "Infarto agudo de miocardio con elevación del ST",
    "serviciosRequeridos": [
      1102,
      743,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 59,
    "sexo": "F",
    "signosAlarma": [
      "Dolor precordial opresivo",
      "ST elevado en DII-DIII",
      "Hipotensión"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.71,
    "telefonoReporta": "+5716015550116",
    "textoCrudo": "reporto femenino de 59, dolor de pecho desde hace media hora, se ve pálido, frío, tensión ochenta y cinco sobre cincuenta, requiere hemodinamia, cambio",
    "origen": {
      "lat": 4.631946,
      "lng": -74.141187
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-009"
    },
    "creadoEn": "2026-08-22T19:59:15-05:00"
  },
  {
    "id": "CAS-0017",
    "resumen": "Mujer de 29 años, preeclampsia severa",
    "triage": 2,
    "dxCie10": "O14.1",
    "dxDescripcion": "Preeclampsia severa",
    "serviciosRequeridos": [
      1102,
      320,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 29,
    "sexo": "F",
    "signosAlarma": [
      "Información insuficiente en el dictado"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.41,
    "telefonoReporta": "+5716015550117",
    "textoCrudo": "una señora dice que le duele todo desde ayer, no me sé la edad, se ve regular, cambio",
    "origen": {
      "lat": 4.494868,
      "lng": -74.114013
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-012"
    },
    "creadoEn": "2026-08-22T20:08:34-05:00"
  },
  {
    "id": "CAS-0018",
    "resumen": "Mujer de 63 años, crisis convulsiva",
    "triage": 3,
    "dxCie10": "R56.8",
    "dxDescripcion": "Crisis convulsiva",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 63,
    "sexo": "F",
    "signosAlarma": [
      "Postictal",
      "Glasgow 14 al llegar",
      "Convulsión tónico-clónica de 3 minutos"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.9,
    "telefonoReporta": "+5716015550118",
    "textoCrudo": "convulsión en vía pública, femenino de 63, duró unos tres minutos, ya cedió, está postictal, glasgow catorce",
    "origen": {
      "lat": 4.620826,
      "lng": -74.15206
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-015"
    },
    "creadoEn": "2026-08-22T20:11:34-05:00"
  },
  {
    "id": "CAS-0019",
    "resumen": "Mujer de 78 años, choque séptico de origen urinario",
    "triage": 2,
    "dxCie10": "A41.9",
    "dxDescripcion": "Choque séptico de origen urinario",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 78,
    "sexo": "F",
    "signosAlarma": [
      "Fiebre 39.2",
      "Lactato alto",
      "Hipotensión que no responde a líquidos"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.63,
    "telefonoReporta": "+5716015550119",
    "textoCrudo": "femenino de 78, fiebre alta tres días, hoy confundida, tensión ochenta sobre cincuenta, no levanta con líquidos, sospecho sepsis urinaria",
    "origen": {
      "lat": 4.633935,
      "lng": -74.200529
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-018"
    },
    "creadoEn": "2026-08-22T20:13:38-05:00"
  },
  {
    "id": "CAS-0020",
    "resumen": "Hombre de 1 años, bronquiolitis con dificultad respiratoria",
    "triage": 2,
    "dxCie10": "J21.9",
    "dxDescripcion": "Bronquiolitis con dificultad respiratoria",
    "serviciosRequeridos": [
      1102,
      109
    ],
    "complejidadRequerida": "alta",
    "edad": 1,
    "sexo": "M",
    "signosAlarma": [
      "Tiraje subcostal",
      "Rechazo de la vía oral",
      "Saturación 89%"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.76,
    "telefonoReporta": "+5716015550120",
    "textoCrudo": "menor de 1 años, cuadro gripal de tres días, hoy respira rápido, tiraje subcostal, cambio",
    "origen": {
      "lat": 4.677479,
      "lng": -74.150878
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-021"
    },
    "creadoEn": "2026-08-22T20:15:53-05:00"
  },
  {
    "id": "CAS-0021",
    "resumen": "Hombre de 34 años, herida penetrante de abdomen",
    "triage": 1,
    "dxCie10": "S31.1",
    "dxDescripcion": "Herida penetrante de abdomen",
    "serviciosRequeridos": [
      1102,
      203,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 34,
    "sexo": "M",
    "signosAlarma": [
      "Herida penetrante en flanco izquierdo",
      "Palidez",
      "Pulso filiforme"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.65,
    "telefonoReporta": "+5716015550121",
    "textoCrudo": "masculino de 34, herida en flanco izquierdo, consciente pero pálido, taquicárdico, necesita cirugía general urgente",
    "origen": {
      "lat": 4.605958,
      "lng": -74.06436
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-024"
    },
    "creadoEn": "2026-08-22T20:21:12-05:00"
  },
  {
    "id": "CAS-0022",
    "resumen": "Mujer de 36 años, preeclampsia severa",
    "triage": 2,
    "dxCie10": "O14.1",
    "dxDescripcion": "Preeclampsia severa",
    "serviciosRequeridos": [
      1102,
      320,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 36,
    "sexo": "F",
    "signosAlarma": [
      "Cefalea y fosfenos",
      "36 semanas",
      "Tensión 170/110"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.67,
    "telefonoReporta": "+5716015550122",
    "textoCrudo": "materna de 36 años, dolor en epigastrio, tensión alta, edema, sospecha de preeclampsia severa, cambio",
    "origen": {
      "lat": 4.627033,
      "lng": -74.122606
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-027"
    },
    "creadoEn": "2026-08-22T20:25:21-05:00"
  },
  {
    "id": "CAS-0023",
    "resumen": "Mujer de 33 años, crisis convulsiva",
    "triage": 3,
    "dxCie10": "R56.8",
    "dxDescripcion": "Crisis convulsiva",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 33,
    "sexo": "F",
    "signosAlarma": [
      "Glasgow 14 al llegar",
      "Convulsión tónico-clónica de 3 minutos",
      "Postictal"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.69,
    "telefonoReporta": "+5716015550123",
    "textoCrudo": "femenino de 33, episodio convulsivo, sin antecedente conocido, ahora somnoliento, estable",
    "origen": {
      "lat": 4.632948,
      "lng": -74.147323
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-030"
    },
    "creadoEn": "2026-08-22T20:34:13-05:00"
  },
  {
    "id": "CAS-0024",
    "resumen": "Mujer de 60 años, choque séptico de origen urinario",
    "triage": 2,
    "dxCie10": "A41.9",
    "dxDescripcion": "Choque séptico de origen urinario",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 60,
    "sexo": "F",
    "signosAlarma": [
      "Fiebre 39.2",
      "Lactato alto",
      "Hipotensión que no responde a líquidos"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.78,
    "telefonoReporta": "+5716015550124",
    "textoCrudo": "femenino de 60, fiebre alta tres días, hoy confundida, tensión ochenta sobre cincuenta, no levanta con líquidos, sospecho sepsis urinaria",
    "origen": {
      "lat": 4.642368,
      "lng": -74.207413
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-033"
    },
    "creadoEn": "2026-08-22T20:43:13-05:00"
  },
  {
    "id": "CAS-0025",
    "resumen": "Mujer de 64 años, fractura cerrada de tibia",
    "triage": 3,
    "dxCie10": "S82.9",
    "dxDescripcion": "Fractura cerrada de tibia",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 64,
    "sexo": "F",
    "signosAlarma": [
      "Dolor 8/10",
      "Deformidad de pierna izquierda",
      "Pulso distal presente"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.96,
    "telefonoReporta": "+5716015550125",
    "textoCrudo": "caída en la vía, femenino de 64, pierna izquierda deformada, pulso distal presente, dolor ocho de diez, inmovilizada",
    "origen": {
      "lat": 4.700256,
      "lng": -74.109791
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-036"
    },
    "creadoEn": "2026-08-22T20:46:14-05:00"
  },
  {
    "id": "CAS-0026",
    "resumen": "Mujer de 73 años, fractura cerrada de tibia",
    "triage": 3,
    "dxCie10": "S82.9",
    "dxDescripcion": "Fractura cerrada de tibia",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 73,
    "sexo": "F",
    "signosAlarma": [
      "Deformidad de pierna izquierda",
      "Pulso distal presente",
      "Dolor 8/10"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.62,
    "telefonoReporta": "+5716015550126",
    "textoCrudo": "femenino de 73, trauma de miembro inferior, sospecha de fractura de tibia, estable, requiere radiología",
    "origen": {
      "lat": 4.631444,
      "lng": -74.20601
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-039"
    },
    "creadoEn": "2026-08-22T20:48:31-05:00"
  },
  {
    "id": "CAS-0027",
    "resumen": "Mujer de 62 años, hemorragia de vías digestivas altas",
    "triage": 2,
    "dxCie10": "K92.2",
    "dxDescripcion": "Hemorragia de vías digestivas altas",
    "serviciosRequeridos": [
      1102,
      203,
      712
    ],
    "complejidadRequerida": "media",
    "edad": 62,
    "sexo": "F",
    "signosAlarma": [
      "Información insuficiente en el dictado"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.37,
    "telefonoReporta": "+5716015550127",
    "textoCrudo": "una señora dice que le duele todo desde ayer, no me sé la edad, se ve regular, cambio",
    "origen": {
      "lat": 4.610268,
      "lng": -74.080888
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-002"
    },
    "creadoEn": "2026-08-22T20:54:35-05:00"
  },
  {
    "id": "CAS-0028",
    "resumen": "Hombre de 39 años, hemorragia de vías digestivas altas",
    "triage": 2,
    "dxCie10": "K92.2",
    "dxDescripcion": "Hemorragia de vías digestivas altas",
    "serviciosRequeridos": [
      1102,
      203,
      712
    ],
    "complejidadRequerida": "media",
    "edad": 39,
    "sexo": "M",
    "signosAlarma": [
      "Melenas de dos días",
      "Hematemesis",
      "Palidez mucocutánea"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.74,
    "telefonoReporta": "+5716015550128",
    "textoCrudo": "sangrado digestivo, masculino de 39, hematemesis en casa, consciente, taquicárdico, cambio",
    "origen": {
      "lat": 4.635488,
      "lng": -74.111398
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-005"
    },
    "creadoEn": "2026-08-22T20:55:14-05:00"
  },
  {
    "id": "CAS-0029",
    "resumen": "Mujer de 28 años, crisis convulsiva",
    "triage": 3,
    "dxCie10": "R56.8",
    "dxDescripcion": "Crisis convulsiva",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 28,
    "sexo": "F",
    "signosAlarma": [
      "Glasgow 14 al llegar",
      "Postictal",
      "Convulsión tónico-clónica de 3 minutos"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.69,
    "telefonoReporta": "+5716015550129",
    "textoCrudo": "femenino de 28, episodio convulsivo, sin antecedente conocido, ahora somnoliento, estable",
    "origen": {
      "lat": 4.670318,
      "lng": -74.146488
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-008"
    },
    "creadoEn": "2026-08-22T20:56:20-05:00"
  },
  {
    "id": "CAS-0030",
    "resumen": "Hombre de 75 años, infarto agudo de miocardio con elevación del st",
    "triage": 1,
    "dxCie10": "I21.0",
    "dxDescripcion": "Infarto agudo de miocardio con elevación del ST",
    "serviciosRequeridos": [
      1102,
      743,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 75,
    "sexo": "M",
    "signosAlarma": [
      "Dolor precordial opresivo",
      "Diaforesis",
      "ST elevado en DII-DIII"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.96,
    "telefonoReporta": "+5716015550130",
    "textoCrudo": "central, masculino de unos 75 y tantos, dolor precordial opresivo irradiado a brazo izquierdo, veinte minutos, sudoroso, tensión noventa sobre sesenta, cambio",
    "origen": {
      "lat": 4.697857,
      "lng": -74.115102
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-011"
    },
    "creadoEn": "2026-08-22T20:59:22-05:00"
  },
  {
    "id": "CAS-0031",
    "resumen": "Mujer de 1 años, bronquiolitis con dificultad respiratoria",
    "triage": 2,
    "dxCie10": "J21.9",
    "dxDescripcion": "Bronquiolitis con dificultad respiratoria",
    "serviciosRequeridos": [
      1102,
      109
    ],
    "complejidadRequerida": "alta",
    "edad": 1,
    "sexo": "F",
    "signosAlarma": [
      "Tiraje subcostal",
      "Rechazo de la vía oral",
      "Saturación 89%"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.76,
    "telefonoReporta": "+5716015550131",
    "textoCrudo": "lactante de 1 años, dificultad respiratoria, satura ochenta y nueve, tiraje, no recibe seno, requiere pediatría",
    "origen": {
      "lat": 4.636638,
      "lng": -74.199519
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-014"
    },
    "creadoEn": "2026-08-22T21:02:01-05:00"
  },
  {
    "id": "CAS-0032",
    "resumen": "Mujer de 26 años, crisis convulsiva",
    "triage": 3,
    "dxCie10": "R56.8",
    "dxDescripcion": "Crisis convulsiva",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 26,
    "sexo": "F",
    "signosAlarma": [
      "Convulsión tónico-clónica de 3 minutos",
      "Postictal",
      "Glasgow 14 al llegar"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.69,
    "telefonoReporta": "+5716015550132",
    "textoCrudo": "femenino de 26, episodio convulsivo, sin antecedente conocido, ahora somnoliento, estable",
    "origen": {
      "lat": 4.640825,
      "lng": -74.077909
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-017"
    },
    "creadoEn": "2026-08-22T21:04:12-05:00"
  },
  {
    "id": "CAS-0033",
    "resumen": "Mujer de 36 años, crisis asmática severa",
    "triage": 2,
    "dxCie10": "J46",
    "dxDescripcion": "Crisis asmática severa",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "media",
    "edad": 36,
    "sexo": "F",
    "signosAlarma": [
      "Saturación 86%",
      "Sibilancias generalizadas",
      "Uso de músculos accesorios"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.82,
    "telefonoReporta": "+5716015550133",
    "textoCrudo": "crisis asmática, femenino de 36, satura ochenta y seis con oxígeno, sibilancias en todo el campo, ya lleva dos micronebulizaciones",
    "origen": {
      "lat": 4.693954,
      "lng": -74.110954
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-020"
    },
    "creadoEn": "2026-08-22T21:07:18-05:00"
  },
  {
    "id": "CAS-0034",
    "resumen": "Hombre de 28 años, fractura cerrada de tibia",
    "triage": 3,
    "dxCie10": "S82.9",
    "dxDescripcion": "Fractura cerrada de tibia",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 28,
    "sexo": "M",
    "signosAlarma": [
      "Dolor 8/10",
      "Deformidad de pierna izquierda",
      "Pulso distal presente"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.83,
    "telefonoReporta": "+5716015550134",
    "textoCrudo": "masculino de 28, trauma de miembro inferior, sospecha de fractura de tibia, estable, requiere radiología",
    "origen": {
      "lat": 4.744763,
      "lng": -74.082762
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-023"
    },
    "creadoEn": "2026-08-22T21:13:48-05:00"
  },
  {
    "id": "CAS-0035",
    "resumen": "Hombre de 17 años, fractura cerrada de tibia",
    "triage": 3,
    "dxCie10": "S82.9",
    "dxDescripcion": "Fractura cerrada de tibia",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 17,
    "sexo": "M",
    "signosAlarma": [
      "Dolor 8/10",
      "Deformidad de pierna izquierda",
      "Pulso distal presente"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.83,
    "telefonoReporta": "+5716015550135",
    "textoCrudo": "caída en la vía, masculino de 17, pierna izquierda deformada, pulso distal presente, dolor ocho de diez, inmovilizada",
    "origen": {
      "lat": 4.672657,
      "lng": -74.144654
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-026"
    },
    "creadoEn": "2026-08-22T21:17:01-05:00"
  },
  {
    "id": "CAS-0036",
    "resumen": "Mujer de 11 años, apendicitis aguda",
    "triage": 3,
    "dxCie10": "K35.8",
    "dxDescripcion": "Apendicitis aguda",
    "serviciosRequeridos": [
      1102,
      203
    ],
    "complejidadRequerida": "media",
    "edad": 11,
    "sexo": "F",
    "signosAlarma": [
      "Dolor en fosa ilíaca derecha",
      "Fiebre 38",
      "Blumberg positivo"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.96,
    "telefonoReporta": "+5716015550136",
    "textoCrudo": "dolor abdominal, femenino de 11, doce horas de evolución, defensa en cuadrante inferior derecho, signos vitales normales",
    "origen": {
      "lat": 4.640041,
      "lng": -74.199209
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-029"
    },
    "creadoEn": "2026-08-22T21:19:21-05:00"
  },
  {
    "id": "CAS-0037",
    "resumen": "Hombre de 45 años, politraumatismo grave",
    "triage": 1,
    "dxCie10": "T07",
    "dxDescripcion": "Politraumatismo grave",
    "serviciosRequeridos": [
      1102,
      110,
      203
    ],
    "complejidadRequerida": "alta",
    "edad": 45,
    "sexo": "M",
    "signosAlarma": [
      "Información insuficiente en el dictado"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.32,
    "telefonoReporta": "+5716015550137",
    "textoCrudo": "una señora dice que le duele todo desde ayer, no me sé la edad, se ve regular, cambio",
    "origen": {
      "lat": 4.72965,
      "lng": -74.043025
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-032"
    },
    "creadoEn": "2026-08-22T21:22:04-05:00"
  },
  {
    "id": "CAS-0038",
    "resumen": "Mujer de 60 años, hemorragia de vías digestivas altas",
    "triage": 2,
    "dxCie10": "K92.2",
    "dxDescripcion": "Hemorragia de vías digestivas altas",
    "serviciosRequeridos": [
      1102,
      203,
      712
    ],
    "complejidadRequerida": "media",
    "edad": 60,
    "sexo": "F",
    "signosAlarma": [
      "Palidez mucocutánea",
      "Melenas de dos días",
      "Hematemesis"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.95,
    "telefonoReporta": "+5716015550138",
    "textoCrudo": "femenino de 60, vomitó sangre dos veces, deposiciones negras desde ayer, pálido, tensión cien sobre sesenta",
    "origen": {
      "lat": 4.623771,
      "lng": -74.141711
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-035"
    },
    "creadoEn": "2026-08-22T21:27:36-05:00"
  },
  {
    "id": "CAS-0039",
    "resumen": "Hombre de 46 años, politraumatismo grave",
    "triage": 1,
    "dxCie10": "T07",
    "dxDescripcion": "Politraumatismo grave",
    "serviciosRequeridos": [
      1102,
      110,
      203
    ],
    "complejidadRequerida": "alta",
    "edad": 46,
    "sexo": "M",
    "signosAlarma": [
      "Taquicardia 130",
      "Fractura de fémur abierta",
      "Trauma cerrado de tórax"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.74,
    "telefonoReporta": "+5716015550139",
    "textoCrudo": "accidente de moto en la Autopista Sur, masculino de 46, politrauma, fémur abierto, tórax con crepitación, frecuencia ciento treinta, glasgow doce, cambio",
    "origen": {
      "lat": 4.596794,
      "lng": -74.085425
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-038"
    },
    "creadoEn": "2026-08-22T21:28:40-05:00"
  },
  {
    "id": "CAS-0040",
    "resumen": "Mujer de 76 años, accidente cerebrovascular isquémico agudo",
    "triage": 1,
    "dxCie10": "I63.9",
    "dxDescripcion": "Accidente cerebrovascular isquémico agudo",
    "serviciosRequeridos": [
      1102,
      110,
      744
    ],
    "complejidadRequerida": "alta",
    "edad": 76,
    "sexo": "F",
    "signosAlarma": [
      "Glasgow 13",
      "Hemiparesia derecha",
      "Inicio hace 40 minutos"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.81,
    "telefonoReporta": "+5716015550140",
    "textoCrudo": "femenino de 76, la familia dice que empezó hace cuarenta minutos, no mueve el lado derecho y no habla claro, glasgow trece, vamos con ventana, cambio",
    "origen": {
      "lat": 4.701354,
      "lng": -74.114519
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-001"
    },
    "creadoEn": "2026-08-22T21:40:41-05:00"
  },
  {
    "id": "CAS-0041",
    "resumen": "Mujer de 38 años, crisis asmática severa",
    "triage": 2,
    "dxCie10": "J46",
    "dxDescripcion": "Crisis asmática severa",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "media",
    "edad": 38,
    "sexo": "F",
    "signosAlarma": [
      "Sibilancias generalizadas",
      "Saturación 86%",
      "Uso de músculos accesorios"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.94,
    "telefonoReporta": "+5716015550141",
    "textoCrudo": "femenino de 38, no puede completar frases, tiraje, satura ochenta y ocho, antecedente de asma, cambio",
    "origen": {
      "lat": 4.667617,
      "lng": -74.144012
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-004"
    },
    "creadoEn": "2026-08-22T21:41:47-05:00"
  },
  {
    "id": "CAS-0042",
    "resumen": "Hombre de 40 años, crisis asmática severa",
    "triage": 2,
    "dxCie10": "J46",
    "dxDescripcion": "Crisis asmática severa",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "media",
    "edad": 40,
    "sexo": "M",
    "signosAlarma": [
      "Uso de músculos accesorios",
      "Sibilancias generalizadas",
      "Saturación 86%"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.96,
    "telefonoReporta": "+5716015550142",
    "textoCrudo": "masculino de 40, no puede completar frases, tiraje, satura ochenta y ocho, antecedente de asma, cambio",
    "origen": {
      "lat": 4.632136,
      "lng": -74.213538
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-007"
    },
    "creadoEn": "2026-08-22T21:44:20-05:00"
  },
  {
    "id": "CAS-0043",
    "resumen": "Hombre de 48 años, hemorragia de vías digestivas altas",
    "triage": 2,
    "dxCie10": "K92.2",
    "dxDescripcion": "Hemorragia de vías digestivas altas",
    "serviciosRequeridos": [
      1102,
      203,
      712
    ],
    "complejidadRequerida": "media",
    "edad": 48,
    "sexo": "M",
    "signosAlarma": [
      "Melenas de dos días",
      "Hematemesis",
      "Palidez mucocutánea"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.76,
    "telefonoReporta": "+5716015550143",
    "textoCrudo": "sangrado digestivo, masculino de 48, hematemesis en casa, consciente, taquicárdico, cambio",
    "origen": {
      "lat": 4.634059,
      "lng": -74.206531
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-010"
    },
    "creadoEn": "2026-08-22T21:53:36-05:00"
  },
  {
    "id": "CAS-0044",
    "resumen": "Mujer de 15 años, apendicitis aguda",
    "triage": 3,
    "dxCie10": "K35.8",
    "dxDescripcion": "Apendicitis aguda",
    "serviciosRequeridos": [
      1102,
      203
    ],
    "complejidadRequerida": "media",
    "edad": 15,
    "sexo": "F",
    "signosAlarma": [
      "Blumberg positivo",
      "Fiebre 38",
      "Dolor en fosa ilíaca derecha"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.93,
    "telefonoReporta": "+5716015550144",
    "textoCrudo": "dolor abdominal, femenino de 15, doce horas de evolución, defensa en cuadrante inferior derecho, signos vitales normales",
    "origen": {
      "lat": 4.576988,
      "lng": -74.130831
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-013"
    },
    "creadoEn": "2026-08-22T21:59:06-05:00"
  },
  {
    "id": "CAS-0045",
    "resumen": "Mujer de 18 años, crisis convulsiva",
    "triage": 3,
    "dxCie10": "R56.8",
    "dxDescripcion": "Crisis convulsiva",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 18,
    "sexo": "F",
    "signosAlarma": [
      "Glasgow 14 al llegar",
      "Postictal",
      "Convulsión tónico-clónica de 3 minutos"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.8,
    "telefonoReporta": "+5716015550145",
    "textoCrudo": "femenino de 18, episodio convulsivo, sin antecedente conocido, ahora somnoliento, estable",
    "origen": {
      "lat": 4.641078,
      "lng": -74.201992
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-016"
    },
    "creadoEn": "2026-08-22T22:08:04-05:00"
  },
  {
    "id": "CAS-0046",
    "resumen": "Hombre de 85 años, accidente cerebrovascular isquémico agudo",
    "triage": 1,
    "dxCie10": "I63.9",
    "dxDescripcion": "Accidente cerebrovascular isquémico agudo",
    "serviciosRequeridos": [
      1102,
      110,
      744
    ],
    "complejidadRequerida": "alta",
    "edad": 85,
    "sexo": "M",
    "signosAlarma": [
      "Glasgow 13",
      "Hemiparesia derecha",
      "Inicio hace 40 minutos"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.95,
    "telefonoReporta": "+5716015550146",
    "textoCrudo": "masculino de 85, la familia dice que empezó hace cuarenta minutos, no mueve el lado derecho y no habla claro, glasgow trece, vamos con ventana, cambio",
    "origen": {
      "lat": 4.636137,
      "lng": -74.114205
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-019"
    },
    "creadoEn": "2026-08-22T22:13:47-05:00"
  },
  {
    "id": "CAS-0047",
    "resumen": "Hombre de 1 años, bronquiolitis con dificultad respiratoria",
    "triage": 2,
    "dxCie10": "J21.9",
    "dxDescripcion": "Bronquiolitis con dificultad respiratoria",
    "serviciosRequeridos": [
      1102,
      109
    ],
    "complejidadRequerida": "alta",
    "edad": 1,
    "sexo": "M",
    "signosAlarma": [
      "Información insuficiente en el dictado"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.34,
    "telefonoReporta": "+5716015550147",
    "textoCrudo": "una señora dice que le duele todo desde ayer, no me sé la edad, se ve regular, cambio",
    "origen": {
      "lat": 4.695031,
      "lng": -74.113701
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-022"
    },
    "creadoEn": "2026-08-22T22:15:47-05:00"
  },
  {
    "id": "CAS-0048",
    "resumen": "Hombre de 56 años, fractura cerrada de tibia",
    "triage": 3,
    "dxCie10": "S82.9",
    "dxDescripcion": "Fractura cerrada de tibia",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 56,
    "sexo": "M",
    "signosAlarma": [
      "Deformidad de pierna izquierda",
      "Pulso distal presente",
      "Dolor 8/10"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.7,
    "telefonoReporta": "+5716015550148",
    "textoCrudo": "masculino de 56, trauma de miembro inferior, sospecha de fractura de tibia, estable, requiere radiología",
    "origen": {
      "lat": 4.638359,
      "lng": -74.212399
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-025"
    },
    "creadoEn": "2026-08-22T22:20:38-05:00"
  },
  {
    "id": "CAS-0049",
    "resumen": "Mujer de 42 años, apendicitis aguda",
    "triage": 3,
    "dxCie10": "K35.8",
    "dxDescripcion": "Apendicitis aguda",
    "serviciosRequeridos": [
      1102,
      203
    ],
    "complejidadRequerida": "media",
    "edad": 42,
    "sexo": "F",
    "signosAlarma": [
      "Dolor en fosa ilíaca derecha",
      "Blumberg positivo",
      "Fiebre 38"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.92,
    "telefonoReporta": "+5716015550149",
    "textoCrudo": "dolor abdominal, femenino de 42, doce horas de evolución, defensa en cuadrante inferior derecho, signos vitales normales",
    "origen": {
      "lat": 4.690727,
      "lng": -74.105906
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-028"
    },
    "creadoEn": "2026-08-22T22:23:35-05:00"
  },
  {
    "id": "CAS-0050",
    "resumen": "Mujer de 20 años, preeclampsia severa",
    "triage": 2,
    "dxCie10": "O14.1",
    "dxDescripcion": "Preeclampsia severa",
    "serviciosRequeridos": [
      1102,
      320,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 20,
    "sexo": "F",
    "signosAlarma": [
      "Cefalea y fosfenos",
      "Edema de miembros inferiores",
      "36 semanas"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.69,
    "telefonoReporta": "+5716015550150",
    "textoCrudo": "gestante de 20, treinta y seis semanas, tensión ciento setenta sobre ciento diez, cefalea y ve lucecitas, requiere ginecobstetricia, cambio",
    "origen": {
      "lat": 4.735448,
      "lng": -74.095773
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-031"
    },
    "creadoEn": "2026-08-22T22:39:20-05:00"
  },
  {
    "id": "CAS-0051",
    "resumen": "Hombre de 64 años, infarto agudo de miocardio con elevación del st",
    "triage": 1,
    "dxCie10": "I21.0",
    "dxDescripcion": "Infarto agudo de miocardio con elevación del ST",
    "serviciosRequeridos": [
      1102,
      743,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 64,
    "sexo": "M",
    "signosAlarma": [
      "Diaforesis",
      "Hipotensión",
      "ST elevado en DII-DIII"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.9,
    "telefonoReporta": "+5716015550151",
    "textoCrudo": "reporto masculino de 64, dolor de pecho desde hace media hora, se ve pálido, frío, tensión ochenta y cinco sobre cincuenta, requiere hemodinamia, cambio",
    "origen": {
      "lat": 4.705755,
      "lng": -74.110577
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-034"
    },
    "creadoEn": "2026-08-22T22:40:11-05:00"
  },
  {
    "id": "CAS-0052",
    "resumen": "Mujer de 27 años, crisis asmática severa",
    "triage": 2,
    "dxCie10": "J46",
    "dxDescripcion": "Crisis asmática severa",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "media",
    "edad": 27,
    "sexo": "F",
    "signosAlarma": [
      "Sibilancias generalizadas",
      "Saturación 86%",
      "Uso de músculos accesorios"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.79,
    "telefonoReporta": "+5716015550152",
    "textoCrudo": "femenino de 27, no puede completar frases, tiraje, satura ochenta y ocho, antecedente de asma, cambio",
    "origen": {
      "lat": 4.640163,
      "lng": -74.209524
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-037"
    },
    "creadoEn": "2026-08-22T22:43:16-05:00"
  },
  {
    "id": "CAS-0053",
    "resumen": "Mujer de 60 años, hemorragia de vías digestivas altas",
    "triage": 2,
    "dxCie10": "K92.2",
    "dxDescripcion": "Hemorragia de vías digestivas altas",
    "serviciosRequeridos": [
      1102,
      203,
      712
    ],
    "complejidadRequerida": "media",
    "edad": 60,
    "sexo": "F",
    "signosAlarma": [
      "Hematemesis",
      "Melenas de dos días",
      "Palidez mucocutánea"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.93,
    "telefonoReporta": "+5716015550153",
    "textoCrudo": "femenino de 60, vomitó sangre dos veces, deposiciones negras desde ayer, pálido, tensión cien sobre sesenta",
    "origen": {
      "lat": 4.620355,
      "lng": -74.146483
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-040"
    },
    "creadoEn": "2026-08-22T22:45:17-05:00"
  },
  {
    "id": "CAS-0054",
    "resumen": "Hombre de 35 años, fractura cerrada de tibia",
    "triage": 3,
    "dxCie10": "S82.9",
    "dxDescripcion": "Fractura cerrada de tibia",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 35,
    "sexo": "M",
    "signosAlarma": [
      "Deformidad de pierna izquierda",
      "Pulso distal presente",
      "Dolor 8/10"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.66,
    "telefonoReporta": "+5716015550154",
    "textoCrudo": "masculino de 35, trauma de miembro inferior, sospecha de fractura de tibia, estable, requiere radiología",
    "origen": {
      "lat": 4.735649,
      "lng": -74.091642
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-003"
    },
    "creadoEn": "2026-08-22T22:47:56-05:00"
  },
  {
    "id": "CAS-0055",
    "resumen": "Mujer de 81 años, infarto agudo de miocardio con elevación del st",
    "triage": 1,
    "dxCie10": "I21.0",
    "dxDescripcion": "Infarto agudo de miocardio con elevación del ST",
    "serviciosRequeridos": [
      1102,
      743,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 81,
    "sexo": "F",
    "signosAlarma": [
      "Hipotensión",
      "Dolor precordial opresivo",
      "ST elevado en DII-DIII"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.86,
    "telefonoReporta": "+5716015550155",
    "textoCrudo": "reporto femenino de 81, dolor de pecho desde hace media hora, se ve pálido, frío, tensión ochenta y cinco sobre cincuenta, requiere hemodinamia, cambio",
    "origen": {
      "lat": 4.736224,
      "lng": -74.090866
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-006"
    },
    "creadoEn": "2026-08-22T22:53:12-05:00"
  },
  {
    "id": "CAS-0056",
    "resumen": "Mujer de 34 años, crisis asmática severa",
    "triage": 2,
    "dxCie10": "J46",
    "dxDescripcion": "Crisis asmática severa",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "media",
    "edad": 34,
    "sexo": "F",
    "signosAlarma": [
      "Uso de músculos accesorios",
      "Sibilancias generalizadas",
      "Saturación 86%"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.87,
    "telefonoReporta": "+5716015550156",
    "textoCrudo": "femenino de 34, no puede completar frases, tiraje, satura ochenta y ocho, antecedente de asma, cambio",
    "origen": {
      "lat": 4.578938,
      "lng": -74.124577
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-009"
    },
    "creadoEn": "2026-08-22T22:58:25-05:00"
  },
  {
    "id": "CAS-0057",
    "resumen": "Mujer de 52 años, hemorragia de vías digestivas altas",
    "triage": 2,
    "dxCie10": "K92.2",
    "dxDescripcion": "Hemorragia de vías digestivas altas",
    "serviciosRequeridos": [
      1102,
      203,
      712
    ],
    "complejidadRequerida": "media",
    "edad": 52,
    "sexo": "F",
    "signosAlarma": [
      "Información insuficiente en el dictado"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.33,
    "telefonoReporta": "+5716015550157",
    "textoCrudo": "una señora dice que le duele todo desde ayer, no me sé la edad, se ve regular, cambio",
    "origen": {
      "lat": 4.735444,
      "lng": -74.083281
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-012"
    },
    "creadoEn": "2026-08-22T22:59:39-05:00"
  },
  {
    "id": "CAS-0058",
    "resumen": "Mujer de 46 años, crisis convulsiva",
    "triage": 3,
    "dxCie10": "R56.8",
    "dxDescripcion": "Crisis convulsiva",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 46,
    "sexo": "F",
    "signosAlarma": [
      "Glasgow 14 al llegar",
      "Postictal",
      "Convulsión tónico-clónica de 3 minutos"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.86,
    "telefonoReporta": "+5716015550158",
    "textoCrudo": "convulsión en vía pública, femenino de 46, duró unos tres minutos, ya cedió, está postictal, glasgow catorce",
    "origen": {
      "lat": 4.626045,
      "lng": -74.148385
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-015"
    },
    "creadoEn": "2026-08-22T23:03:38-05:00"
  },
  {
    "id": "CAS-0059",
    "resumen": "Hombre de 22 años, fractura cerrada de tibia",
    "triage": 3,
    "dxCie10": "S82.9",
    "dxDescripcion": "Fractura cerrada de tibia",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 22,
    "sexo": "M",
    "signosAlarma": [
      "Pulso distal presente",
      "Dolor 8/10",
      "Deformidad de pierna izquierda"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.7,
    "telefonoReporta": "+5716015550159",
    "textoCrudo": "masculino de 22, trauma de miembro inferior, sospecha de fractura de tibia, estable, requiere radiología",
    "origen": {
      "lat": 4.555473,
      "lng": -74.14602
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-018"
    },
    "creadoEn": "2026-08-22T23:04:12-05:00"
  },
  {
    "id": "CAS-0060",
    "resumen": "Mujer de 38 años, preeclampsia severa",
    "triage": 2,
    "dxCie10": "O14.1",
    "dxDescripcion": "Preeclampsia severa",
    "serviciosRequeridos": [
      1102,
      320,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 38,
    "sexo": "F",
    "signosAlarma": [
      "Cefalea y fosfenos",
      "Edema de miembros inferiores",
      "Tensión 170/110"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.74,
    "telefonoReporta": "+5716015550160",
    "textoCrudo": "gestante de 38, treinta y seis semanas, tensión ciento setenta sobre ciento diez, cefalea y ve lucecitas, requiere ginecobstetricia, cambio",
    "origen": {
      "lat": 4.629165,
      "lng": -74.139453
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-021"
    },
    "creadoEn": "2026-08-22T23:05:04-05:00"
  },
  {
    "id": "CAS-0061",
    "resumen": "Mujer de 52 años, trauma craneoencefálico severo con hematoma subdural",
    "triage": 1,
    "dxCie10": "S06.5",
    "dxDescripcion": "Trauma craneoencefálico severo con hematoma subdural",
    "serviciosRequeridos": [
      1102,
      110,
      245
    ],
    "complejidadRequerida": "alta",
    "edad": 52,
    "sexo": "F",
    "signosAlarma": [
      "Vómito en proyectil",
      "Intubado en escena",
      "Glasgow 7"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.84,
    "telefonoReporta": "+5716015550161",
    "textoCrudo": "TEC severo, femenino de 52, caída de altura, glasgow siete, pupila derecha midriática, ya intubamos, requiere neurocirugía, cambio",
    "origen": {
      "lat": 4.576988,
      "lng": -74.084302
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-024"
    },
    "creadoEn": "2026-08-22T23:08:03-05:00"
  },
  {
    "id": "CAS-0062",
    "resumen": "Hombre de 17 años, crisis convulsiva",
    "triage": 3,
    "dxCie10": "R56.8",
    "dxDescripcion": "Crisis convulsiva",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 17,
    "sexo": "M",
    "signosAlarma": [
      "Convulsión tónico-clónica de 3 minutos",
      "Glasgow 14 al llegar",
      "Postictal"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.65,
    "telefonoReporta": "+5716015550162",
    "textoCrudo": "masculino de 17, episodio convulsivo, sin antecedente conocido, ahora somnoliento, estable",
    "origen": {
      "lat": 4.631733,
      "lng": -74.150234
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-027"
    },
    "creadoEn": "2026-08-22T23:13:02-05:00"
  },
  {
    "id": "CAS-0063",
    "resumen": "Mujer de 50 años, hemorragia de vías digestivas altas",
    "triage": 2,
    "dxCie10": "K92.2",
    "dxDescripcion": "Hemorragia de vías digestivas altas",
    "serviciosRequeridos": [
      1102,
      203,
      712
    ],
    "complejidadRequerida": "media",
    "edad": 50,
    "sexo": "F",
    "signosAlarma": [
      "Hematemesis",
      "Palidez mucocutánea",
      "Melenas de dos días"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.83,
    "telefonoReporta": "+5716015550163",
    "textoCrudo": "sangrado digestivo, femenino de 50, hematemesis en casa, consciente, taquicárdico, cambio",
    "origen": {
      "lat": 4.704417,
      "lng": -74.110903
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-030"
    },
    "creadoEn": "2026-08-22T23:16:00-05:00"
  },
  {
    "id": "CAS-0064",
    "resumen": "Hombre de 14 años, crisis asmática severa",
    "triage": 2,
    "dxCie10": "J46",
    "dxDescripcion": "Crisis asmática severa",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "media",
    "edad": 14,
    "sexo": "M",
    "signosAlarma": [
      "Uso de músculos accesorios",
      "Sibilancias generalizadas",
      "Saturación 86%"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.66,
    "telefonoReporta": "+5716015550164",
    "textoCrudo": "masculino de 14, no puede completar frases, tiraje, satura ochenta y ocho, antecedente de asma, cambio",
    "origen": {
      "lat": 4.608495,
      "lng": -74.063004
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-033"
    },
    "creadoEn": "2026-08-22T23:21:03-05:00"
  },
  {
    "id": "CAS-0065",
    "resumen": "Hombre de 25 años, herida penetrante de abdomen",
    "triage": 1,
    "dxCie10": "S31.1",
    "dxDescripcion": "Herida penetrante de abdomen",
    "serviciosRequeridos": [
      1102,
      203,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 25,
    "sexo": "M",
    "signosAlarma": [
      "Palidez",
      "Abdomen en tabla",
      "Pulso filiforme"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.87,
    "telefonoReporta": "+5716015550165",
    "textoCrudo": "herida penetrante en abdomen, masculino de 25, sangrado activo, abdomen en tabla, tensión no la tomo, pulso filiforme, quirófano ya",
    "origen": {
      "lat": 4.633105,
      "lng": -74.200243
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-036"
    },
    "creadoEn": "2026-08-22T23:34:37-05:00"
  },
  {
    "id": "CAS-0066",
    "resumen": "Hombre de 32 años, politraumatismo grave",
    "triage": 1,
    "dxCie10": "T07",
    "dxDescripcion": "Politraumatismo grave",
    "serviciosRequeridos": [
      1102,
      110,
      203
    ],
    "complejidadRequerida": "alta",
    "edad": 32,
    "sexo": "M",
    "signosAlarma": [
      "Taquicardia 130",
      "Trauma cerrado de tórax",
      "Fractura de fémur abierta"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.65,
    "telefonoReporta": "+5716015550166",
    "textoCrudo": "atropellado, masculino de 32, trauma cerrado de tórax y abdomen, tensión ochenta sobre cuarenta, va inestable, necesitamos cirugía y UCI",
    "origen": {
      "lat": 4.62266,
      "lng": -74.140809
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-039"
    },
    "creadoEn": "2026-08-22T23:44:42-05:00"
  },
  {
    "id": "CAS-0067",
    "resumen": "Mujer de 59 años, trauma craneoencefálico severo con hematoma subdural",
    "triage": 1,
    "dxCie10": "S06.5",
    "dxDescripcion": "Trauma craneoencefálico severo con hematoma subdural",
    "serviciosRequeridos": [
      1102,
      110,
      245
    ],
    "complejidadRequerida": "alta",
    "edad": 59,
    "sexo": "F",
    "signosAlarma": [
      "Información insuficiente en el dictado"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.4,
    "telefonoReporta": "+5716015550167",
    "textoCrudo": "una señora dice que le duele todo desde ayer, no me sé la edad, se ve regular, cambio",
    "origen": {
      "lat": 4.632914,
      "lng": -74.204309
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-002"
    },
    "creadoEn": "2026-08-22T23:51:31-05:00"
  },
  {
    "id": "CAS-0068",
    "resumen": "Hombre de 35 años, hemorragia de vías digestivas altas",
    "triage": 2,
    "dxCie10": "K92.2",
    "dxDescripcion": "Hemorragia de vías digestivas altas",
    "serviciosRequeridos": [
      1102,
      203,
      712
    ],
    "complejidadRequerida": "media",
    "edad": 35,
    "sexo": "M",
    "signosAlarma": [
      "Hematemesis",
      "Melenas de dos días",
      "Palidez mucocutánea"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.72,
    "telefonoReporta": "+5716015550168",
    "textoCrudo": "masculino de 35, vomitó sangre dos veces, deposiciones negras desde ayer, pálido, tensión cien sobre sesenta",
    "origen": {
      "lat": 4.67519,
      "lng": -74.067721
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-005"
    },
    "creadoEn": "2026-08-22T23:52:37-05:00"
  },
  {
    "id": "CAS-0069",
    "resumen": "Hombre de 28 años, politraumatismo grave",
    "triage": 1,
    "dxCie10": "T07",
    "dxDescripcion": "Politraumatismo grave",
    "serviciosRequeridos": [
      1102,
      110,
      203
    ],
    "complejidadRequerida": "alta",
    "edad": 28,
    "sexo": "M",
    "signosAlarma": [
      "Trauma cerrado de tórax",
      "Glasgow 12",
      "Fractura de fémur abierta"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.85,
    "telefonoReporta": "+5716015550169",
    "textoCrudo": "atropellado, masculino de 28, trauma cerrado de tórax y abdomen, tensión ochenta sobre cuarenta, va inestable, necesitamos cirugía y UCI",
    "origen": {
      "lat": 4.576378,
      "lng": -74.094251
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-008"
    },
    "creadoEn": "2026-08-22T23:57:18-05:00"
  },
  {
    "id": "CAS-0070",
    "resumen": "Mujer de 44 años, crisis convulsiva",
    "triage": 3,
    "dxCie10": "R56.8",
    "dxDescripcion": "Crisis convulsiva",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 44,
    "sexo": "F",
    "signosAlarma": [
      "Glasgow 14 al llegar",
      "Convulsión tónico-clónica de 3 minutos",
      "Postictal"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.73,
    "telefonoReporta": "+5716015550170",
    "textoCrudo": "convulsión en vía pública, femenino de 44, duró unos tres minutos, ya cedió, está postictal, glasgow catorce",
    "origen": {
      "lat": 4.631534,
      "lng": -74.138437
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-011"
    },
    "creadoEn": "2026-08-23T00:06:00-05:00"
  },
  {
    "id": "CAS-0071",
    "resumen": "Hombre de 44 años, crisis convulsiva",
    "triage": 3,
    "dxCie10": "R56.8",
    "dxDescripcion": "Crisis convulsiva",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 44,
    "sexo": "M",
    "signosAlarma": [
      "Postictal",
      "Glasgow 14 al llegar",
      "Convulsión tónico-clónica de 3 minutos"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.91,
    "telefonoReporta": "+5716015550171",
    "textoCrudo": "convulsión en vía pública, masculino de 44, duró unos tres minutos, ya cedió, está postictal, glasgow catorce",
    "origen": {
      "lat": 4.633944,
      "lng": -74.200492
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-014"
    },
    "creadoEn": "2026-08-23T00:11:35-05:00"
  },
  {
    "id": "CAS-0072",
    "resumen": "Mujer de 41 años, herida penetrante de abdomen",
    "triage": 1,
    "dxCie10": "S31.1",
    "dxDescripcion": "Herida penetrante de abdomen",
    "serviciosRequeridos": [
      1102,
      203,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 41,
    "sexo": "F",
    "signosAlarma": [
      "Herida penetrante en flanco izquierdo",
      "Pulso filiforme",
      "Abdomen en tabla"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.83,
    "telefonoReporta": "+5716015550172",
    "textoCrudo": "herida penetrante en abdomen, femenino de 41, sangrado activo, abdomen en tabla, tensión no la tomo, pulso filiforme, quirófano ya",
    "origen": {
      "lat": 4.562655,
      "lng": -74.107582
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-017"
    },
    "creadoEn": "2026-08-23T00:15:33-05:00"
  },
  {
    "id": "CAS-0073",
    "resumen": "Mujer de 87 años, choque séptico de origen urinario",
    "triage": 2,
    "dxCie10": "A41.9",
    "dxDescripcion": "Choque séptico de origen urinario",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 87,
    "sexo": "F",
    "signosAlarma": [
      "Hipotensión que no responde a líquidos",
      "Confusión",
      "Lactato alto"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.81,
    "telefonoReporta": "+5716015550173",
    "textoCrudo": "femenino de 87, fiebre alta tres días, hoy confundida, tensión ochenta sobre cincuenta, no levanta con líquidos, sospecho sepsis urinaria",
    "origen": {
      "lat": 4.715785,
      "lng": -74.042837
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-020"
    },
    "creadoEn": "2026-08-23T00:19:02-05:00"
  },
  {
    "id": "CAS-0074",
    "resumen": "Hombre de 27 años, herida penetrante de abdomen",
    "triage": 1,
    "dxCie10": "S31.1",
    "dxDescripcion": "Herida penetrante de abdomen",
    "serviciosRequeridos": [
      1102,
      203,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 27,
    "sexo": "M",
    "signosAlarma": [
      "Palidez",
      "Abdomen en tabla",
      "Pulso filiforme"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.75,
    "telefonoReporta": "+5716015550174",
    "textoCrudo": "masculino de 27, herida en flanco izquierdo, consciente pero pálido, taquicárdico, necesita cirugía general urgente",
    "origen": {
      "lat": 4.698462,
      "lng": -74.102698
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-023"
    },
    "creadoEn": "2026-08-23T00:29:36-05:00"
  },
  {
    "id": "CAS-0075",
    "resumen": "Mujer de 20 años, preeclampsia severa",
    "triage": 2,
    "dxCie10": "O14.1",
    "dxDescripcion": "Preeclampsia severa",
    "serviciosRequeridos": [
      1102,
      320,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 20,
    "sexo": "F",
    "signosAlarma": [
      "Cefalea y fosfenos",
      "Edema de miembros inferiores",
      "Tensión 170/110"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.84,
    "telefonoReporta": "+5716015550175",
    "textoCrudo": "gestante de 20, treinta y seis semanas, tensión ciento setenta sobre ciento diez, cefalea y ve lucecitas, requiere ginecobstetricia, cambio",
    "origen": {
      "lat": 4.570326,
      "lng": -74.103547
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-026"
    },
    "creadoEn": "2026-08-23T00:30:24-05:00"
  },
  {
    "id": "CAS-0076",
    "resumen": "Mujer de 53 años, fractura cerrada de tibia",
    "triage": 3,
    "dxCie10": "S82.9",
    "dxDescripcion": "Fractura cerrada de tibia",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 53,
    "sexo": "F",
    "signosAlarma": [
      "Deformidad de pierna izquierda",
      "Dolor 8/10",
      "Pulso distal presente"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.87,
    "telefonoReporta": "+5716015550176",
    "textoCrudo": "femenino de 53, trauma de miembro inferior, sospecha de fractura de tibia, estable, requiere radiología",
    "origen": {
      "lat": 4.704314,
      "lng": -74.10724
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-029"
    },
    "creadoEn": "2026-08-23T00:33:08-05:00"
  },
  {
    "id": "CAS-0077",
    "resumen": "Hombre de 12 años, crisis asmática severa",
    "triage": 2,
    "dxCie10": "J46",
    "dxDescripcion": "Crisis asmática severa",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "media",
    "edad": 12,
    "sexo": "M",
    "signosAlarma": [
      "Información insuficiente en el dictado"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.43,
    "telefonoReporta": "+5716015550177",
    "textoCrudo": "una señora dice que le duele todo desde ayer, no me sé la edad, se ve regular, cambio",
    "origen": {
      "lat": 4.616288,
      "lng": -74.086179
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-032"
    },
    "creadoEn": "2026-08-23T00:36:45-05:00"
  },
  {
    "id": "CAS-0078",
    "resumen": "Hombre de 50 años, infarto agudo de miocardio con elevación del st",
    "triage": 1,
    "dxCie10": "I21.0",
    "dxDescripcion": "Infarto agudo de miocardio con elevación del ST",
    "serviciosRequeridos": [
      1102,
      743,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 50,
    "sexo": "M",
    "signosAlarma": [
      "Dolor precordial opresivo",
      "ST elevado en DII-DIII",
      "Hipotensión"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.65,
    "telefonoReporta": "+5716015550178",
    "textoCrudo": "central, masculino de unos 50 y tantos, dolor precordial opresivo irradiado a brazo izquierdo, veinte minutos, sudoroso, tensión noventa sobre sesenta, cambio",
    "origen": {
      "lat": 4.619261,
      "lng": -74.142352
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-035"
    },
    "creadoEn": "2026-08-23T00:38:44-05:00"
  },
  {
    "id": "CAS-0079",
    "resumen": "Mujer de 20 años, apendicitis aguda",
    "triage": 3,
    "dxCie10": "K35.8",
    "dxDescripcion": "Apendicitis aguda",
    "serviciosRequeridos": [
      1102,
      203
    ],
    "complejidadRequerida": "media",
    "edad": 20,
    "sexo": "F",
    "signosAlarma": [
      "Blumberg positivo",
      "Fiebre 38",
      "Dolor en fosa ilíaca derecha"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.73,
    "telefonoReporta": "+5716015550179",
    "textoCrudo": "dolor abdominal, femenino de 20, doce horas de evolución, defensa en cuadrante inferior derecho, signos vitales normales",
    "origen": {
      "lat": 4.633866,
      "lng": -74.152843
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-038"
    },
    "creadoEn": "2026-08-23T00:49:31-05:00"
  },
  {
    "id": "CAS-0080",
    "resumen": "Hombre de 77 años, hemorragia de vías digestivas altas",
    "triage": 2,
    "dxCie10": "K92.2",
    "dxDescripcion": "Hemorragia de vías digestivas altas",
    "serviciosRequeridos": [
      1102,
      203,
      712
    ],
    "complejidadRequerida": "media",
    "edad": 77,
    "sexo": "M",
    "signosAlarma": [
      "Hematemesis",
      "Palidez mucocutánea",
      "Melenas de dos días"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.83,
    "telefonoReporta": "+5716015550180",
    "textoCrudo": "masculino de 77, vomitó sangre dos veces, deposiciones negras desde ayer, pálido, tensión cien sobre sesenta",
    "origen": {
      "lat": 4.632161,
      "lng": -74.21379
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-001"
    },
    "creadoEn": "2026-08-23T00:58:26-05:00"
  },
  {
    "id": "CAS-0081",
    "resumen": "Hombre de 41 años, fractura cerrada de tibia",
    "triage": 3,
    "dxCie10": "S82.9",
    "dxDescripcion": "Fractura cerrada de tibia",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 41,
    "sexo": "M",
    "signosAlarma": [
      "Pulso distal presente",
      "Deformidad de pierna izquierda",
      "Dolor 8/10"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.92,
    "telefonoReporta": "+5716015550181",
    "textoCrudo": "masculino de 41, trauma de miembro inferior, sospecha de fractura de tibia, estable, requiere radiología",
    "origen": {
      "lat": 4.747517,
      "lng": -74.088361
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-004"
    },
    "creadoEn": "2026-08-23T01:01:29-05:00"
  },
  {
    "id": "CAS-0082",
    "resumen": "Mujer de 41 años, crisis asmática severa",
    "triage": 2,
    "dxCie10": "J46",
    "dxDescripcion": "Crisis asmática severa",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "media",
    "edad": 41,
    "sexo": "F",
    "signosAlarma": [
      "Sibilancias generalizadas",
      "Uso de músculos accesorios",
      "Saturación 86%"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.66,
    "telefonoReporta": "+5716015550182",
    "textoCrudo": "femenino de 41, no puede completar frases, tiraje, satura ochenta y ocho, antecedente de asma, cambio",
    "origen": {
      "lat": 4.631838,
      "lng": -74.141354
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-007"
    },
    "creadoEn": "2026-08-23T01:07:37-05:00"
  },
  {
    "id": "CAS-0083",
    "resumen": "Mujer de 83 años, choque séptico de origen urinario",
    "triage": 2,
    "dxCie10": "A41.9",
    "dxDescripcion": "Choque séptico de origen urinario",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 83,
    "sexo": "F",
    "signosAlarma": [
      "Lactato alto",
      "Fiebre 39.2",
      "Confusión"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.75,
    "telefonoReporta": "+5716015550183",
    "textoCrudo": "adulto mayor, 83 años, decaimiento, fiebre, hipotenso, piel moteada, va para UCI probablemente, cambio",
    "origen": {
      "lat": 4.65537,
      "lng": -74.053183
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-010"
    },
    "creadoEn": "2026-08-23T01:34:05-05:00"
  },
  {
    "id": "CAS-0084",
    "resumen": "Mujer de 34 años, preeclampsia severa",
    "triage": 2,
    "dxCie10": "O14.1",
    "dxDescripcion": "Preeclampsia severa",
    "serviciosRequeridos": [
      1102,
      320,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 34,
    "sexo": "F",
    "signosAlarma": [
      "Edema de miembros inferiores",
      "Cefalea y fosfenos",
      "Tensión 170/110"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.8,
    "telefonoReporta": "+5716015550184",
    "textoCrudo": "gestante de 34, treinta y seis semanas, tensión ciento setenta sobre ciento diez, cefalea y ve lucecitas, requiere ginecobstetricia, cambio",
    "origen": {
      "lat": 4.608689,
      "lng": -74.085871
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-013"
    },
    "creadoEn": "2026-08-23T01:41:54-05:00"
  },
  {
    "id": "CAS-0085",
    "resumen": "Mujer de 37 años, herida penetrante de abdomen",
    "triage": 1,
    "dxCie10": "S31.1",
    "dxDescripcion": "Herida penetrante de abdomen",
    "serviciosRequeridos": [
      1102,
      203,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 37,
    "sexo": "F",
    "signosAlarma": [
      "Abdomen en tabla",
      "Pulso filiforme",
      "Palidez"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.89,
    "telefonoReporta": "+5716015550185",
    "textoCrudo": "herida penetrante en abdomen, femenino de 37, sangrado activo, abdomen en tabla, tensión no la tomo, pulso filiforme, quirófano ya",
    "origen": {
      "lat": 4.607847,
      "lng": -74.079249
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-016"
    },
    "creadoEn": "2026-08-23T01:42:16-05:00"
  },
  {
    "id": "CAS-0086",
    "resumen": "Hombre de 31 años, politraumatismo grave",
    "triage": 1,
    "dxCie10": "T07",
    "dxDescripcion": "Politraumatismo grave",
    "serviciosRequeridos": [
      1102,
      110,
      203
    ],
    "complejidadRequerida": "alta",
    "edad": 31,
    "sexo": "M",
    "signosAlarma": [
      "Fractura de fémur abierta",
      "Trauma cerrado de tórax",
      "Taquicardia 130"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.69,
    "telefonoReporta": "+5716015550186",
    "textoCrudo": "accidente de moto en la Avenida Primero de Mayo, masculino de 31, politrauma, fémur abierto, tórax con crepitación, frecuencia ciento treinta, glasgow doce, cambio",
    "origen": {
      "lat": 4.670646,
      "lng": -74.144094
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-019"
    },
    "creadoEn": "2026-08-23T01:49:32-05:00"
  },
  {
    "id": "CAS-0087",
    "resumen": "Hombre de 78 años, accidente cerebrovascular isquémico agudo",
    "triage": 1,
    "dxCie10": "I63.9",
    "dxDescripcion": "Accidente cerebrovascular isquémico agudo",
    "serviciosRequeridos": [
      1102,
      110,
      744
    ],
    "complejidadRequerida": "alta",
    "edad": 78,
    "sexo": "M",
    "signosAlarma": [
      "Información insuficiente en el dictado"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.28,
    "telefonoReporta": "+5716015550187",
    "textoCrudo": "una señora dice que le duele todo desde ayer, no me sé la edad, se ve regular, cambio",
    "origen": {
      "lat": 4.581845,
      "lng": -74.087649
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-022"
    },
    "creadoEn": "2026-08-23T01:51:14-05:00"
  },
  {
    "id": "CAS-0088",
    "resumen": "Hombre de 90 años, accidente cerebrovascular isquémico agudo",
    "triage": 1,
    "dxCie10": "I63.9",
    "dxDescripcion": "Accidente cerebrovascular isquémico agudo",
    "serviciosRequeridos": [
      1102,
      110,
      744
    ],
    "complejidadRequerida": "alta",
    "edad": 90,
    "sexo": "M",
    "signosAlarma": [
      "Inicio hace 40 minutos",
      "Afasia",
      "Glasgow 13"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.88,
    "telefonoReporta": "+5716015550188",
    "textoCrudo": "posible ACV, masculino de 90, boca desviada, debilidad en brazo derecho, inicio de síntomas siete y media, necesita tomografía ya",
    "origen": {
      "lat": 4.743521,
      "lng": -74.085619
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-025"
    },
    "creadoEn": "2026-08-23T01:56:29-05:00"
  },
  {
    "id": "CAS-0089",
    "resumen": "Mujer de 77 años, choque séptico de origen urinario",
    "triage": 2,
    "dxCie10": "A41.9",
    "dxDescripcion": "Choque séptico de origen urinario",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 77,
    "sexo": "F",
    "signosAlarma": [
      "Hipotensión que no responde a líquidos",
      "Confusión",
      "Fiebre 39.2"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.84,
    "telefonoReporta": "+5716015550189",
    "textoCrudo": "adulto mayor, 77 años, decaimiento, fiebre, hipotenso, piel moteada, va para UCI probablemente, cambio",
    "origen": {
      "lat": 4.737144,
      "lng": -74.083231
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-028"
    },
    "creadoEn": "2026-08-23T02:27:46-05:00"
  },
  {
    "id": "CAS-0090",
    "resumen": "Mujer de 38 años, fractura cerrada de tibia",
    "triage": 3,
    "dxCie10": "S82.9",
    "dxDescripcion": "Fractura cerrada de tibia",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 38,
    "sexo": "F",
    "signosAlarma": [
      "Deformidad de pierna izquierda",
      "Dolor 8/10",
      "Pulso distal presente"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.78,
    "telefonoReporta": "+5716015550190",
    "textoCrudo": "femenino de 38, trauma de miembro inferior, sospecha de fractura de tibia, estable, requiere radiología",
    "origen": {
      "lat": 4.63433,
      "lng": -74.14516
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-031"
    },
    "creadoEn": "2026-08-23T02:37:50-05:00"
  },
  {
    "id": "CAS-0091",
    "resumen": "Hombre de 69 años, fractura cerrada de tibia",
    "triage": 3,
    "dxCie10": "S82.9",
    "dxDescripcion": "Fractura cerrada de tibia",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 69,
    "sexo": "M",
    "signosAlarma": [
      "Deformidad de pierna izquierda",
      "Pulso distal presente",
      "Dolor 8/10"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.74,
    "telefonoReporta": "+5716015550191",
    "textoCrudo": "caída en la vía, masculino de 69, pierna izquierda deformada, pulso distal presente, dolor ocho de diez, inmovilizada",
    "origen": {
      "lat": 4.679588,
      "lng": -74.142052
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-034"
    },
    "creadoEn": "2026-08-23T02:41:31-05:00"
  },
  {
    "id": "CAS-0092",
    "resumen": "Hombre de 76 años, hemorragia de vías digestivas altas",
    "triage": 2,
    "dxCie10": "K92.2",
    "dxDescripcion": "Hemorragia de vías digestivas altas",
    "serviciosRequeridos": [
      1102,
      203,
      712
    ],
    "complejidadRequerida": "media",
    "edad": 76,
    "sexo": "M",
    "signosAlarma": [
      "Hematemesis",
      "Melenas de dos días",
      "Palidez mucocutánea"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.78,
    "telefonoReporta": "+5716015550192",
    "textoCrudo": "masculino de 76, vomitó sangre dos veces, deposiciones negras desde ayer, pálido, tensión cien sobre sesenta",
    "origen": {
      "lat": 4.569719,
      "lng": -74.135665
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-037"
    },
    "creadoEn": "2026-08-23T02:47:33-05:00"
  },
  {
    "id": "CAS-0093",
    "resumen": "Mujer de 51 años, hemorragia de vías digestivas altas",
    "triage": 2,
    "dxCie10": "K92.2",
    "dxDescripcion": "Hemorragia de vías digestivas altas",
    "serviciosRequeridos": [
      1102,
      203,
      712
    ],
    "complejidadRequerida": "media",
    "edad": 51,
    "sexo": "F",
    "signosAlarma": [
      "Hematemesis",
      "Melenas de dos días",
      "Palidez mucocutánea"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.66,
    "telefonoReporta": "+5716015550193",
    "textoCrudo": "femenino de 51, vomitó sangre dos veces, deposiciones negras desde ayer, pálido, tensión cien sobre sesenta",
    "origen": {
      "lat": 4.633926,
      "lng": -74.212915
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-040"
    },
    "creadoEn": "2026-08-23T02:51:54-05:00"
  },
  {
    "id": "CAS-0094",
    "resumen": "Hombre de 13 años, crisis asmática severa",
    "triage": 2,
    "dxCie10": "J46",
    "dxDescripcion": "Crisis asmática severa",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "media",
    "edad": 13,
    "sexo": "M",
    "signosAlarma": [
      "Saturación 86%",
      "Sibilancias generalizadas",
      "Uso de músculos accesorios"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.66,
    "telefonoReporta": "+5716015550194",
    "textoCrudo": "masculino de 13, no puede completar frases, tiraje, satura ochenta y ocho, antecedente de asma, cambio",
    "origen": {
      "lat": 4.733396,
      "lng": -74.084477
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-003"
    },
    "creadoEn": "2026-08-23T02:54:44-05:00"
  },
  {
    "id": "CAS-0095",
    "resumen": "Mujer de 55 años, fractura cerrada de tibia",
    "triage": 3,
    "dxCie10": "S82.9",
    "dxDescripcion": "Fractura cerrada de tibia",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 55,
    "sexo": "F",
    "signosAlarma": [
      "Deformidad de pierna izquierda",
      "Dolor 8/10",
      "Pulso distal presente"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.84,
    "telefonoReporta": "+5716015550195",
    "textoCrudo": "caída en la vía, femenino de 55, pierna izquierda deformada, pulso distal presente, dolor ocho de diez, inmovilizada",
    "origen": {
      "lat": 4.698165,
      "lng": -74.111597
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-006"
    },
    "creadoEn": "2026-08-23T03:07:00-05:00"
  },
  {
    "id": "CAS-0096",
    "resumen": "Hombre de 37 años, trauma craneoencefálico severo con hematoma subdural",
    "triage": 1,
    "dxCie10": "S06.5",
    "dxDescripcion": "Trauma craneoencefálico severo con hematoma subdural",
    "serviciosRequeridos": [
      1102,
      110,
      245
    ],
    "complejidadRequerida": "alta",
    "edad": 37,
    "sexo": "M",
    "signosAlarma": [
      "Anisocoria",
      "Vómito en proyectil",
      "Glasgow 7"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.67,
    "telefonoReporta": "+5716015550196",
    "textoCrudo": "TEC severo, masculino de 37, caída de altura, glasgow siete, pupila derecha midriática, ya intubamos, requiere neurocirugía, cambio",
    "origen": {
      "lat": 4.629511,
      "lng": -74.204531
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-009"
    },
    "creadoEn": "2026-08-23T03:15:02-05:00"
  },
  {
    "id": "CAS-0097",
    "resumen": "Hombre de 30 años, crisis convulsiva",
    "triage": 3,
    "dxCie10": "R56.8",
    "dxDescripcion": "Crisis convulsiva",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 30,
    "sexo": "M",
    "signosAlarma": [
      "Información insuficiente en el dictado"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.36,
    "telefonoReporta": "+5716015550197",
    "textoCrudo": "una señora dice que le duele todo desde ayer, no me sé la edad, se ve regular, cambio",
    "origen": {
      "lat": 4.694742,
      "lng": -74.103643
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-012"
    },
    "creadoEn": "2026-08-23T03:31:31-05:00"
  },
  {
    "id": "CAS-0098",
    "resumen": "Hombre de 75 años, choque séptico de origen urinario",
    "triage": 2,
    "dxCie10": "A41.9",
    "dxDescripcion": "Choque séptico de origen urinario",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 75,
    "sexo": "M",
    "signosAlarma": [
      "Hipotensión que no responde a líquidos",
      "Confusión",
      "Lactato alto"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.89,
    "telefonoReporta": "+5716015550198",
    "textoCrudo": "masculino de 75, fiebre alta tres días, hoy confundida, tensión ochenta sobre cincuenta, no levanta con líquidos, sospecho sepsis urinaria",
    "origen": {
      "lat": 4.637474,
      "lng": -74.20146
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-015"
    },
    "creadoEn": "2026-08-23T03:37:11-05:00"
  },
  {
    "id": "CAS-0099",
    "resumen": "Hombre de 63 años, hemorragia de vías digestivas altas",
    "triage": 2,
    "dxCie10": "K92.2",
    "dxDescripcion": "Hemorragia de vías digestivas altas",
    "serviciosRequeridos": [
      1102,
      203,
      712
    ],
    "complejidadRequerida": "media",
    "edad": 63,
    "sexo": "M",
    "signosAlarma": [
      "Hematemesis",
      "Palidez mucocutánea",
      "Melenas de dos días"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.91,
    "telefonoReporta": "+5716015550199",
    "textoCrudo": "masculino de 63, vomitó sangre dos veces, deposiciones negras desde ayer, pálido, tensión cien sobre sesenta",
    "origen": {
      "lat": 4.608721,
      "lng": -74.071395
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-018"
    },
    "creadoEn": "2026-08-23T03:44:09-05:00"
  },
  {
    "id": "CAS-0100",
    "resumen": "Mujer de 37 años, herida penetrante de abdomen",
    "triage": 1,
    "dxCie10": "S31.1",
    "dxDescripcion": "Herida penetrante de abdomen",
    "serviciosRequeridos": [
      1102,
      203,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 37,
    "sexo": "F",
    "signosAlarma": [
      "Abdomen en tabla",
      "Pulso filiforme",
      "Herida penetrante en flanco izquierdo"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.93,
    "telefonoReporta": "+5716015550100",
    "textoCrudo": "herida penetrante en abdomen, femenino de 37, sangrado activo, abdomen en tabla, tensión no la tomo, pulso filiforme, quirófano ya",
    "origen": {
      "lat": 4.671435,
      "lng": -74.074478
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-021"
    },
    "creadoEn": "2026-08-23T03:52:30-05:00"
  },
  {
    "id": "CAS-0101",
    "resumen": "Hombre de 45 años, infarto agudo de miocardio con elevación del st",
    "triage": 1,
    "dxCie10": "I21.0",
    "dxDescripcion": "Infarto agudo de miocardio con elevación del ST",
    "serviciosRequeridos": [
      1102,
      743,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 45,
    "sexo": "M",
    "signosAlarma": [
      "Dolor precordial opresivo",
      "Diaforesis",
      "ST elevado en DII-DIII"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.8,
    "telefonoReporta": "+5716015550101",
    "textoCrudo": "reporto masculino de 45, dolor de pecho desde hace media hora, se ve pálido, frío, tensión ochenta y cinco sobre cincuenta, requiere hemodinamia, cambio",
    "origen": {
      "lat": 4.74239,
      "lng": -74.090119
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-024"
    },
    "creadoEn": "2026-08-23T04:03:36-05:00"
  },
  {
    "id": "CAS-0102",
    "resumen": "Hombre de 28 años, crisis asmática severa",
    "triage": 2,
    "dxCie10": "J46",
    "dxDescripcion": "Crisis asmática severa",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "media",
    "edad": 28,
    "sexo": "M",
    "signosAlarma": [
      "Uso de músculos accesorios",
      "Sibilancias generalizadas",
      "Saturación 86%"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.66,
    "telefonoReporta": "+5716015550102",
    "textoCrudo": "masculino de 28, no puede completar frases, tiraje, satura ochenta y ocho, antecedente de asma, cambio",
    "origen": {
      "lat": 4.748259,
      "lng": -74.088164
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-027"
    },
    "creadoEn": "2026-08-23T04:07:44-05:00"
  },
  {
    "id": "CAS-0103",
    "resumen": "Mujer de 46 años, fractura cerrada de tibia",
    "triage": 3,
    "dxCie10": "S82.9",
    "dxDescripcion": "Fractura cerrada de tibia",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 46,
    "sexo": "F",
    "signosAlarma": [
      "Dolor 8/10",
      "Deformidad de pierna izquierda",
      "Pulso distal presente"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.69,
    "telefonoReporta": "+5716015550103",
    "textoCrudo": "caída en la vía, femenino de 46, pierna izquierda deformada, pulso distal presente, dolor ocho de diez, inmovilizada",
    "origen": {
      "lat": 4.748715,
      "lng": -74.088995
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-030"
    },
    "creadoEn": "2026-08-23T04:08:34-05:00"
  },
  {
    "id": "CAS-0104",
    "resumen": "Mujer de 41 años, crisis convulsiva",
    "triage": 3,
    "dxCie10": "R56.8",
    "dxDescripcion": "Crisis convulsiva",
    "serviciosRequeridos": [
      1102,
      744
    ],
    "complejidadRequerida": "media",
    "edad": 41,
    "sexo": "F",
    "signosAlarma": [
      "Postictal",
      "Glasgow 14 al llegar",
      "Convulsión tónico-clónica de 3 minutos"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.84,
    "telefonoReporta": "+5716015550104",
    "textoCrudo": "convulsión en vía pública, femenino de 41, duró unos tres minutos, ya cedió, está postictal, glasgow catorce",
    "origen": {
      "lat": 4.564241,
      "lng": -74.151573
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-033"
    },
    "creadoEn": "2026-08-23T04:12:00-05:00"
  },
  {
    "id": "CAS-0105",
    "resumen": "Hombre de 26 años, herida penetrante de abdomen",
    "triage": 1,
    "dxCie10": "S31.1",
    "dxDescripcion": "Herida penetrante de abdomen",
    "serviciosRequeridos": [
      1102,
      203,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 26,
    "sexo": "M",
    "signosAlarma": [
      "Palidez",
      "Abdomen en tabla",
      "Pulso filiforme"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.63,
    "telefonoReporta": "+5716015550105",
    "textoCrudo": "masculino de 26, herida en flanco izquierdo, consciente pero pálido, taquicárdico, necesita cirugía general urgente",
    "origen": {
      "lat": 4.633933,
      "lng": -74.212258
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-036"
    },
    "creadoEn": "2026-08-23T04:21:37-05:00"
  },
  {
    "id": "CAS-0106",
    "resumen": "Mujer de 12 años, crisis asmática severa",
    "triage": 2,
    "dxCie10": "J46",
    "dxDescripcion": "Crisis asmática severa",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "media",
    "edad": 12,
    "sexo": "F",
    "signosAlarma": [
      "Uso de músculos accesorios",
      "Saturación 86%",
      "Sibilancias generalizadas"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.75,
    "telefonoReporta": "+5716015550106",
    "textoCrudo": "crisis asmática, femenino de 12, satura ochenta y seis con oxígeno, sibilancias en todo el campo, ya lleva dos micronebulizaciones",
    "origen": {
      "lat": 4.562433,
      "lng": -74.151066
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-039"
    },
    "creadoEn": "2026-08-23T04:56:39-05:00"
  },
  {
    "id": "CAS-0107",
    "resumen": "Mujer de 69 años, choque séptico de origen urinario",
    "triage": 2,
    "dxCie10": "A41.9",
    "dxDescripcion": "Choque séptico de origen urinario",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 69,
    "sexo": "F",
    "signosAlarma": [
      "Información insuficiente en el dictado"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.45,
    "telefonoReporta": "+5716015550107",
    "textoCrudo": "una señora dice que le duele todo desde ayer, no me sé la edad, se ve regular, cambio",
    "origen": {
      "lat": 4.695038,
      "lng": -74.11687
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-002"
    },
    "creadoEn": "2026-08-23T05:04:17-05:00"
  },
  {
    "id": "CAS-0108",
    "resumen": "Hombre de 52 años, infarto agudo de miocardio con elevación del st",
    "triage": 1,
    "dxCie10": "I21.0",
    "dxDescripcion": "Infarto agudo de miocardio con elevación del ST",
    "serviciosRequeridos": [
      1102,
      743,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 52,
    "sexo": "M",
    "signosAlarma": [
      "Hipotensión",
      "Diaforesis",
      "ST elevado en DII-DIII"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.85,
    "telefonoReporta": "+5716015550108",
    "textoCrudo": "reporto masculino de 52, dolor de pecho desde hace media hora, se ve pálido, frío, tensión ochenta y cinco sobre cincuenta, requiere hemodinamia, cambio",
    "origen": {
      "lat": 4.66545,
      "lng": -74.063495
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-005"
    },
    "creadoEn": "2026-08-23T05:20:34-05:00"
  },
  {
    "id": "CAS-0109",
    "resumen": "Hombre de 2 años, bronquiolitis con dificultad respiratoria",
    "triage": 2,
    "dxCie10": "J21.9",
    "dxDescripcion": "Bronquiolitis con dificultad respiratoria",
    "serviciosRequeridos": [
      1102,
      109
    ],
    "complejidadRequerida": "alta",
    "edad": 2,
    "sexo": "M",
    "signosAlarma": [
      "Tiraje subcostal",
      "Rechazo de la vía oral",
      "Saturación 89%"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.75,
    "telefonoReporta": "+5716015550109",
    "textoCrudo": "menor de 2 años, cuadro gripal de tres días, hoy respira rápido, tiraje subcostal, cambio",
    "origen": {
      "lat": 4.566811,
      "lng": -74.154284
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-008"
    },
    "creadoEn": "2026-08-23T05:21:29-05:00"
  },
  {
    "id": "CAS-0110",
    "resumen": "Mujer de 23 años, politraumatismo grave",
    "triage": 1,
    "dxCie10": "T07",
    "dxDescripcion": "Politraumatismo grave",
    "serviciosRequeridos": [
      1102,
      110,
      203
    ],
    "complejidadRequerida": "alta",
    "edad": 23,
    "sexo": "F",
    "signosAlarma": [
      "Glasgow 12",
      "Trauma cerrado de tórax",
      "Taquicardia 130"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.95,
    "telefonoReporta": "+5716015550110",
    "textoCrudo": "accidente de moto en la Calle 80, femenino de 23, politrauma, fémur abierto, tórax con crepitación, frecuencia ciento treinta, glasgow doce, cambio",
    "origen": {
      "lat": 4.636377,
      "lng": -74.209694
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-011"
    },
    "creadoEn": "2026-08-23T05:34:33-05:00"
  },
  {
    "id": "CAS-0111",
    "resumen": "Hombre de 58 años, accidente cerebrovascular isquémico agudo",
    "triage": 1,
    "dxCie10": "I63.9",
    "dxDescripcion": "Accidente cerebrovascular isquémico agudo",
    "serviciosRequeridos": [
      1102,
      110,
      744
    ],
    "complejidadRequerida": "alta",
    "edad": 58,
    "sexo": "M",
    "signosAlarma": [
      "Hemiparesia derecha",
      "Inicio hace 40 minutos",
      "Afasia"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.85,
    "telefonoReporta": "+5716015550111",
    "textoCrudo": "masculino de 58, la familia dice que empezó hace cuarenta minutos, no mueve el lado derecho y no habla claro, glasgow trece, vamos con ventana, cambio",
    "origen": {
      "lat": 4.701994,
      "lng": -74.113114
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-014"
    },
    "creadoEn": "2026-08-23T05:49:53-05:00"
  },
  {
    "id": "CAS-0112",
    "resumen": "Mujer de 33 años, apendicitis aguda",
    "triage": 3,
    "dxCie10": "K35.8",
    "dxDescripcion": "Apendicitis aguda",
    "serviciosRequeridos": [
      1102,
      203
    ],
    "complejidadRequerida": "media",
    "edad": 33,
    "sexo": "F",
    "signosAlarma": [
      "Fiebre 38",
      "Blumberg positivo",
      "Dolor en fosa ilíaca derecha"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.95,
    "telefonoReporta": "+5716015550112",
    "textoCrudo": "dolor abdominal, femenino de 33, doce horas de evolución, defensa en cuadrante inferior derecho, signos vitales normales",
    "origen": {
      "lat": 4.641334,
      "lng": -74.080865
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-017"
    },
    "creadoEn": "2026-08-23T06:04:56-05:00"
  },
  {
    "id": "CAS-0113",
    "resumen": "Hombre de 33 años, politraumatismo grave",
    "triage": 1,
    "dxCie10": "T07",
    "dxDescripcion": "Politraumatismo grave",
    "serviciosRequeridos": [
      1102,
      110,
      203
    ],
    "complejidadRequerida": "alta",
    "edad": 33,
    "sexo": "M",
    "signosAlarma": [
      "Taquicardia 130",
      "Trauma cerrado de tórax",
      "Fractura de fémur abierta"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.78,
    "telefonoReporta": "+5716015550113",
    "textoCrudo": "atropellado, masculino de 33, trauma cerrado de tórax y abdomen, tensión ochenta sobre cuarenta, va inestable, necesitamos cirugía y UCI",
    "origen": {
      "lat": 4.623558,
      "lng": -74.140659
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-020"
    },
    "creadoEn": "2026-08-23T06:05:43-05:00"
  },
  {
    "id": "CAS-0114",
    "resumen": "Mujer de 25 años, preeclampsia severa",
    "triage": 2,
    "dxCie10": "O14.1",
    "dxDescripcion": "Preeclampsia severa",
    "serviciosRequeridos": [
      1102,
      320,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 25,
    "sexo": "F",
    "signosAlarma": [
      "36 semanas",
      "Tensión 170/110",
      "Cefalea y fosfenos"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.8,
    "telefonoReporta": "+5716015550114",
    "textoCrudo": "materna de 25 años, dolor en epigastrio, tensión alta, edema, sospecha de preeclampsia severa, cambio",
    "origen": {
      "lat": 4.742292,
      "lng": -74.091724
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-023"
    },
    "creadoEn": "2026-08-23T06:06:52-05:00"
  },
  {
    "id": "CAS-0115",
    "resumen": "Mujer de 36 años, crisis asmática severa",
    "triage": 2,
    "dxCie10": "J46",
    "dxDescripcion": "Crisis asmática severa",
    "serviciosRequeridos": [
      1102,
      110
    ],
    "complejidadRequerida": "media",
    "edad": 36,
    "sexo": "F",
    "signosAlarma": [
      "Sibilancias generalizadas",
      "Saturación 86%",
      "Uso de músculos accesorios"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.86,
    "telefonoReporta": "+5716015550115",
    "textoCrudo": "femenino de 36, no puede completar frases, tiraje, satura ochenta y ocho, antecedente de asma, cambio",
    "origen": {
      "lat": 4.672666,
      "lng": -74.07018
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-026"
    },
    "creadoEn": "2026-08-23T06:30:55-05:00"
  },
  {
    "id": "CAS-0116",
    "resumen": "Mujer de 31 años, herida penetrante de abdomen",
    "triage": 1,
    "dxCie10": "S31.1",
    "dxDescripcion": "Herida penetrante de abdomen",
    "serviciosRequeridos": [
      1102,
      203,
      110
    ],
    "complejidadRequerida": "alta",
    "edad": 31,
    "sexo": "F",
    "signosAlarma": [
      "Pulso filiforme",
      "Herida penetrante en flanco izquierdo",
      "Palidez"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.89,
    "telefonoReporta": "+5716015550116",
    "textoCrudo": "femenino de 31, herida en flanco izquierdo, consciente pero pálido, taquicárdico, necesita cirugía general urgente",
    "origen": {
      "lat": 4.733669,
      "lng": -74.092267
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-029"
    },
    "creadoEn": "2026-08-23T06:37:47-05:00"
  },
  {
    "id": "CAS-0117",
    "resumen": "Mujer de 87 años, accidente cerebrovascular isquémico agudo",
    "triage": 1,
    "dxCie10": "I63.9",
    "dxDescripcion": "Accidente cerebrovascular isquémico agudo",
    "serviciosRequeridos": [
      1102,
      110,
      744
    ],
    "complejidadRequerida": "alta",
    "edad": 87,
    "sexo": "F",
    "signosAlarma": [
      "Información insuficiente en el dictado"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.41,
    "telefonoReporta": "+5716015550117",
    "textoCrudo": "una señora dice que le duele todo desde ayer, no me sé la edad, se ve regular, cambio",
    "origen": {
      "lat": 4.693654,
      "lng": -74.104663
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-032"
    },
    "creadoEn": "2026-08-23T06:41:21-05:00"
  },
  {
    "id": "CAS-0118",
    "resumen": "Mujer de 53 años, trauma craneoencefálico severo con hematoma subdural",
    "triage": 1,
    "dxCie10": "S06.5",
    "dxDescripcion": "Trauma craneoencefálico severo con hematoma subdural",
    "serviciosRequeridos": [
      1102,
      110,
      245
    ],
    "complejidadRequerida": "alta",
    "edad": 53,
    "sexo": "F",
    "signosAlarma": [
      "Glasgow 7",
      "Anisocoria",
      "Vómito en proyectil"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.89,
    "telefonoReporta": "+5716015550118",
    "textoCrudo": "TEC severo, femenino de 53, caída de altura, glasgow siete, pupila derecha midriática, ya intubamos, requiere neurocirugía, cambio",
    "origen": {
      "lat": 4.582875,
      "lng": -74.094994
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-035"
    },
    "creadoEn": "2026-08-23T06:42:11-05:00"
  },
  {
    "id": "CAS-0119",
    "resumen": "Hombre de 31 años, politraumatismo grave",
    "triage": 1,
    "dxCie10": "T07",
    "dxDescripcion": "Politraumatismo grave",
    "serviciosRequeridos": [
      1102,
      110,
      203
    ],
    "complejidadRequerida": "alta",
    "edad": 31,
    "sexo": "M",
    "signosAlarma": [
      "Fractura de fémur abierta",
      "Trauma cerrado de tórax",
      "Glasgow 12"
    ],
    "requiereMedicoABordo": true,
    "confianza": 0.88,
    "telefonoReporta": "+5716015550119",
    "textoCrudo": "atropellado, masculino de 31, trauma cerrado de tórax y abdomen, tensión ochenta sobre cuarenta, va inestable, necesitamos cirugía y UCI",
    "origen": {
      "lat": 4.620087,
      "lng": -74.150567
    },
    "tipoMovil": "TAM",
    "unidad": {
      "id": "AMB-038"
    },
    "creadoEn": "2026-08-23T06:44:34-05:00"
  },
  {
    "id": "CAS-0120",
    "resumen": "Hombre de 26 años, apendicitis aguda",
    "triage": 3,
    "dxCie10": "K35.8",
    "dxDescripcion": "Apendicitis aguda",
    "serviciosRequeridos": [
      1102,
      203
    ],
    "complejidadRequerida": "media",
    "edad": 26,
    "sexo": "M",
    "signosAlarma": [
      "Blumberg positivo",
      "Dolor en fosa ilíaca derecha",
      "Fiebre 38"
    ],
    "requiereMedicoABordo": false,
    "confianza": 0.75,
    "telefonoReporta": "+5716015550120",
    "textoCrudo": "dolor abdominal, masculino de 26, doce horas de evolución, defensa en cuadrante inferior derecho, signos vitales normales",
    "origen": {
      "lat": 4.485932,
      "lng": -74.120714
    },
    "tipoMovil": "TAB",
    "unidad": {
      "id": "AMB-001"
    },
    "creadoEn": "2026-08-23T06:49:42-05:00"
  }
];

/** 205 solicitudes a sedes, con sus rebotes. */
export const HANDSHAKES_DEMO: Handshake[] = [
  {
    "id": "HSK-0001",
    "casoId": "CAS-0001",
    "sedeCodigo": "110013028929",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Hemodinamia en procedimiento",
    "enviadoEn": "2026-08-22T19:02:33-05:00",
    "expiraEn": "2026-08-22T19:04:03-05:00",
    "respondidoEn": "2026-08-22T19:03:05-05:00",
    "latenciaS": 32,
    "etaMinAlDespachar": 17.7
  },
  {
    "id": "HSK-0002",
    "casoId": "CAS-0001",
    "sedeCodigo": "110013029402",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Sin especialista de turno",
    "enviadoEn": "2026-08-22T19:03:13-05:00",
    "expiraEn": "2026-08-22T19:04:43-05:00",
    "respondidoEn": "2026-08-22T19:04:29-05:00",
    "latenciaS": 76,
    "etaMinAlDespachar": 20.2
  },
  {
    "id": "HSK-0003",
    "casoId": "CAS-0001",
    "sedeCodigo": "110013028902",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Sala de reanimación ocupada",
    "enviadoEn": "2026-08-22T19:04:37-05:00",
    "expiraEn": "2026-08-22T19:06:07-05:00",
    "respondidoEn": "2026-08-22T19:05:40-05:00",
    "latenciaS": 63,
    "etaMinAlDespachar": 23.7
  },
  {
    "id": "HSK-0004",
    "casoId": "CAS-0001",
    "sedeCodigo": "110010566801",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Quirófano ocupado, tiempo estimado 90 minutos",
    "enviadoEn": "2026-08-22T19:05:50-05:00",
    "expiraEn": "2026-08-22T19:07:20-05:00",
    "respondidoEn": "2026-08-22T19:07:08-05:00",
    "latenciaS": 78,
    "etaMinAlDespachar": 24.8
  },
  {
    "id": "HSK-0005",
    "casoId": "CAS-0002",
    "sedeCodigo": "110010867901",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Urgencias en contingencia por sobreocupación",
    "enviadoEn": "2026-08-22T19:05:52-05:00",
    "expiraEn": "2026-08-22T19:07:22-05:00",
    "respondidoEn": "2026-08-22T19:06:07-05:00",
    "latenciaS": 15,
    "etaMinAlDespachar": 7.1
  },
  {
    "id": "HSK-0006",
    "casoId": "CAS-0002",
    "sedeCodigo": "110010606501",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:06:16-05:00",
    "expiraEn": "2026-08-22T19:07:46-05:00",
    "respondidoEn": "2026-08-22T19:07:14-05:00",
    "latenciaS": 58,
    "etaMinAlDespachar": 7.6
  },
  {
    "id": "HSK-0007",
    "casoId": "CAS-0003",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:08:49-05:00",
    "expiraEn": "2026-08-22T19:10:19-05:00",
    "respondidoEn": "2026-08-22T19:10:06-05:00",
    "latenciaS": 77,
    "etaMinAlDespachar": 1.0
  },
  {
    "id": "HSK-0008",
    "casoId": "CAS-0004",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin camas UCI adultos",
    "enviadoEn": "2026-08-22T19:12:19-05:00",
    "expiraEn": "2026-08-22T19:13:49-05:00",
    "respondidoEn": "2026-08-22T19:12:39-05:00",
    "latenciaS": 20,
    "etaMinAlDespachar": 1.9
  },
  {
    "id": "HSK-0009",
    "casoId": "CAS-0004",
    "sedeCodigo": "110010817103",
    "canal": "telegram",
    "estado": "timeout",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:12:49-05:00",
    "expiraEn": "2026-08-22T19:14:19-05:00",
    "respondidoEn": null,
    "latenciaS": null,
    "etaMinAlDespachar": 11.8
  },
  {
    "id": "HSK-0010",
    "casoId": "CAS-0004",
    "sedeCodigo": "110013029601",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:14:24-05:00",
    "expiraEn": "2026-08-22T19:15:54-05:00",
    "respondidoEn": "2026-08-22T19:14:41-05:00",
    "latenciaS": 17,
    "etaMinAlDespachar": 16.1
  },
  {
    "id": "HSK-0011",
    "casoId": "CAS-0005",
    "sedeCodigo": "110010966601",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:13:09-05:00",
    "expiraEn": "2026-08-22T19:14:39-05:00",
    "respondidoEn": "2026-08-22T19:13:30-05:00",
    "latenciaS": 21,
    "etaMinAlDespachar": 2.8
  },
  {
    "id": "HSK-0012",
    "casoId": "CAS-0006",
    "sedeCodigo": "110010867901",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:20:11-05:00",
    "expiraEn": "2026-08-22T19:21:41-05:00",
    "respondidoEn": "2026-08-22T19:21:18-05:00",
    "latenciaS": 67,
    "etaMinAlDespachar": 3.2
  },
  {
    "id": "HSK-0013",
    "casoId": "CAS-0007",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Urgencias en contingencia por sobreocupación",
    "enviadoEn": "2026-08-22T19:24:15-05:00",
    "expiraEn": "2026-08-22T19:25:45-05:00",
    "respondidoEn": "2026-08-22T19:24:37-05:00",
    "latenciaS": 22,
    "etaMinAlDespachar": 2.4
  },
  {
    "id": "HSK-0014",
    "casoId": "CAS-0007",
    "sedeCodigo": "110010817103",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:24:41-05:00",
    "expiraEn": "2026-08-22T19:26:11-05:00",
    "respondidoEn": "2026-08-22T19:25:45-05:00",
    "latenciaS": 64,
    "etaMinAlDespachar": 13.6
  },
  {
    "id": "HSK-0015",
    "casoId": "CAS-0008",
    "sedeCodigo": "110013028901",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:32:33-05:00",
    "expiraEn": "2026-08-22T19:34:03-05:00",
    "respondidoEn": "2026-08-22T19:33:14-05:00",
    "latenciaS": 41,
    "etaMinAlDespachar": 0.7
  },
  {
    "id": "HSK-0016",
    "casoId": "CAS-0009",
    "sedeCodigo": "110010918668",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:34:02-05:00",
    "expiraEn": "2026-08-22T19:35:32-05:00",
    "respondidoEn": "2026-08-22T19:35:09-05:00",
    "latenciaS": 67,
    "etaMinAlDespachar": 3.3
  },
  {
    "id": "HSK-0017",
    "casoId": "CAS-0010",
    "sedeCodigo": "110013029103",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Hemodinamia en procedimiento",
    "enviadoEn": "2026-08-22T19:39:09-05:00",
    "expiraEn": "2026-08-22T19:40:39-05:00",
    "respondidoEn": "2026-08-22T19:40:20-05:00",
    "latenciaS": 71,
    "etaMinAlDespachar": 3.8
  },
  {
    "id": "HSK-0018",
    "casoId": "CAS-0010",
    "sedeCodigo": "110010918668",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:40:27-05:00",
    "expiraEn": "2026-08-22T19:41:57-05:00",
    "respondidoEn": "2026-08-22T19:40:49-05:00",
    "latenciaS": 22,
    "etaMinAlDespachar": 4.2
  },
  {
    "id": "HSK-0019",
    "casoId": "CAS-0011",
    "sedeCodigo": "110010918668",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:41:24-05:00",
    "expiraEn": "2026-08-22T19:42:54-05:00",
    "respondidoEn": "2026-08-22T19:42:10-05:00",
    "latenciaS": 46,
    "etaMinAlDespachar": 3.0
  },
  {
    "id": "HSK-0020",
    "casoId": "CAS-0012",
    "sedeCodigo": "110013390301",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Quirófano ocupado, tiempo estimado 90 minutos",
    "enviadoEn": "2026-08-22T19:42:01-05:00",
    "expiraEn": "2026-08-22T19:43:31-05:00",
    "respondidoEn": "2026-08-22T19:42:22-05:00",
    "latenciaS": 21,
    "etaMinAlDespachar": 3.6
  },
  {
    "id": "HSK-0021",
    "casoId": "CAS-0012",
    "sedeCodigo": "110010918608",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Urgencias en contingencia por sobreocupación",
    "enviadoEn": "2026-08-22T19:42:28-05:00",
    "expiraEn": "2026-08-22T19:43:58-05:00",
    "respondidoEn": "2026-08-22T19:43:05-05:00",
    "latenciaS": 37,
    "etaMinAlDespachar": 5.2
  },
  {
    "id": "HSK-0022",
    "casoId": "CAS-0012",
    "sedeCodigo": "110010911101",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Sin cupo en observación pediátrica",
    "enviadoEn": "2026-08-22T19:43:14-05:00",
    "expiraEn": "2026-08-22T19:44:44-05:00",
    "respondidoEn": "2026-08-22T19:43:46-05:00",
    "latenciaS": 32,
    "etaMinAlDespachar": 6.3
  },
  {
    "id": "HSK-0023",
    "casoId": "CAS-0012",
    "sedeCodigo": "110010561801",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Tomógrafo fuera de servicio",
    "enviadoEn": "2026-08-22T19:43:54-05:00",
    "expiraEn": "2026-08-22T19:45:24-05:00",
    "respondidoEn": "2026-08-22T19:44:06-05:00",
    "latenciaS": 12,
    "etaMinAlDespachar": 7.5
  },
  {
    "id": "HSK-0024",
    "casoId": "CAS-0013",
    "sedeCodigo": "110011613301",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:43:38-05:00",
    "expiraEn": "2026-08-22T19:45:08-05:00",
    "respondidoEn": "2026-08-22T19:44:03-05:00",
    "latenciaS": 25,
    "etaMinAlDespachar": 1.3
  },
  {
    "id": "HSK-0025",
    "casoId": "CAS-0014",
    "sedeCodigo": "110012215001",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:52:23-05:00",
    "expiraEn": "2026-08-22T19:53:53-05:00",
    "respondidoEn": "2026-08-22T19:53:16-05:00",
    "latenciaS": 53,
    "etaMinAlDespachar": 1.6
  },
  {
    "id": "HSK-0026",
    "casoId": "CAS-0015",
    "sedeCodigo": "110013029601",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin especialista de turno",
    "enviadoEn": "2026-08-22T19:55:37-05:00",
    "expiraEn": "2026-08-22T19:57:07-05:00",
    "respondidoEn": "2026-08-22T19:56:49-05:00",
    "latenciaS": 72,
    "etaMinAlDespachar": 4.7
  },
  {
    "id": "HSK-0027",
    "casoId": "CAS-0015",
    "sedeCodigo": "110010966601",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:56:57-05:00",
    "expiraEn": "2026-08-22T19:58:27-05:00",
    "respondidoEn": "2026-08-22T19:57:08-05:00",
    "latenciaS": 11,
    "etaMinAlDespachar": 5.0
  },
  {
    "id": "HSK-0028",
    "casoId": "CAS-0016",
    "sedeCodigo": "110010966601",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T19:59:59-05:00",
    "expiraEn": "2026-08-22T20:01:29-05:00",
    "respondidoEn": "2026-08-22T20:00:26-05:00",
    "latenciaS": 27,
    "etaMinAlDespachar": 1.7
  },
  {
    "id": "HSK-0029",
    "casoId": "CAS-0017",
    "sedeCodigo": "110013028929",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T20:09:05-05:00",
    "expiraEn": "2026-08-22T20:10:35-05:00",
    "respondidoEn": "2026-08-22T20:10:12-05:00",
    "latenciaS": 67,
    "etaMinAlDespachar": 17.7
  },
  {
    "id": "HSK-0030",
    "casoId": "CAS-0018",
    "sedeCodigo": "110012215001",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin cupo en observación pediátrica",
    "enviadoEn": "2026-08-22T20:12:04-05:00",
    "expiraEn": "2026-08-22T20:13:34-05:00",
    "respondidoEn": "2026-08-22T20:13:12-05:00",
    "latenciaS": 68,
    "etaMinAlDespachar": 0.8
  },
  {
    "id": "HSK-0031",
    "casoId": "CAS-0018",
    "sedeCodigo": "110013029601",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Tomógrafo fuera de servicio",
    "enviadoEn": "2026-08-22T20:13:22-05:00",
    "expiraEn": "2026-08-22T20:14:52-05:00",
    "respondidoEn": "2026-08-22T20:13:54-05:00",
    "latenciaS": 32,
    "etaMinAlDespachar": 1.3
  },
  {
    "id": "HSK-0032",
    "casoId": "CAS-0018",
    "sedeCodigo": "110010966601",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T20:14:02-05:00",
    "expiraEn": "2026-08-22T20:15:32-05:00",
    "respondidoEn": "2026-08-22T20:14:30-05:00",
    "latenciaS": 28,
    "etaMinAlDespachar": 5.4
  },
  {
    "id": "HSK-0033",
    "casoId": "CAS-0019",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T20:14:28-05:00",
    "expiraEn": "2026-08-22T20:15:58-05:00",
    "respondidoEn": "2026-08-22T20:14:44-05:00",
    "latenciaS": 16,
    "etaMinAlDespachar": 1.6
  },
  {
    "id": "HSK-0034",
    "casoId": "CAS-0020",
    "sedeCodigo": "110010966601",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin especialista de turno",
    "enviadoEn": "2026-08-22T20:16:32-05:00",
    "expiraEn": "2026-08-22T20:18:02-05:00",
    "respondidoEn": "2026-08-22T20:16:53-05:00",
    "latenciaS": 21,
    "etaMinAlDespachar": 14.7
  },
  {
    "id": "HSK-0035",
    "casoId": "CAS-0020",
    "sedeCodigo": "110010918630",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Sala de reanimación ocupada",
    "enviadoEn": "2026-08-22T20:17:03-05:00",
    "expiraEn": "2026-08-22T20:18:33-05:00",
    "respondidoEn": "2026-08-22T20:17:45-05:00",
    "latenciaS": 42,
    "etaMinAlDespachar": 15.5
  },
  {
    "id": "HSK-0036",
    "casoId": "CAS-0020",
    "sedeCodigo": "110010918668",
    "canal": "consola",
    "estado": "timeout",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T20:17:55-05:00",
    "expiraEn": "2026-08-22T20:19:25-05:00",
    "respondidoEn": null,
    "latenciaS": null,
    "etaMinAlDespachar": 15.9
  },
  {
    "id": "HSK-0037",
    "casoId": "CAS-0020",
    "sedeCodigo": "110013029601",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Urgencias en contingencia por sobreocupación",
    "enviadoEn": "2026-08-22T20:19:32-05:00",
    "expiraEn": "2026-08-22T20:21:02-05:00",
    "respondidoEn": "2026-08-22T20:20:33-05:00",
    "latenciaS": 61,
    "etaMinAlDespachar": 17.8
  },
  {
    "id": "HSK-0038",
    "casoId": "CAS-0021",
    "sedeCodigo": "110010867901",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T20:21:40-05:00",
    "expiraEn": "2026-08-22T20:23:10-05:00",
    "respondidoEn": "2026-08-22T20:22:00-05:00",
    "latenciaS": 20,
    "etaMinAlDespachar": 6.3
  },
  {
    "id": "HSK-0039",
    "casoId": "CAS-0022",
    "sedeCodigo": "110010966601",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T20:26:12-05:00",
    "expiraEn": "2026-08-22T20:27:42-05:00",
    "respondidoEn": "2026-08-22T20:26:59-05:00",
    "latenciaS": 47,
    "etaMinAlDespachar": 3.9
  },
  {
    "id": "HSK-0040",
    "casoId": "CAS-0023",
    "sedeCodigo": "110012215001",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin camas UCI adultos",
    "enviadoEn": "2026-08-22T20:34:58-05:00",
    "expiraEn": "2026-08-22T20:36:28-05:00",
    "respondidoEn": "2026-08-22T20:35:49-05:00",
    "latenciaS": 51,
    "etaMinAlDespachar": 3.3
  },
  {
    "id": "HSK-0041",
    "casoId": "CAS-0023",
    "sedeCodigo": "110010966601",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T20:36:01-05:00",
    "expiraEn": "2026-08-22T20:37:31-05:00",
    "respondidoEn": "2026-08-22T20:36:25-05:00",
    "latenciaS": 24,
    "etaMinAlDespachar": 3.5
  },
  {
    "id": "HSK-0042",
    "casoId": "CAS-0024",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T20:44:01-05:00",
    "expiraEn": "2026-08-22T20:45:31-05:00",
    "respondidoEn": "2026-08-22T20:45:10-05:00",
    "latenciaS": 69,
    "etaMinAlDespachar": 2.1
  },
  {
    "id": "HSK-0043",
    "casoId": "CAS-0025",
    "sedeCodigo": "110013029103",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T20:46:57-05:00",
    "expiraEn": "2026-08-22T20:48:27-05:00",
    "respondidoEn": "2026-08-22T20:48:01-05:00",
    "latenciaS": 64,
    "etaMinAlDespachar": 3.3
  },
  {
    "id": "HSK-0044",
    "casoId": "CAS-0026",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Quirófano ocupado, tiempo estimado 90 minutos",
    "enviadoEn": "2026-08-22T20:49:01-05:00",
    "expiraEn": "2026-08-22T20:50:31-05:00",
    "respondidoEn": "2026-08-22T20:50:01-05:00",
    "latenciaS": 60,
    "etaMinAlDespachar": 1.2
  },
  {
    "id": "HSK-0045",
    "casoId": "CAS-0026",
    "sedeCodigo": "110010817103",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T20:50:09-05:00",
    "expiraEn": "2026-08-22T20:51:39-05:00",
    "respondidoEn": "2026-08-22T20:50:52-05:00",
    "latenciaS": 43,
    "etaMinAlDespachar": 10.9
  },
  {
    "id": "HSK-0046",
    "casoId": "CAS-0027",
    "sedeCodigo": "110010867901",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T20:55:09-05:00",
    "expiraEn": "2026-08-22T20:56:39-05:00",
    "respondidoEn": "2026-08-22T20:55:34-05:00",
    "latenciaS": 25,
    "etaMinAlDespachar": 2.3
  },
  {
    "id": "HSK-0047",
    "casoId": "CAS-0028",
    "sedeCodigo": "110010918630",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T20:55:48-05:00",
    "expiraEn": "2026-08-22T20:57:18-05:00",
    "respondidoEn": "2026-08-22T20:57:01-05:00",
    "latenciaS": 73,
    "etaMinAlDespachar": 3.8
  },
  {
    "id": "HSK-0048",
    "casoId": "CAS-0029",
    "sedeCodigo": "110013029625",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin camas UCI adultos",
    "enviadoEn": "2026-08-22T20:57:02-05:00",
    "expiraEn": "2026-08-22T20:58:32-05:00",
    "respondidoEn": "2026-08-22T20:57:32-05:00",
    "latenciaS": 30,
    "etaMinAlDespachar": 0.4
  },
  {
    "id": "HSK-0049",
    "casoId": "CAS-0029",
    "sedeCodigo": "110012156401",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Hemodinamia en procedimiento",
    "enviadoEn": "2026-08-22T20:57:39-05:00",
    "expiraEn": "2026-08-22T20:59:09-05:00",
    "respondidoEn": "2026-08-22T20:58:02-05:00",
    "latenciaS": 23,
    "etaMinAlDespachar": 1.7
  },
  {
    "id": "HSK-0050",
    "casoId": "CAS-0029",
    "sedeCodigo": "110013029603",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T20:58:10-05:00",
    "expiraEn": "2026-08-22T20:59:40-05:00",
    "respondidoEn": "2026-08-22T20:58:31-05:00",
    "latenciaS": 21,
    "etaMinAlDespachar": 5.7
  },
  {
    "id": "HSK-0051",
    "casoId": "CAS-0030",
    "sedeCodigo": "110010918668",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T21:00:10-05:00",
    "expiraEn": "2026-08-22T21:01:40-05:00",
    "respondidoEn": "2026-08-22T21:00:25-05:00",
    "latenciaS": 15,
    "etaMinAlDespachar": 5.2
  },
  {
    "id": "HSK-0052",
    "casoId": "CAS-0031",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Quirófano ocupado, tiempo estimado 90 minutos",
    "enviadoEn": "2026-08-22T21:02:42-05:00",
    "expiraEn": "2026-08-22T21:04:12-05:00",
    "respondidoEn": "2026-08-22T21:03:55-05:00",
    "latenciaS": 73,
    "etaMinAlDespachar": 1.9
  },
  {
    "id": "HSK-0053",
    "casoId": "CAS-0031",
    "sedeCodigo": "110013029601",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T21:04:00-05:00",
    "expiraEn": "2026-08-22T21:05:30-05:00",
    "respondidoEn": "2026-08-22T21:05:00-05:00",
    "latenciaS": 60,
    "etaMinAlDespachar": 14.5
  },
  {
    "id": "HSK-0054",
    "casoId": "CAS-0032",
    "sedeCodigo": "110010895201",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T21:04:49-05:00",
    "expiraEn": "2026-08-22T21:06:19-05:00",
    "respondidoEn": "2026-08-22T21:05:27-05:00",
    "latenciaS": 38,
    "etaMinAlDespachar": 2.0
  },
  {
    "id": "HSK-0055",
    "casoId": "CAS-0033",
    "sedeCodigo": "110010918668",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T21:08:00-05:00",
    "expiraEn": "2026-08-22T21:09:30-05:00",
    "respondidoEn": "2026-08-22T21:08:54-05:00",
    "latenciaS": 54,
    "etaMinAlDespachar": 3.7
  },
  {
    "id": "HSK-0056",
    "casoId": "CAS-0034",
    "sedeCodigo": "110013029114",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin camas UCI adultos",
    "enviadoEn": "2026-08-22T21:14:30-05:00",
    "expiraEn": "2026-08-22T21:16:00-05:00",
    "respondidoEn": "2026-08-22T21:15:47-05:00",
    "latenciaS": 77,
    "etaMinAlDespachar": 3.8
  },
  {
    "id": "HSK-0057",
    "casoId": "CAS-0034",
    "sedeCodigo": "110012156404",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Hemodinamia en procedimiento",
    "enviadoEn": "2026-08-22T21:15:59-05:00",
    "expiraEn": "2026-08-22T21:17:29-05:00",
    "respondidoEn": "2026-08-22T21:16:59-05:00",
    "latenciaS": 60,
    "etaMinAlDespachar": 4.0
  },
  {
    "id": "HSK-0058",
    "casoId": "CAS-0034",
    "sedeCodigo": "110012507001",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T21:17:07-05:00",
    "expiraEn": "2026-08-22T21:18:37-05:00",
    "respondidoEn": "2026-08-22T21:18:14-05:00",
    "latenciaS": 67,
    "etaMinAlDespachar": 5.4
  },
  {
    "id": "HSK-0059",
    "casoId": "CAS-0035",
    "sedeCodigo": "110013029625",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T21:17:40-05:00",
    "expiraEn": "2026-08-22T21:19:10-05:00",
    "respondidoEn": "2026-08-22T21:18:54-05:00",
    "latenciaS": 74,
    "etaMinAlDespachar": 0.5
  },
  {
    "id": "HSK-0060",
    "casoId": "CAS-0036",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T21:20:11-05:00",
    "expiraEn": "2026-08-22T21:21:41-05:00",
    "respondidoEn": "2026-08-22T21:21:20-05:00",
    "latenciaS": 69,
    "etaMinAlDespachar": 2.4
  },
  {
    "id": "HSK-0061",
    "casoId": "CAS-0037",
    "sedeCodigo": "110010911101",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Urgencias en contingencia por sobreocupación",
    "enviadoEn": "2026-08-22T21:22:40-05:00",
    "expiraEn": "2026-08-22T21:24:10-05:00",
    "respondidoEn": "2026-08-22T21:23:15-05:00",
    "latenciaS": 35,
    "etaMinAlDespachar": 4.2
  },
  {
    "id": "HSK-0062",
    "casoId": "CAS-0037",
    "sedeCodigo": "110013390301",
    "canal": "consola",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T21:23:23-05:00",
    "expiraEn": "2026-08-22T21:24:53-05:00",
    "respondidoEn": "2026-08-22T21:23:37-05:00",
    "latenciaS": 14,
    "etaMinAlDespachar": 6.3
  },
  {
    "id": "HSK-0063",
    "casoId": "CAS-0038",
    "sedeCodigo": "110012215001",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T21:28:27-05:00",
    "expiraEn": "2026-08-22T21:29:57-05:00",
    "respondidoEn": "2026-08-22T21:29:37-05:00",
    "latenciaS": 70,
    "etaMinAlDespachar": 2.3
  },
  {
    "id": "HSK-0064",
    "casoId": "CAS-0039",
    "sedeCodigo": "110010568101",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin camas UCI adultos",
    "enviadoEn": "2026-08-22T21:29:27-05:00",
    "expiraEn": "2026-08-22T21:30:57-05:00",
    "respondidoEn": "2026-08-22T21:30:39-05:00",
    "latenciaS": 72,
    "etaMinAlDespachar": 1.2
  },
  {
    "id": "HSK-0065",
    "casoId": "CAS-0039",
    "sedeCodigo": "110010867901",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Hemodinamia en procedimiento",
    "enviadoEn": "2026-08-22T21:30:50-05:00",
    "expiraEn": "2026-08-22T21:32:20-05:00",
    "respondidoEn": "2026-08-22T21:31:01-05:00",
    "latenciaS": 11,
    "etaMinAlDespachar": 2.1
  },
  {
    "id": "HSK-0066",
    "casoId": "CAS-0039",
    "sedeCodigo": "110010606501",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Sin especialista de turno",
    "enviadoEn": "2026-08-22T21:31:10-05:00",
    "expiraEn": "2026-08-22T21:32:40-05:00",
    "respondidoEn": "2026-08-22T21:31:51-05:00",
    "latenciaS": 41,
    "etaMinAlDespachar": 2.4
  },
  {
    "id": "HSK-0067",
    "casoId": "CAS-0040",
    "sedeCodigo": "110013029103",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T21:41:25-05:00",
    "expiraEn": "2026-08-22T21:42:55-05:00",
    "respondidoEn": "2026-08-22T21:41:53-05:00",
    "latenciaS": 28,
    "etaMinAlDespachar": 3.2
  },
  {
    "id": "HSK-0068",
    "casoId": "CAS-0041",
    "sedeCodigo": "110013029625",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T21:42:37-05:00",
    "expiraEn": "2026-08-22T21:44:07-05:00",
    "respondidoEn": "2026-08-22T21:43:54-05:00",
    "latenciaS": 77,
    "etaMinAlDespachar": 1.3
  },
  {
    "id": "HSK-0069",
    "casoId": "CAS-0042",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Urgencias en contingencia por sobreocupación",
    "enviadoEn": "2026-08-22T21:45:09-05:00",
    "expiraEn": "2026-08-22T21:46:39-05:00",
    "respondidoEn": "2026-08-22T21:45:54-05:00",
    "latenciaS": 45,
    "etaMinAlDespachar": 2.4
  },
  {
    "id": "HSK-0070",
    "casoId": "CAS-0042",
    "sedeCodigo": "110010817103",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Sin cupo en observación pediátrica",
    "enviadoEn": "2026-08-22T21:46:06-05:00",
    "expiraEn": "2026-08-22T21:47:36-05:00",
    "respondidoEn": "2026-08-22T21:46:47-05:00",
    "latenciaS": 41,
    "etaMinAlDespachar": 13.0
  },
  {
    "id": "HSK-0071",
    "casoId": "CAS-0042",
    "sedeCodigo": "110013029601",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T21:46:57-05:00",
    "expiraEn": "2026-08-22T21:48:27-05:00",
    "respondidoEn": "2026-08-22T21:47:40-05:00",
    "latenciaS": 43,
    "etaMinAlDespachar": 18.0
  },
  {
    "id": "HSK-0072",
    "casoId": "CAS-0043",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T21:54:10-05:00",
    "expiraEn": "2026-08-22T21:55:40-05:00",
    "respondidoEn": "2026-08-22T21:54:39-05:00",
    "latenciaS": 29,
    "etaMinAlDespachar": 0.4
  },
  {
    "id": "HSK-0073",
    "casoId": "CAS-0044",
    "sedeCodigo": "110013029401",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T21:59:49-05:00",
    "expiraEn": "2026-08-22T22:01:19-05:00",
    "respondidoEn": "2026-08-22T22:00:44-05:00",
    "latenciaS": 55,
    "etaMinAlDespachar": 1.5
  },
  {
    "id": "HSK-0074",
    "casoId": "CAS-0045",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin especialista de turno",
    "enviadoEn": "2026-08-22T22:08:40-05:00",
    "expiraEn": "2026-08-22T22:10:10-05:00",
    "respondidoEn": "2026-08-22T22:08:57-05:00",
    "latenciaS": 17,
    "etaMinAlDespachar": 2.0
  },
  {
    "id": "HSK-0075",
    "casoId": "CAS-0045",
    "sedeCodigo": "110010817103",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Sala de reanimación ocupada",
    "enviadoEn": "2026-08-22T22:09:02-05:00",
    "expiraEn": "2026-08-22T22:10:32-05:00",
    "respondidoEn": "2026-08-22T22:10:09-05:00",
    "latenciaS": 67,
    "etaMinAlDespachar": 11.5
  },
  {
    "id": "HSK-0076",
    "casoId": "CAS-0045",
    "sedeCodigo": "110013029601",
    "canal": "consola",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T22:10:19-05:00",
    "expiraEn": "2026-08-22T22:11:49-05:00",
    "respondidoEn": "2026-08-22T22:11:05-05:00",
    "latenciaS": 46,
    "etaMinAlDespachar": 15.7
  },
  {
    "id": "HSK-0077",
    "casoId": "CAS-0046",
    "sedeCodigo": "110010918630",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T22:14:37-05:00",
    "expiraEn": "2026-08-22T22:16:07-05:00",
    "respondidoEn": "2026-08-22T22:15:49-05:00",
    "latenciaS": 72,
    "etaMinAlDespachar": 4.0
  },
  {
    "id": "HSK-0078",
    "casoId": "CAS-0047",
    "sedeCodigo": "110010918668",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin cupo en observación pediátrica",
    "enviadoEn": "2026-08-22T22:16:35-05:00",
    "expiraEn": "2026-08-22T22:18:05-05:00",
    "respondidoEn": "2026-08-22T22:16:59-05:00",
    "latenciaS": 24,
    "etaMinAlDespachar": 4.6
  },
  {
    "id": "HSK-0079",
    "casoId": "CAS-0047",
    "sedeCodigo": "110010644701",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Tomógrafo fuera de servicio",
    "enviadoEn": "2026-08-22T22:17:09-05:00",
    "expiraEn": "2026-08-22T22:18:39-05:00",
    "respondidoEn": "2026-08-22T22:18:01-05:00",
    "latenciaS": 52,
    "etaMinAlDespachar": 11.8
  },
  {
    "id": "HSK-0080",
    "casoId": "CAS-0047",
    "sedeCodigo": "110011613301",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Sin camas UCI adultos",
    "enviadoEn": "2026-08-22T22:18:09-05:00",
    "expiraEn": "2026-08-22T22:19:39-05:00",
    "respondidoEn": "2026-08-22T22:19:24-05:00",
    "latenciaS": 75,
    "etaMinAlDespachar": 13.6
  },
  {
    "id": "HSK-0081",
    "casoId": "CAS-0048",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "timeout",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T22:21:06-05:00",
    "expiraEn": "2026-08-22T22:22:36-05:00",
    "respondidoEn": null,
    "latenciaS": null,
    "etaMinAlDespachar": 2.1
  },
  {
    "id": "HSK-0082",
    "casoId": "CAS-0048",
    "sedeCodigo": "110010817103",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin especialista de turno",
    "enviadoEn": "2026-08-22T22:22:45-05:00",
    "expiraEn": "2026-08-22T22:24:15-05:00",
    "respondidoEn": "2026-08-22T22:23:48-05:00",
    "latenciaS": 63,
    "etaMinAlDespachar": 13.5
  },
  {
    "id": "HSK-0083",
    "casoId": "CAS-0048",
    "sedeCodigo": "110013029601",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T22:23:58-05:00",
    "expiraEn": "2026-08-22T22:25:28-05:00",
    "respondidoEn": "2026-08-22T22:25:03-05:00",
    "latenciaS": 65,
    "etaMinAlDespachar": 18.2
  },
  {
    "id": "HSK-0084",
    "casoId": "CAS-0049",
    "sedeCodigo": "110010918668",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T22:24:18-05:00",
    "expiraEn": "2026-08-22T22:25:48-05:00",
    "respondidoEn": "2026-08-22T22:25:23-05:00",
    "latenciaS": 65,
    "etaMinAlDespachar": 2.3
  },
  {
    "id": "HSK-0085",
    "casoId": "CAS-0050",
    "sedeCodigo": "110012156404",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Urgencias en contingencia por sobreocupación",
    "enviadoEn": "2026-08-22T22:40:09-05:00",
    "expiraEn": "2026-08-22T22:41:39-05:00",
    "respondidoEn": "2026-08-22T22:41:19-05:00",
    "latenciaS": 70,
    "etaMinAlDespachar": 2.1
  },
  {
    "id": "HSK-0086",
    "casoId": "CAS-0050",
    "sedeCodigo": "110013029114",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Sin cupo en observación pediátrica",
    "enviadoEn": "2026-08-22T22:41:29-05:00",
    "expiraEn": "2026-08-22T22:42:59-05:00",
    "respondidoEn": "2026-08-22T22:41:55-05:00",
    "latenciaS": 26,
    "etaMinAlDespachar": 5.4
  },
  {
    "id": "HSK-0087",
    "casoId": "CAS-0050",
    "sedeCodigo": "110010910401",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T22:42:00-05:00",
    "expiraEn": "2026-08-22T22:43:30-05:00",
    "respondidoEn": "2026-08-22T22:42:18-05:00",
    "latenciaS": 18,
    "etaMinAlDespachar": 7.5
  },
  {
    "id": "HSK-0088",
    "casoId": "CAS-0051",
    "sedeCodigo": "110010918668",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T22:40:44-05:00",
    "expiraEn": "2026-08-22T22:42:14-05:00",
    "respondidoEn": "2026-08-22T22:41:41-05:00",
    "latenciaS": 57,
    "etaMinAlDespachar": 5.3
  },
  {
    "id": "HSK-0089",
    "casoId": "CAS-0052",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T22:44:01-05:00",
    "expiraEn": "2026-08-22T22:45:31-05:00",
    "respondidoEn": "2026-08-22T22:44:13-05:00",
    "latenciaS": 12,
    "etaMinAlDespachar": 1.7
  },
  {
    "id": "HSK-0090",
    "casoId": "CAS-0053",
    "sedeCodigo": "110012215001",
    "canal": "telegram",
    "estado": "timeout",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T22:45:53-05:00",
    "expiraEn": "2026-08-22T22:47:23-05:00",
    "respondidoEn": null,
    "latenciaS": null,
    "etaMinAlDespachar": 1.0
  },
  {
    "id": "HSK-0091",
    "casoId": "CAS-0053",
    "sedeCodigo": "110013029601",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T22:47:28-05:00",
    "expiraEn": "2026-08-22T22:48:58-05:00",
    "respondidoEn": "2026-08-22T22:48:07-05:00",
    "latenciaS": 39,
    "etaMinAlDespachar": 2.4
  },
  {
    "id": "HSK-0092",
    "casoId": "CAS-0054",
    "sedeCodigo": "110012156404",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T22:48:32-05:00",
    "expiraEn": "2026-08-22T22:50:02-05:00",
    "respondidoEn": "2026-08-22T22:48:45-05:00",
    "latenciaS": 13,
    "etaMinAlDespachar": 1.2
  },
  {
    "id": "HSK-0093",
    "casoId": "CAS-0055",
    "sedeCodigo": "110012507001",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T22:54:03-05:00",
    "expiraEn": "2026-08-22T22:55:33-05:00",
    "respondidoEn": "2026-08-22T22:54:58-05:00",
    "latenciaS": 55,
    "etaMinAlDespachar": 8.6
  },
  {
    "id": "HSK-0094",
    "casoId": "CAS-0056",
    "sedeCodigo": "110013029401",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin cupo en observación pediátrica",
    "enviadoEn": "2026-08-22T22:58:58-05:00",
    "expiraEn": "2026-08-22T23:00:28-05:00",
    "respondidoEn": "2026-08-22T22:59:34-05:00",
    "latenciaS": 36,
    "etaMinAlDespachar": 2.0
  },
  {
    "id": "HSK-0095",
    "casoId": "CAS-0056",
    "sedeCodigo": "110010917802",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Tomógrafo fuera de servicio",
    "enviadoEn": "2026-08-22T22:59:45-05:00",
    "expiraEn": "2026-08-22T23:01:15-05:00",
    "respondidoEn": "2026-08-22T22:59:54-05:00",
    "latenciaS": 9,
    "etaMinAlDespachar": 5.6
  },
  {
    "id": "HSK-0096",
    "casoId": "CAS-0056",
    "sedeCodigo": "110013029402",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:00:02-05:00",
    "expiraEn": "2026-08-22T23:01:32-05:00",
    "respondidoEn": "2026-08-22T23:01:14-05:00",
    "latenciaS": 72,
    "etaMinAlDespachar": 7.0
  },
  {
    "id": "HSK-0097",
    "casoId": "CAS-0057",
    "sedeCodigo": "110012156404",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:00:30-05:00",
    "expiraEn": "2026-08-22T23:02:00-05:00",
    "respondidoEn": "2026-08-22T23:01:41-05:00",
    "latenciaS": 71,
    "etaMinAlDespachar": 1.8
  },
  {
    "id": "HSK-0098",
    "casoId": "CAS-0058",
    "sedeCodigo": "110012215001",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin especialista de turno",
    "enviadoEn": "2026-08-22T23:04:22-05:00",
    "expiraEn": "2026-08-22T23:05:52-05:00",
    "respondidoEn": "2026-08-22T23:05:16-05:00",
    "latenciaS": 54,
    "etaMinAlDespachar": 1.3
  },
  {
    "id": "HSK-0099",
    "casoId": "CAS-0058",
    "sedeCodigo": "110013029601",
    "canal": "whatsapp",
    "estado": "timeout",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:05:23-05:00",
    "expiraEn": "2026-08-22T23:06:53-05:00",
    "respondidoEn": null,
    "latenciaS": null,
    "etaMinAlDespachar": 3.1
  },
  {
    "id": "HSK-0100",
    "casoId": "CAS-0058",
    "sedeCodigo": "110010966601",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Quirófano ocupado, tiempo estimado 90 minutos",
    "enviadoEn": "2026-08-22T23:07:03-05:00",
    "expiraEn": "2026-08-22T23:08:33-05:00",
    "respondidoEn": "2026-08-22T23:07:19-05:00",
    "latenciaS": 16,
    "etaMinAlDespachar": 3.8
  },
  {
    "id": "HSK-0101",
    "casoId": "CAS-0059",
    "sedeCodigo": "110013029402",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:04:42-05:00",
    "expiraEn": "2026-08-22T23:06:12-05:00",
    "respondidoEn": "2026-08-22T23:05:23-05:00",
    "latenciaS": 41,
    "etaMinAlDespachar": 2.5
  },
  {
    "id": "HSK-0102",
    "casoId": "CAS-0060",
    "sedeCodigo": "110010966601",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:05:32-05:00",
    "expiraEn": "2026-08-22T23:07:02-05:00",
    "respondidoEn": "2026-08-22T23:06:39-05:00",
    "latenciaS": 67,
    "etaMinAlDespachar": 1.1
  },
  {
    "id": "HSK-0103",
    "casoId": "CAS-0061",
    "sedeCodigo": "110010566801",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Tomógrafo fuera de servicio",
    "enviadoEn": "2026-08-22T23:08:50-05:00",
    "expiraEn": "2026-08-22T23:10:20-05:00",
    "respondidoEn": "2026-08-22T23:10:08-05:00",
    "latenciaS": 78,
    "etaMinAlDespachar": 2.0
  },
  {
    "id": "HSK-0104",
    "casoId": "CAS-0061",
    "sedeCodigo": "110010922401",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Sin camas UCI adultos",
    "enviadoEn": "2026-08-22T23:10:13-05:00",
    "expiraEn": "2026-08-22T23:11:43-05:00",
    "respondidoEn": "2026-08-22T23:10:48-05:00",
    "latenciaS": 35,
    "etaMinAlDespachar": 2.9
  },
  {
    "id": "HSK-0105",
    "casoId": "CAS-0061",
    "sedeCodigo": "110013028901",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:10:55-05:00",
    "expiraEn": "2026-08-22T23:12:25-05:00",
    "respondidoEn": "2026-08-22T23:11:36-05:00",
    "latenciaS": 41,
    "etaMinAlDespachar": 4.7
  },
  {
    "id": "HSK-0106",
    "casoId": "CAS-0062",
    "sedeCodigo": "110012215001",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:13:37-05:00",
    "expiraEn": "2026-08-22T23:15:07-05:00",
    "respondidoEn": "2026-08-22T23:14:17-05:00",
    "latenciaS": 40,
    "etaMinAlDespachar": 2.9
  },
  {
    "id": "HSK-0107",
    "casoId": "CAS-0063",
    "sedeCodigo": "110013029103",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:16:28-05:00",
    "expiraEn": "2026-08-22T23:17:58-05:00",
    "respondidoEn": "2026-08-22T23:16:43-05:00",
    "latenciaS": 15,
    "etaMinAlDespachar": 2.1
  },
  {
    "id": "HSK-0108",
    "casoId": "CAS-0064",
    "sedeCodigo": "110010945601",
    "canal": "telegram",
    "estado": "timeout",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:21:32-05:00",
    "expiraEn": "2026-08-22T23:23:02-05:00",
    "respondidoEn": null,
    "latenciaS": null,
    "etaMinAlDespachar": 5.8
  },
  {
    "id": "HSK-0109",
    "casoId": "CAS-0064",
    "sedeCodigo": "110010867901",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:23:08-05:00",
    "expiraEn": "2026-08-22T23:24:38-05:00",
    "respondidoEn": "2026-08-22T23:24:09-05:00",
    "latenciaS": 61,
    "etaMinAlDespachar": 6.8
  },
  {
    "id": "HSK-0110",
    "casoId": "CAS-0065",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:35:05-05:00",
    "expiraEn": "2026-08-22T23:36:35-05:00",
    "respondidoEn": "2026-08-22T23:35:57-05:00",
    "latenciaS": 52,
    "etaMinAlDespachar": 1.8
  },
  {
    "id": "HSK-0111",
    "casoId": "CAS-0066",
    "sedeCodigo": "110010966601",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Tomógrafo fuera de servicio",
    "enviadoEn": "2026-08-22T23:45:25-05:00",
    "expiraEn": "2026-08-22T23:46:55-05:00",
    "respondidoEn": "2026-08-22T23:45:38-05:00",
    "latenciaS": 13,
    "etaMinAlDespachar": 2.5
  },
  {
    "id": "HSK-0112",
    "casoId": "CAS-0066",
    "sedeCodigo": "110012215001",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Sin camas UCI adultos",
    "enviadoEn": "2026-08-22T23:45:47-05:00",
    "expiraEn": "2026-08-22T23:47:17-05:00",
    "respondidoEn": "2026-08-22T23:46:20-05:00",
    "latenciaS": 33,
    "etaMinAlDespachar": 2.6
  },
  {
    "id": "HSK-0113",
    "casoId": "CAS-0066",
    "sedeCodigo": "110013029601",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Hemodinamia en procedimiento",
    "enviadoEn": "2026-08-22T23:46:31-05:00",
    "expiraEn": "2026-08-22T23:48:01-05:00",
    "respondidoEn": "2026-08-22T23:46:51-05:00",
    "latenciaS": 20,
    "etaMinAlDespachar": 4.2
  },
  {
    "id": "HSK-0114",
    "casoId": "CAS-0066",
    "sedeCodigo": "110013029603",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin especialista de turno",
    "enviadoEn": "2026-08-22T23:46:55-05:00",
    "expiraEn": "2026-08-22T23:48:25-05:00",
    "respondidoEn": "2026-08-22T23:47:47-05:00",
    "latenciaS": 52,
    "etaMinAlDespachar": 8.6
  },
  {
    "id": "HSK-0115",
    "casoId": "CAS-0067",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:52:02-05:00",
    "expiraEn": "2026-08-22T23:53:32-05:00",
    "respondidoEn": "2026-08-22T23:52:55-05:00",
    "latenciaS": 53,
    "etaMinAlDespachar": 0.9
  },
  {
    "id": "HSK-0116",
    "casoId": "CAS-0068",
    "sedeCodigo": "110013627801",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:53:25-05:00",
    "expiraEn": "2026-08-22T23:54:55-05:00",
    "respondidoEn": "2026-08-22T23:54:39-05:00",
    "latenciaS": 74,
    "etaMinAlDespachar": 1.7
  },
  {
    "id": "HSK-0117",
    "casoId": "CAS-0069",
    "sedeCodigo": "110010566801",
    "canal": "telegram",
    "estado": "timeout",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:57:58-05:00",
    "expiraEn": "2026-08-22T23:59:28-05:00",
    "respondidoEn": null,
    "latenciaS": null,
    "etaMinAlDespachar": 0.9
  },
  {
    "id": "HSK-0118",
    "casoId": "CAS-0069",
    "sedeCodigo": "110013028902",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-22T23:59:40-05:00",
    "expiraEn": "2026-08-23T00:01:10-05:00",
    "respondidoEn": "2026-08-23T00:00:58-05:00",
    "latenciaS": 78,
    "etaMinAlDespachar": 3.6
  },
  {
    "id": "HSK-0119",
    "casoId": "CAS-0070",
    "sedeCodigo": "110010966601",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T00:06:35-05:00",
    "expiraEn": "2026-08-23T00:08:05-05:00",
    "respondidoEn": "2026-08-23T00:07:07-05:00",
    "latenciaS": 32,
    "etaMinAlDespachar": 1.0
  },
  {
    "id": "HSK-0120",
    "casoId": "CAS-0071",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T00:12:07-05:00",
    "expiraEn": "2026-08-23T00:13:37-05:00",
    "respondidoEn": "2026-08-23T00:12:41-05:00",
    "latenciaS": 34,
    "etaMinAlDespachar": 1.6
  },
  {
    "id": "HSK-0121",
    "casoId": "CAS-0072",
    "sedeCodigo": "110013028929",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Hemodinamia en procedimiento",
    "enviadoEn": "2026-08-23T00:16:05-05:00",
    "expiraEn": "2026-08-23T00:17:35-05:00",
    "respondidoEn": "2026-08-23T00:16:23-05:00",
    "latenciaS": 18,
    "etaMinAlDespachar": 4.9
  },
  {
    "id": "HSK-0122",
    "casoId": "CAS-0072",
    "sedeCodigo": "110010917802",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Sin especialista de turno",
    "enviadoEn": "2026-08-23T00:16:33-05:00",
    "expiraEn": "2026-08-23T00:18:03-05:00",
    "respondidoEn": "2026-08-23T00:17:34-05:00",
    "latenciaS": 61,
    "etaMinAlDespachar": 6.0
  },
  {
    "id": "HSK-0123",
    "casoId": "CAS-0072",
    "sedeCodigo": "110010566801",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T00:17:42-05:00",
    "expiraEn": "2026-08-23T00:19:12-05:00",
    "respondidoEn": "2026-08-23T00:17:58-05:00",
    "latenciaS": 16,
    "etaMinAlDespachar": 6.3
  },
  {
    "id": "HSK-0124",
    "casoId": "CAS-0073",
    "sedeCodigo": "110013390301",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T00:19:50-05:00",
    "expiraEn": "2026-08-23T00:21:20-05:00",
    "respondidoEn": "2026-08-23T00:20:16-05:00",
    "latenciaS": 26,
    "etaMinAlDespachar": 3.3
  },
  {
    "id": "HSK-0125",
    "casoId": "CAS-0074",
    "sedeCodigo": "110010918668",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Urgencias en contingencia por sobreocupación",
    "enviadoEn": "2026-08-23T00:30:11-05:00",
    "expiraEn": "2026-08-23T00:31:41-05:00",
    "respondidoEn": "2026-08-23T00:31:21-05:00",
    "latenciaS": 70,
    "etaMinAlDespachar": 2.2
  },
  {
    "id": "HSK-0126",
    "casoId": "CAS-0074",
    "sedeCodigo": "110013029103",
    "canal": "consola",
    "estado": "timeout",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T00:31:27-05:00",
    "expiraEn": "2026-08-23T00:32:57-05:00",
    "respondidoEn": null,
    "latenciaS": null,
    "etaMinAlDespachar": 4.3
  },
  {
    "id": "HSK-0127",
    "casoId": "CAS-0074",
    "sedeCodigo": "110010644701",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Tomógrafo fuera de servicio",
    "enviadoEn": "2026-08-23T00:33:04-05:00",
    "expiraEn": "2026-08-23T00:34:34-05:00",
    "respondidoEn": "2026-08-23T00:33:28-05:00",
    "latenciaS": 24,
    "etaMinAlDespachar": 8.6
  },
  {
    "id": "HSK-0128",
    "casoId": "CAS-0074",
    "sedeCodigo": "110012156404",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Sin camas UCI adultos",
    "enviadoEn": "2026-08-23T00:33:37-05:00",
    "expiraEn": "2026-08-23T00:35:07-05:00",
    "respondidoEn": "2026-08-23T00:33:55-05:00",
    "latenciaS": 18,
    "etaMinAlDespachar": 10.8
  },
  {
    "id": "HSK-0129",
    "casoId": "CAS-0075",
    "sedeCodigo": "110010917802",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Hemodinamia en procedimiento",
    "enviadoEn": "2026-08-23T00:31:03-05:00",
    "expiraEn": "2026-08-23T00:32:33-05:00",
    "respondidoEn": "2026-08-23T00:31:45-05:00",
    "latenciaS": 42,
    "etaMinAlDespachar": 3.8
  },
  {
    "id": "HSK-0130",
    "casoId": "CAS-0075",
    "sedeCodigo": "110010566801",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Sin especialista de turno",
    "enviadoEn": "2026-08-23T00:31:55-05:00",
    "expiraEn": "2026-08-23T00:33:25-05:00",
    "respondidoEn": "2026-08-23T00:32:09-05:00",
    "latenciaS": 14,
    "etaMinAlDespachar": 4.1
  },
  {
    "id": "HSK-0131",
    "casoId": "CAS-0075",
    "sedeCodigo": "110013028902",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T00:32:13-05:00",
    "expiraEn": "2026-08-23T00:33:43-05:00",
    "respondidoEn": "2026-08-23T00:32:47-05:00",
    "latenciaS": 34,
    "etaMinAlDespachar": 5.8
  },
  {
    "id": "HSK-0132",
    "casoId": "CAS-0076",
    "sedeCodigo": "110013029103",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T00:33:47-05:00",
    "expiraEn": "2026-08-23T00:35:17-05:00",
    "respondidoEn": "2026-08-23T00:34:13-05:00",
    "latenciaS": 26,
    "etaMinAlDespachar": 2.2
  },
  {
    "id": "HSK-0133",
    "casoId": "CAS-0077",
    "sedeCodigo": "110011864201",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Urgencias en contingencia por sobreocupación",
    "enviadoEn": "2026-08-23T00:37:23-05:00",
    "expiraEn": "2026-08-23T00:38:53-05:00",
    "respondidoEn": "2026-08-23T00:37:53-05:00",
    "latenciaS": 30,
    "etaMinAlDespachar": 2.5
  },
  {
    "id": "HSK-0134",
    "casoId": "CAS-0077",
    "sedeCodigo": "110010867901",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Sin cupo en observación pediátrica",
    "enviadoEn": "2026-08-23T00:37:57-05:00",
    "expiraEn": "2026-08-23T00:39:27-05:00",
    "respondidoEn": "2026-08-23T00:38:34-05:00",
    "latenciaS": 37,
    "etaMinAlDespachar": 3.6
  },
  {
    "id": "HSK-0135",
    "casoId": "CAS-0077",
    "sedeCodigo": "110010568101",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T00:38:45-05:00",
    "expiraEn": "2026-08-23T00:40:15-05:00",
    "respondidoEn": "2026-08-23T00:39:30-05:00",
    "latenciaS": 45,
    "etaMinAlDespachar": 6.7
  },
  {
    "id": "HSK-0136",
    "casoId": "CAS-0078",
    "sedeCodigo": "110013029601",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T00:39:36-05:00",
    "expiraEn": "2026-08-23T00:41:06-05:00",
    "respondidoEn": "2026-08-23T00:39:56-05:00",
    "latenciaS": 20,
    "etaMinAlDespachar": 3.4
  },
  {
    "id": "HSK-0137",
    "casoId": "CAS-0079",
    "sedeCodigo": "110012215001",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T00:50:11-05:00",
    "expiraEn": "2026-08-23T00:51:41-05:00",
    "respondidoEn": "2026-08-23T00:51:01-05:00",
    "latenciaS": 50,
    "etaMinAlDespachar": 3.6
  },
  {
    "id": "HSK-0138",
    "casoId": "CAS-0080",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin especialista de turno",
    "enviadoEn": "2026-08-23T00:59:06-05:00",
    "expiraEn": "2026-08-23T01:00:36-05:00",
    "respondidoEn": "2026-08-23T00:59:18-05:00",
    "latenciaS": 12,
    "etaMinAlDespachar": 2.5
  },
  {
    "id": "HSK-0139",
    "casoId": "CAS-0080",
    "sedeCodigo": "110010817103",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T00:59:25-05:00",
    "expiraEn": "2026-08-23T01:00:55-05:00",
    "respondidoEn": "2026-08-23T00:59:44-05:00",
    "latenciaS": 19,
    "etaMinAlDespachar": 13.1
  },
  {
    "id": "HSK-0140",
    "casoId": "CAS-0081",
    "sedeCodigo": "110013029114",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T01:02:16-05:00",
    "expiraEn": "2026-08-23T01:03:46-05:00",
    "respondidoEn": "2026-08-23T01:02:26-05:00",
    "latenciaS": 10,
    "etaMinAlDespachar": 2.1
  },
  {
    "id": "HSK-0141",
    "casoId": "CAS-0082",
    "sedeCodigo": "110010966601",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T01:08:18-05:00",
    "expiraEn": "2026-08-23T01:09:48-05:00",
    "respondidoEn": "2026-08-23T01:09:12-05:00",
    "latenciaS": 54,
    "etaMinAlDespachar": 1.8
  },
  {
    "id": "HSK-0142",
    "casoId": "CAS-0083",
    "sedeCodigo": "110010817102",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin cupo en observación pediátrica",
    "enviadoEn": "2026-08-23T01:34:50-05:00",
    "expiraEn": "2026-08-23T01:36:20-05:00",
    "respondidoEn": "2026-08-23T01:35:12-05:00",
    "latenciaS": 22,
    "etaMinAlDespachar": 2.6
  },
  {
    "id": "HSK-0143",
    "casoId": "CAS-0083",
    "sedeCodigo": "110013502501",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Tomógrafo fuera de servicio",
    "enviadoEn": "2026-08-23T01:35:20-05:00",
    "expiraEn": "2026-08-23T01:36:50-05:00",
    "respondidoEn": "2026-08-23T01:36:27-05:00",
    "latenciaS": 67,
    "etaMinAlDespachar": 2.9
  },
  {
    "id": "HSK-0144",
    "casoId": "CAS-0083",
    "sedeCodigo": "110010959901",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T01:36:31-05:00",
    "expiraEn": "2026-08-23T01:38:01-05:00",
    "respondidoEn": "2026-08-23T01:37:39-05:00",
    "latenciaS": 68,
    "etaMinAlDespachar": 4.0
  },
  {
    "id": "HSK-0145",
    "casoId": "CAS-0084",
    "sedeCodigo": "110010867901",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T01:42:38-05:00",
    "expiraEn": "2026-08-23T01:44:08-05:00",
    "respondidoEn": "2026-08-23T01:43:55-05:00",
    "latenciaS": 77,
    "etaMinAlDespachar": 1.4
  },
  {
    "id": "HSK-0146",
    "casoId": "CAS-0085",
    "sedeCodigo": "110010867901",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin especialista de turno",
    "enviadoEn": "2026-08-23T01:43:03-05:00",
    "expiraEn": "2026-08-23T01:44:33-05:00",
    "respondidoEn": "2026-08-23T01:43:34-05:00",
    "latenciaS": 31,
    "etaMinAlDespachar": 2.2
  },
  {
    "id": "HSK-0147",
    "casoId": "CAS-0085",
    "sedeCodigo": "110011864201",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Sala de reanimación ocupada",
    "enviadoEn": "2026-08-23T01:43:42-05:00",
    "expiraEn": "2026-08-23T01:45:12-05:00",
    "respondidoEn": "2026-08-23T01:44:02-05:00",
    "latenciaS": 20,
    "etaMinAlDespachar": 4.7
  },
  {
    "id": "HSK-0148",
    "casoId": "CAS-0085",
    "sedeCodigo": "110010568101",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Quirófano ocupado, tiempo estimado 90 minutos",
    "enviadoEn": "2026-08-23T01:44:09-05:00",
    "expiraEn": "2026-08-23T01:45:39-05:00",
    "respondidoEn": "2026-08-23T01:44:40-05:00",
    "latenciaS": 31,
    "etaMinAlDespachar": 4.9
  },
  {
    "id": "HSK-0149",
    "casoId": "CAS-0085",
    "sedeCodigo": "110010606501",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Urgencias en contingencia por sobreocupación",
    "enviadoEn": "2026-08-23T01:44:46-05:00",
    "expiraEn": "2026-08-23T01:46:16-05:00",
    "respondidoEn": "2026-08-23T01:45:54-05:00",
    "latenciaS": 68,
    "etaMinAlDespachar": 5.8
  },
  {
    "id": "HSK-0150",
    "casoId": "CAS-0086",
    "sedeCodigo": "110013029625",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T01:50:24-05:00",
    "expiraEn": "2026-08-23T01:51:54-05:00",
    "respondidoEn": "2026-08-23T01:51:31-05:00",
    "latenciaS": 67,
    "etaMinAlDespachar": 0.6
  },
  {
    "id": "HSK-0151",
    "casoId": "CAS-0087",
    "sedeCodigo": "110010566801",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T01:51:45-05:00",
    "expiraEn": "2026-08-23T01:53:15-05:00",
    "respondidoEn": "2026-08-23T01:52:15-05:00",
    "latenciaS": 30,
    "etaMinAlDespachar": 1.8
  },
  {
    "id": "HSK-0152",
    "casoId": "CAS-0088",
    "sedeCodigo": "110012156404",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin camas UCI adultos",
    "enviadoEn": "2026-08-23T01:57:07-05:00",
    "expiraEn": "2026-08-23T01:58:37-05:00",
    "respondidoEn": "2026-08-23T01:57:27-05:00",
    "latenciaS": 20,
    "etaMinAlDespachar": 3.3
  },
  {
    "id": "HSK-0153",
    "casoId": "CAS-0088",
    "sedeCodigo": "110013029114",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T01:57:38-05:00",
    "expiraEn": "2026-08-23T01:59:08-05:00",
    "respondidoEn": "2026-08-23T01:58:46-05:00",
    "latenciaS": 68,
    "etaMinAlDespachar": 3.5
  },
  {
    "id": "HSK-0154",
    "casoId": "CAS-0089",
    "sedeCodigo": "110012156404",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T02:28:30-05:00",
    "expiraEn": "2026-08-23T02:30:00-05:00",
    "respondidoEn": "2026-08-23T02:28:41-05:00",
    "latenciaS": 11,
    "etaMinAlDespachar": 2.1
  },
  {
    "id": "HSK-0155",
    "casoId": "CAS-0090",
    "sedeCodigo": "110010966601",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T02:38:19-05:00",
    "expiraEn": "2026-08-23T02:39:49-05:00",
    "respondidoEn": "2026-08-23T02:39:10-05:00",
    "latenciaS": 51,
    "etaMinAlDespachar": 3.1
  },
  {
    "id": "HSK-0156",
    "casoId": "CAS-0091",
    "sedeCodigo": "110012156401",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Quirófano ocupado, tiempo estimado 90 minutos",
    "enviadoEn": "2026-08-23T02:42:10-05:00",
    "expiraEn": "2026-08-23T02:43:40-05:00",
    "respondidoEn": "2026-08-23T02:42:28-05:00",
    "latenciaS": 18,
    "etaMinAlDespachar": 1.6
  },
  {
    "id": "HSK-0157",
    "casoId": "CAS-0091",
    "sedeCodigo": "110013029625",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Urgencias en contingencia por sobreocupación",
    "enviadoEn": "2026-08-23T02:42:35-05:00",
    "expiraEn": "2026-08-23T02:44:05-05:00",
    "respondidoEn": "2026-08-23T02:43:32-05:00",
    "latenciaS": 57,
    "etaMinAlDespachar": 2.6
  },
  {
    "id": "HSK-0158",
    "casoId": "CAS-0091",
    "sedeCodigo": "110013029603",
    "canal": "consola",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T02:43:36-05:00",
    "expiraEn": "2026-08-23T02:45:06-05:00",
    "respondidoEn": "2026-08-23T02:44:48-05:00",
    "latenciaS": 72,
    "etaMinAlDespachar": 8.6
  },
  {
    "id": "HSK-0159",
    "casoId": "CAS-0092",
    "sedeCodigo": "110013029402",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T02:48:04-05:00",
    "expiraEn": "2026-08-23T02:49:34-05:00",
    "respondidoEn": "2026-08-23T02:48:55-05:00",
    "latenciaS": 51,
    "etaMinAlDespachar": 3.1
  },
  {
    "id": "HSK-0160",
    "casoId": "CAS-0093",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin camas UCI adultos",
    "enviadoEn": "2026-08-23T02:52:42-05:00",
    "expiraEn": "2026-08-23T02:54:12-05:00",
    "respondidoEn": "2026-08-23T02:53:30-05:00",
    "latenciaS": 48,
    "etaMinAlDespachar": 2.1
  },
  {
    "id": "HSK-0161",
    "casoId": "CAS-0093",
    "sedeCodigo": "110010817103",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Hemodinamia en procedimiento",
    "enviadoEn": "2026-08-23T02:53:37-05:00",
    "expiraEn": "2026-08-23T02:55:07-05:00",
    "respondidoEn": "2026-08-23T02:54:08-05:00",
    "latenciaS": 31,
    "etaMinAlDespachar": 13.0
  },
  {
    "id": "HSK-0162",
    "casoId": "CAS-0093",
    "sedeCodigo": "110013029601",
    "canal": "telegram",
    "estado": "timeout",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T02:54:13-05:00",
    "expiraEn": "2026-08-23T02:55:43-05:00",
    "respondidoEn": null,
    "latenciaS": null,
    "etaMinAlDespachar": 17.9
  },
  {
    "id": "HSK-0163",
    "casoId": "CAS-0093",
    "sedeCodigo": "110012215001",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Sala de reanimación ocupada",
    "enviadoEn": "2026-08-23T02:55:51-05:00",
    "expiraEn": "2026-08-23T02:57:21-05:00",
    "respondidoEn": "2026-08-23T02:57:04-05:00",
    "latenciaS": 73,
    "etaMinAlDespachar": 18.8
  },
  {
    "id": "HSK-0164",
    "casoId": "CAS-0094",
    "sedeCodigo": "110012156404",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T02:55:29-05:00",
    "expiraEn": "2026-08-23T02:56:59-05:00",
    "respondidoEn": "2026-08-23T02:55:52-05:00",
    "latenciaS": 23,
    "etaMinAlDespachar": 1.3
  },
  {
    "id": "HSK-0165",
    "casoId": "CAS-0095",
    "sedeCodigo": "110013029103",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T03:07:37-05:00",
    "expiraEn": "2026-08-23T03:09:07-05:00",
    "respondidoEn": "2026-08-23T03:08:22-05:00",
    "latenciaS": 45,
    "etaMinAlDespachar": 3.9
  },
  {
    "id": "HSK-0166",
    "casoId": "CAS-0096",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin cupo en observación pediátrica",
    "enviadoEn": "2026-08-23T03:15:30-05:00",
    "expiraEn": "2026-08-23T03:17:00-05:00",
    "respondidoEn": "2026-08-23T03:15:51-05:00",
    "latenciaS": 21,
    "etaMinAlDespachar": 1.8
  },
  {
    "id": "HSK-0167",
    "casoId": "CAS-0096",
    "sedeCodigo": "110013029601",
    "canal": "consola",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T03:15:57-05:00",
    "expiraEn": "2026-08-23T03:17:27-05:00",
    "respondidoEn": "2026-08-23T03:16:22-05:00",
    "latenciaS": 25,
    "etaMinAlDespachar": 15.2
  },
  {
    "id": "HSK-0168",
    "casoId": "CAS-0097",
    "sedeCodigo": "110010918668",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T03:32:20-05:00",
    "expiraEn": "2026-08-23T03:33:50-05:00",
    "respondidoEn": "2026-08-23T03:32:32-05:00",
    "latenciaS": 12,
    "etaMinAlDespachar": 1.7
  },
  {
    "id": "HSK-0169",
    "casoId": "CAS-0098",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T03:38:02-05:00",
    "expiraEn": "2026-08-23T03:39:32-05:00",
    "respondidoEn": "2026-08-23T03:38:37-05:00",
    "latenciaS": 35,
    "etaMinAlDespachar": 1.4
  },
  {
    "id": "HSK-0170",
    "casoId": "CAS-0099",
    "sedeCodigo": "110010867901",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin especialista de turno",
    "enviadoEn": "2026-08-23T03:44:58-05:00",
    "expiraEn": "2026-08-23T03:46:28-05:00",
    "respondidoEn": "2026-08-23T03:45:19-05:00",
    "latenciaS": 21,
    "etaMinAlDespachar": 4.4
  },
  {
    "id": "HSK-0171",
    "casoId": "CAS-0099",
    "sedeCodigo": "110011864201",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T03:45:30-05:00",
    "expiraEn": "2026-08-23T03:47:00-05:00",
    "respondidoEn": "2026-08-23T03:46:16-05:00",
    "latenciaS": 46,
    "etaMinAlDespachar": 5.3
  },
  {
    "id": "HSK-0172",
    "casoId": "CAS-0100",
    "sedeCodigo": "110011613301",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T03:53:15-05:00",
    "expiraEn": "2026-08-23T03:54:45-05:00",
    "respondidoEn": "2026-08-23T03:54:22-05:00",
    "latenciaS": 67,
    "etaMinAlDespachar": 2.0
  },
  {
    "id": "HSK-0173",
    "casoId": "CAS-0101",
    "sedeCodigo": "110012507001",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Urgencias en contingencia por sobreocupación",
    "enviadoEn": "2026-08-23T04:04:05-05:00",
    "expiraEn": "2026-08-23T04:05:35-05:00",
    "respondidoEn": "2026-08-23T04:04:17-05:00",
    "latenciaS": 12,
    "etaMinAlDespachar": 7.6
  },
  {
    "id": "HSK-0174",
    "casoId": "CAS-0101",
    "sedeCodigo": "110010644701",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Sin cupo en observación pediátrica",
    "enviadoEn": "2026-08-23T04:04:27-05:00",
    "expiraEn": "2026-08-23T04:05:57-05:00",
    "respondidoEn": "2026-08-23T04:04:47-05:00",
    "latenciaS": 20,
    "etaMinAlDespachar": 13.8
  },
  {
    "id": "HSK-0175",
    "casoId": "CAS-0101",
    "sedeCodigo": "110010918668",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Tomógrafo fuera de servicio",
    "enviadoEn": "2026-08-23T04:04:57-05:00",
    "expiraEn": "2026-08-23T04:06:27-05:00",
    "respondidoEn": "2026-08-23T04:05:28-05:00",
    "latenciaS": 31,
    "etaMinAlDespachar": 14.8
  },
  {
    "id": "HSK-0176",
    "casoId": "CAS-0102",
    "sedeCodigo": "110013029114",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin camas UCI adultos",
    "enviadoEn": "2026-08-23T04:08:31-05:00",
    "expiraEn": "2026-08-23T04:10:01-05:00",
    "respondidoEn": "2026-08-23T04:08:45-05:00",
    "latenciaS": 14,
    "etaMinAlDespachar": 2.0
  },
  {
    "id": "HSK-0177",
    "casoId": "CAS-0102",
    "sedeCodigo": "110010910401",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T04:08:52-05:00",
    "expiraEn": "2026-08-23T04:10:22-05:00",
    "respondidoEn": "2026-08-23T04:10:03-05:00",
    "latenciaS": 71,
    "etaMinAlDespachar": 3.9
  },
  {
    "id": "HSK-0178",
    "casoId": "CAS-0103",
    "sedeCodigo": "110013029114",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T04:09:09-05:00",
    "expiraEn": "2026-08-23T04:10:39-05:00",
    "respondidoEn": "2026-08-23T04:09:23-05:00",
    "latenciaS": 14,
    "etaMinAlDespachar": 1.7
  },
  {
    "id": "HSK-0179",
    "casoId": "CAS-0104",
    "sedeCodigo": "110013029402",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sala de reanimación ocupada",
    "enviadoEn": "2026-08-23T04:12:37-05:00",
    "expiraEn": "2026-08-23T04:14:07-05:00",
    "respondidoEn": "2026-08-23T04:13:23-05:00",
    "latenciaS": 46,
    "etaMinAlDespachar": 4.0
  },
  {
    "id": "HSK-0180",
    "casoId": "CAS-0104",
    "sedeCodigo": "110013029401",
    "canal": "whatsapp",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T04:13:27-05:00",
    "expiraEn": "2026-08-23T04:14:57-05:00",
    "respondidoEn": "2026-08-23T04:13:47-05:00",
    "latenciaS": 20,
    "etaMinAlDespachar": 8.0
  },
  {
    "id": "HSK-0181",
    "casoId": "CAS-0105",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T04:22:15-05:00",
    "expiraEn": "2026-08-23T04:23:45-05:00",
    "respondidoEn": "2026-08-23T04:23:21-05:00",
    "latenciaS": 66,
    "etaMinAlDespachar": 1.9
  },
  {
    "id": "HSK-0182",
    "casoId": "CAS-0106",
    "sedeCodigo": "110013029402",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T04:57:20-05:00",
    "expiraEn": "2026-08-23T04:58:50-05:00",
    "respondidoEn": "2026-08-23T04:57:40-05:00",
    "latenciaS": 20,
    "etaMinAlDespachar": 3.7
  },
  {
    "id": "HSK-0183",
    "casoId": "CAS-0107",
    "sedeCodigo": "110013029103",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Tomógrafo fuera de servicio",
    "enviadoEn": "2026-08-23T05:04:51-05:00",
    "expiraEn": "2026-08-23T05:06:21-05:00",
    "respondidoEn": "2026-08-23T05:05:24-05:00",
    "latenciaS": 33,
    "etaMinAlDespachar": 5.2
  },
  {
    "id": "HSK-0184",
    "casoId": "CAS-0107",
    "sedeCodigo": "110010918668",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T05:05:34-05:00",
    "expiraEn": "2026-08-23T05:07:04-05:00",
    "respondidoEn": "2026-08-23T05:06:28-05:00",
    "latenciaS": 54,
    "etaMinAlDespachar": 5.5
  },
  {
    "id": "HSK-0185",
    "casoId": "CAS-0108",
    "sedeCodigo": "110010959901",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T05:21:17-05:00",
    "expiraEn": "2026-08-23T05:22:47-05:00",
    "respondidoEn": "2026-08-23T05:22:04-05:00",
    "latenciaS": 47,
    "etaMinAlDespachar": 2.2
  },
  {
    "id": "HSK-0186",
    "casoId": "CAS-0109",
    "sedeCodigo": "110013029401",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T05:22:15-05:00",
    "expiraEn": "2026-08-23T05:23:45-05:00",
    "respondidoEn": "2026-08-23T05:23:31-05:00",
    "latenciaS": 76,
    "etaMinAlDespachar": 8.2
  },
  {
    "id": "HSK-0187",
    "casoId": "CAS-0110",
    "sedeCodigo": "110013029654",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sala de reanimación ocupada",
    "enviadoEn": "2026-08-23T05:35:12-05:00",
    "expiraEn": "2026-08-23T05:36:42-05:00",
    "respondidoEn": "2026-08-23T05:36:18-05:00",
    "latenciaS": 66,
    "etaMinAlDespachar": 1.1
  },
  {
    "id": "HSK-0188",
    "casoId": "CAS-0110",
    "sedeCodigo": "110010817103",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Quirófano ocupado, tiempo estimado 90 minutos",
    "enviadoEn": "2026-08-23T05:36:26-05:00",
    "expiraEn": "2026-08-23T05:37:56-05:00",
    "respondidoEn": "2026-08-23T05:36:42-05:00",
    "latenciaS": 16,
    "etaMinAlDespachar": 12.5
  },
  {
    "id": "HSK-0189",
    "casoId": "CAS-0110",
    "sedeCodigo": "110013029601",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T05:36:53-05:00",
    "expiraEn": "2026-08-23T05:38:23-05:00",
    "respondidoEn": "2026-08-23T05:37:24-05:00",
    "latenciaS": 31,
    "etaMinAlDespachar": 17.3
  },
  {
    "id": "HSK-0190",
    "casoId": "CAS-0111",
    "sedeCodigo": "110013029103",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T05:50:40-05:00",
    "expiraEn": "2026-08-23T05:52:10-05:00",
    "respondidoEn": "2026-08-23T05:51:15-05:00",
    "latenciaS": 35,
    "etaMinAlDespachar": 2.9
  },
  {
    "id": "HSK-0191",
    "casoId": "CAS-0112",
    "sedeCodigo": "110010895201",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Tomógrafo fuera de servicio",
    "enviadoEn": "2026-08-23T06:05:39-05:00",
    "expiraEn": "2026-08-23T06:07:09-05:00",
    "respondidoEn": "2026-08-23T06:06:23-05:00",
    "latenciaS": 44,
    "etaMinAlDespachar": 2.7
  },
  {
    "id": "HSK-0192",
    "casoId": "CAS-0112",
    "sedeCodigo": "110010752101",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Sin camas UCI adultos",
    "enviadoEn": "2026-08-23T06:06:30-05:00",
    "expiraEn": "2026-08-23T06:08:00-05:00",
    "respondidoEn": "2026-08-23T06:07:23-05:00",
    "latenciaS": 53,
    "etaMinAlDespachar": 3.6
  },
  {
    "id": "HSK-0193",
    "casoId": "CAS-0112",
    "sedeCodigo": "110010936101",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Hemodinamia en procedimiento",
    "enviadoEn": "2026-08-23T06:07:34-05:00",
    "expiraEn": "2026-08-23T06:09:04-05:00",
    "respondidoEn": "2026-08-23T06:08:51-05:00",
    "latenciaS": 77,
    "etaMinAlDespachar": 4.8
  },
  {
    "id": "HSK-0194",
    "casoId": "CAS-0113",
    "sedeCodigo": "110010966601",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T06:06:29-05:00",
    "expiraEn": "2026-08-23T06:07:59-05:00",
    "respondidoEn": "2026-08-23T06:06:50-05:00",
    "latenciaS": 21,
    "etaMinAlDespachar": 2.3
  },
  {
    "id": "HSK-0195",
    "casoId": "CAS-0114",
    "sedeCodigo": "110012156404",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T06:07:27-05:00",
    "expiraEn": "2026-08-23T06:08:57-05:00",
    "respondidoEn": "2026-08-23T06:07:46-05:00",
    "latenciaS": 19,
    "etaMinAlDespachar": 2.9
  },
  {
    "id": "HSK-0196",
    "casoId": "CAS-0115",
    "sedeCodigo": "110013627801",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Quirófano ocupado, tiempo estimado 90 minutos",
    "enviadoEn": "2026-08-23T06:31:41-05:00",
    "expiraEn": "2026-08-23T06:33:11-05:00",
    "respondidoEn": "2026-08-23T06:32:50-05:00",
    "latenciaS": 69,
    "etaMinAlDespachar": 2.7
  },
  {
    "id": "HSK-0197",
    "casoId": "CAS-0115",
    "sedeCodigo": "110011613301",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T06:33:00-05:00",
    "expiraEn": "2026-08-23T06:34:30-05:00",
    "respondidoEn": "2026-08-23T06:33:50-05:00",
    "latenciaS": 50,
    "etaMinAlDespachar": 3.1
  },
  {
    "id": "HSK-0198",
    "casoId": "CAS-0116",
    "sedeCodigo": "110012156404",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T06:38:23-05:00",
    "expiraEn": "2026-08-23T06:39:53-05:00",
    "respondidoEn": "2026-08-23T06:38:36-05:00",
    "latenciaS": 13,
    "etaMinAlDespachar": 1.0
  },
  {
    "id": "HSK-0199",
    "casoId": "CAS-0117",
    "sedeCodigo": "110010918668",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T06:42:08-05:00",
    "expiraEn": "2026-08-23T06:43:38-05:00",
    "respondidoEn": "2026-08-23T06:42:57-05:00",
    "latenciaS": 49,
    "etaMinAlDespachar": 1.9
  },
  {
    "id": "HSK-0200",
    "casoId": "CAS-0118",
    "sedeCodigo": "110010566801",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sin camas UCI adultos",
    "enviadoEn": "2026-08-23T06:42:46-05:00",
    "expiraEn": "2026-08-23T06:44:16-05:00",
    "respondidoEn": "2026-08-23T06:43:05-05:00",
    "latenciaS": 19,
    "etaMinAlDespachar": 2.2
  },
  {
    "id": "HSK-0201",
    "casoId": "CAS-0118",
    "sedeCodigo": "110013028901",
    "canal": "consola",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T06:43:09-05:00",
    "expiraEn": "2026-08-23T06:44:39-05:00",
    "respondidoEn": "2026-08-23T06:43:40-05:00",
    "latenciaS": 31,
    "etaMinAlDespachar": 2.6
  },
  {
    "id": "HSK-0202",
    "casoId": "CAS-0119",
    "sedeCodigo": "110012215001",
    "canal": "telegram",
    "estado": "aceptado",
    "motivoRechazo": null,
    "enviadoEn": "2026-08-23T06:45:14-05:00",
    "expiraEn": "2026-08-23T06:46:44-05:00",
    "respondidoEn": "2026-08-23T06:45:26-05:00",
    "latenciaS": 12,
    "etaMinAlDespachar": 0.6
  },
  {
    "id": "HSK-0203",
    "casoId": "CAS-0120",
    "sedeCodigo": "110013028929",
    "canal": "telegram",
    "estado": "rechazado",
    "motivoRechazo": "Sala de reanimación ocupada",
    "enviadoEn": "2026-08-23T06:50:17-05:00",
    "expiraEn": "2026-08-23T06:51:47-05:00",
    "respondidoEn": "2026-08-23T06:51:02-05:00",
    "latenciaS": 45,
    "etaMinAlDespachar": 20.9
  },
  {
    "id": "HSK-0204",
    "casoId": "CAS-0120",
    "sedeCodigo": "110013029402",
    "canal": "consola",
    "estado": "rechazado",
    "motivoRechazo": "Quirófano ocupado, tiempo estimado 90 minutos",
    "enviadoEn": "2026-08-23T06:51:10-05:00",
    "expiraEn": "2026-08-23T06:52:40-05:00",
    "respondidoEn": "2026-08-23T06:51:27-05:00",
    "latenciaS": 17,
    "etaMinAlDespachar": 22.2
  },
  {
    "id": "HSK-0205",
    "casoId": "CAS-0120",
    "sedeCodigo": "110013028902",
    "canal": "whatsapp",
    "estado": "rechazado",
    "motivoRechazo": "Urgencias en contingencia por sobreocupación",
    "enviadoEn": "2026-08-23T06:51:39-05:00",
    "expiraEn": "2026-08-23T06:53:09-05:00",
    "respondidoEn": "2026-08-23T06:52:12-05:00",
    "latenciaS": 33,
    "etaMinAlDespachar": 26.9
  }
];

/** 14 casos que el ruteo automatico no cerro. */
export const ESCALAMIENTOS_DEMO: Escalamiento[] = [
  {
    "id": "ESC-001",
    "casoId": "CAS-0001",
    "motivo": "candidatos-agotados",
    "sedesIntentadas": [
      "110013028929",
      "110013029402",
      "110013028902",
      "110010566801"
    ],
    "detalle": "4 sedes rechazaron o dejaron vencer la solicitud",
    "creadoEn": "2026-08-22T19:07:17-05:00",
    "atendidoEn": "2026-08-22T19:08:42-05:00",
    "atendidoPor": "regulador_crue:Marcela Tibaquirá"
  },
  {
    "id": "ESC-002",
    "casoId": "CAS-0012",
    "motivo": "candidatos-agotados",
    "sedesIntentadas": [
      "110013390301",
      "110010918608",
      "110010911101",
      "110010561801"
    ],
    "detalle": "4 sedes rechazaron o dejaron vencer la solicitud",
    "creadoEn": "2026-08-22T19:44:14-05:00",
    "atendidoEn": "2026-08-22T19:49:17-05:00",
    "atendidoPor": "regulador_crue:Néstor Cifuentes"
  },
  {
    "id": "ESC-003",
    "casoId": "CAS-0020",
    "motivo": "candidatos-agotados",
    "sedesIntentadas": [
      "110010966601",
      "110010918630",
      "110010918668",
      "110013029601"
    ],
    "detalle": "4 sedes rechazaron o dejaron vencer la solicitud",
    "creadoEn": "2026-08-22T20:20:40-05:00",
    "atendidoEn": null,
    "atendidoPor": null
  },
  {
    "id": "ESC-004",
    "casoId": "CAS-0039",
    "motivo": "candidatos-agotados",
    "sedesIntentadas": [
      "110010568101",
      "110010867901",
      "110010606501"
    ],
    "detalle": "3 sedes rechazaron o dejaron vencer la solicitud",
    "creadoEn": "2026-08-22T21:31:56-05:00",
    "atendidoEn": "2026-08-22T21:37:39-05:00",
    "atendidoPor": "regulador_crue:Prudencio Rincón"
  },
  {
    "id": "ESC-005",
    "casoId": "CAS-0047",
    "motivo": "candidatos-agotados",
    "sedesIntentadas": [
      "110010918668",
      "110010644701",
      "110011613301"
    ],
    "detalle": "3 sedes rechazaron o dejaron vencer la solicitud",
    "creadoEn": "2026-08-22T22:19:36-05:00",
    "atendidoEn": "2026-08-22T22:24:17-05:00",
    "atendidoPor": "regulador_crue:Quintina Aristizábal"
  },
  {
    "id": "ESC-006",
    "casoId": "CAS-0058",
    "motivo": "candidatos-agotados",
    "sedesIntentadas": [
      "110012215001",
      "110013029601",
      "110010966601"
    ],
    "detalle": "3 sedes rechazaron o dejaron vencer la solicitud",
    "creadoEn": "2026-08-22T23:07:30-05:00",
    "atendidoEn": null,
    "atendidoPor": null
  },
  {
    "id": "ESC-007",
    "casoId": "CAS-0066",
    "motivo": "candidatos-agotados",
    "sedesIntentadas": [
      "110010966601",
      "110012215001",
      "110013029601",
      "110013029603"
    ],
    "detalle": "4 sedes rechazaron o dejaron vencer la solicitud",
    "creadoEn": "2026-08-22T23:47:52-05:00",
    "atendidoEn": "2026-08-22T23:53:03-05:00",
    "atendidoPor": "regulador_crue:Saúl Peñaloza"
  },
  {
    "id": "ESC-008",
    "casoId": "CAS-0074",
    "motivo": "candidatos-agotados",
    "sedesIntentadas": [
      "110010918668",
      "110013029103",
      "110010644701",
      "110012156404"
    ],
    "detalle": "4 sedes rechazaron o dejaron vencer la solicitud",
    "creadoEn": "2026-08-23T00:34:00-05:00",
    "atendidoEn": "2026-08-23T00:37:39-05:00",
    "atendidoPor": "regulador_crue:Teodora Yepes"
  },
  {
    "id": "ESC-009",
    "casoId": "CAS-0085",
    "motivo": "candidatos-agotados",
    "sedesIntentadas": [
      "110010867901",
      "110011864201",
      "110010568101",
      "110010606501"
    ],
    "detalle": "4 sedes rechazaron o dejaron vencer la solicitud",
    "creadoEn": "2026-08-23T01:46:01-05:00",
    "atendidoEn": null,
    "atendidoPor": null
  },
  {
    "id": "ESC-010",
    "casoId": "CAS-0093",
    "motivo": "candidatos-agotados",
    "sedesIntentadas": [
      "110013029654",
      "110010817103",
      "110013029601",
      "110012215001"
    ],
    "detalle": "4 sedes rechazaron o dejaron vencer la solicitud",
    "creadoEn": "2026-08-23T02:57:14-05:00",
    "atendidoEn": "2026-08-23T02:59:46-05:00",
    "atendidoPor": "regulador_crue:Vilma Nempeque"
  },
  {
    "id": "ESC-011",
    "casoId": "CAS-0094",
    "motivo": "solicitud-paramedico",
    "sedesIntentadas": [
      "110012156404"
    ],
    "detalle": "La tripulación pidió regulación del CRUE desde /campo",
    "creadoEn": "2026-08-23T02:56:01-05:00",
    "atendidoEn": "2026-08-23T03:01:48-05:00",
    "atendidoPor": "regulador_crue:Wilmar Umaña"
  },
  {
    "id": "ESC-012",
    "casoId": "CAS-0101",
    "motivo": "candidatos-agotados",
    "sedesIntentadas": [
      "110012507001",
      "110010644701",
      "110010918668"
    ],
    "detalle": "3 sedes rechazaron o dejaron vencer la solicitud",
    "creadoEn": "2026-08-23T04:05:32-05:00",
    "atendidoEn": null,
    "atendidoPor": null
  },
  {
    "id": "ESC-013",
    "casoId": "CAS-0112",
    "motivo": "candidatos-agotados",
    "sedesIntentadas": [
      "110010895201",
      "110010752101",
      "110010936101"
    ],
    "detalle": "3 sedes rechazaron o dejaron vencer la solicitud",
    "creadoEn": "2026-08-23T06:08:58-05:00",
    "atendidoEn": "2026-08-23T06:12:19-05:00",
    "atendidoPor": "regulador_crue:Yolanda Lozano"
  },
  {
    "id": "ESC-014",
    "casoId": "CAS-0120",
    "motivo": "candidatos-agotados",
    "sedesIntentadas": [
      "110013028929",
      "110013029402",
      "110013028902"
    ],
    "detalle": "3 sedes rechazaron o dejaron vencer la solicitud",
    "creadoEn": "2026-08-23T06:52:20-05:00",
    "atendidoEn": "2026-08-23T06:55:18-05:00",
    "atendidoPor": "regulador_crue:Zacarías Sarmiento"
  }
];
