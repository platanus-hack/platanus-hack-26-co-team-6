/**
 * ARCHIVO GENERADO — no editar a mano.
 *
 * Lo produce `python scripts/datos/construir.py` a partir de data/.
 * Cualquier cambio aqui se pierde en la siguiente corrida. Si necesitas
 * cambiar el contenido, cambia la fuente o su transformador.
 *
 * Generado: 2026-08-22
 * Fuente:   osb_ofertasrv-ips-urgencias.csv + reps_bogota/{sedes,capacidad,ocupacion}.json + osb_ocupacion-urgencias.csv
 */

import type { Sede } from '../contracts/types';

/** 84 sedes de urgencias de Bogota. Ver data/CATALOGO.md. */
export const SEDES_CATALOGO: Sede[] = [
  {
    "codigo": "110010532201",
    "nombre": "Clínica La Inmaculada",
    "direccion": "KR 7 68 70",
    "localidad": "Chapinero",
    "coord": {
      "lat": 4.651621,
      "lng": -74.0571
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "5870366",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Salud Mental Adulto",
        "total": 108,
        "ocupadasSnapshot": 119
      },
      {
        "tipo": "CAMAS-Salud Mental Pediátrico",
        "total": 19,
        "ocupadasSnapshot": 21
      }
    ]
  },
  {
    "codigo": "110010559704",
    "nombre": "Centro de Atención En Salud Cafam Floresta",
    "direccion": "AK 68 90 88",
    "localidad": "Barrios Unidos",
    "coord": {
      "lat": 4.686709,
      "lng": -74.074995
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "5550700 ext 12017-12015",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 27
      }
    ]
  },
  {
    "codigo": "110010559711",
    "nombre": "Centro de Atención En Salud Cafam Suba",
    "direccion": "KR 113 C 142 A 98",
    "localidad": "Suba",
    "coord": {
      "lat": 4.748005,
      "lng": -74.103297
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "5550700 ext 12017-12015",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 27
      }
    ]
  },
  {
    "codigo": "110010561801",
    "nombre": "Fundación Santa Fe de Bogotá",
    "direccion": "CL 119 7 75",
    "localidad": "Usaquén",
    "coord": {
      "lat": 4.696177,
      "lng": -74.032935
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "6030303 ext. 5105",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 40,
        "ocupadasSnapshot": 40
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 37,
        "ocupadasSnapshot": 34
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 7,
        "ocupadasSnapshot": 7
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 4,
        "ocupadasSnapshot": 4
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 204,
        "ocupadasSnapshot": 198
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 5,
        "ocupadasSnapshot": 5
      }
    ]
  },
  {
    "codigo": "110010566801",
    "nombre": "Hospital Universitario Clínica San Rafael",
    "direccion": "KR 8 17 45 SUR",
    "localidad": "San Cristóbal",
    "coord": {
      "lat": 4.576605,
      "lng": -74.091086
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "7464714 EXT. 2740",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 214,
        "ocupadasSnapshot": 206
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 8,
        "ocupadasSnapshot": 8
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 10,
        "ocupadasSnapshot": 10
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 2,
        "ocupadasSnapshot": 2
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 29,
        "ocupadasSnapshot": 28
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 40,
        "ocupadasSnapshot": 40
      }
    ]
  },
  {
    "codigo": "110010568101",
    "nombre": "Fundación Hospital de La Misericordia",
    "direccion": "AK 14 1 65",
    "localidad": "Los Mártires",
    "coord": {
      "lat": 4.59342,
      "lng": -74.087806
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "3811970 EXT 227",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 41,
        "ocupadasSnapshot": 40
      },
      {
        "tipo": "CAMAS-Intermedia Pediátrica",
        "total": 16,
        "ocupadasSnapshot": 16
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 334,
        "ocupadasSnapshot": 333
      }
    ]
  },
  {
    "codigo": "110010572501",
    "nombre": "Clínica de Nuestra Señora de La Paz",
    "direccion": "KR 69 12 75",
    "localidad": "Kennedy",
    "coord": {
      "lat": 4.638212,
      "lng": -74.125247
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "2921277",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 10,
        "ocupadasSnapshot": 0
      }
    ]
  },
  {
    "codigo": "110010606501",
    "nombre": "Instituto Nacional de Cancerología",
    "direccion": "Cl 1 9 85",
    "localidad": "San Cristóbal",
    "coord": {
      "lat": 4.588776,
      "lng": -74.084276
    },
    "naturaleza": "Pública",
    "complejidad": "media",
    "telefono": "0913905012 Ext. 2000 - 2001",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 155,
        "ocupadasSnapshot": 142
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 25,
        "ocupadasSnapshot": 24
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 17,
        "ocupadasSnapshot": 15
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 4,
        "ocupadasSnapshot": 0
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 6,
        "ocupadasSnapshot": 5
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 2,
        "ocupadasSnapshot": 0
      }
    ]
  },
  {
    "codigo": "110010644701",
    "nombre": "Fundación Abood Shaio",
    "direccion": "DG 115 A 70 C 75",
    "localidad": "Suba",
    "coord": {
      "lat": 4.698348,
      "lng": -74.073308
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "2261025",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 70,
        "ocupadasSnapshot": 41
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 13,
        "ocupadasSnapshot": 8
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 1,
        "ocupadasSnapshot": 1
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 165,
        "ocupadasSnapshot": 138
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 7,
        "ocupadasSnapshot": 7
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 1,
        "ocupadasSnapshot": 1
      }
    ]
  },
  {
    "codigo": "110010645301",
    "nombre": "Cruz Roja Colombiana Seccional Cundinamarca Y Bogotá",
    "direccion": "AK 68 68 B 31",
    "localidad": "Engativá",
    "coord": {
      "lat": 4.672834,
      "lng": -74.088964
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "7460909",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 27
      }
    ]
  },
  {
    "codigo": "110010645318",
    "nombre": "Cruz Roja Colombiana Seccional Cundinamarca Y Bogotá Sede Norte",
    "direccion": "AC 134 7 B 41",
    "localidad": "Usaquén",
    "coord": {
      "lat": 4.711937,
      "lng": -74.030965
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "7460909",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 27
      }
    ]
  },
  {
    "codigo": "110010645319",
    "nombre": "Cruz Roja Colombiana Seccional Cundinamarca Y Bogotá Sede Alquería",
    "direccion": "AK 68 31 41 SUR",
    "localidad": "Kennedy",
    "coord": {
      "lat": 4.606864,
      "lng": -74.130692
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "7460909",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 47
      }
    ]
  },
  {
    "codigo": "110010752101",
    "nombre": "Clínica Nueva",
    "direccion": "CL 45 F 16 A 11",
    "localidad": "Teusaquillo",
    "coord": {
      "lat": 4.634348,
      "lng": -74.070661
    },
    "naturaleza": "Privada",
    "complejidad": "media",
    "telefono": "3274444 ext 515-530",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 13,
        "ocupadasSnapshot": 9
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 66,
        "ocupadasSnapshot": 61
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 15,
        "ocupadasSnapshot": 10
      }
    ]
  },
  {
    "codigo": "110010778209",
    "nombre": "Salud Sura Calle 100 Bogotá",
    "direccion": "Cl. 100 19 A 35",
    "localidad": "Chapinero",
    "coord": {
      "lat": 4.685845,
      "lng": -74.0533
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "(1) 487 38 88 / 3164625445",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 27
      }
    ]
  },
  {
    "codigo": "110010793901",
    "nombre": "Clínica de La Mujer",
    "direccion": "KR 19 C 91 17",
    "localidad": "Chapinero",
    "coord": {
      "lat": 4.677631,
      "lng": -74.05717
    },
    "naturaleza": "Privada",
    "complejidad": "media",
    "telefono": "6161799- 3506005706",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 10,
        "ocupadasSnapshot": 6
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 46,
        "ocupadasSnapshot": 34
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 4,
        "ocupadasSnapshot": 2
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 3,
        "ocupadasSnapshot": 0
      }
    ]
  },
  {
    "codigo": "110010817102",
    "nombre": "Clínica Infantil Colsubsidio",
    "direccion": "CL 66 10 48",
    "localidad": "Chapinero",
    "coord": {
      "lat": 4.651803,
      "lng": -74.061287
    },
    "naturaleza": "Privada",
    "complejidad": "media",
    "telefono": "7467310 extensión 75210",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 6,
        "ocupadasSnapshot": 6
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 152,
        "ocupadasSnapshot": 120
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 7,
        "ocupadasSnapshot": 7
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 13,
        "ocupadasSnapshot": 13
      }
    ]
  },
  {
    "codigo": "110010817103",
    "nombre": "Clínica Colsubsidio Ciudad Roma",
    "direccion": "CL 53 SUR 79 D 71",
    "localidad": "Kennedy",
    "coord": {
      "lat": 4.615233,
      "lng": -74.172392
    },
    "naturaleza": "Privada",
    "complejidad": "media",
    "telefono": "7420100 Ext. 74439",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 3,
        "ocupadasSnapshot": 3
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 101,
        "ocupadasSnapshot": 101
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 20,
        "ocupadasSnapshot": 11
      }
    ]
  },
  {
    "codigo": "110010817136",
    "nombre": "Centro Medico Colsubsidio Quiroga",
    "direccion": "CL 38 SUR 18 30",
    "localidad": "Rafael Uribe Uribe",
    "coord": {
      "lat": 4.576373,
      "lng": -74.118805
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "7607461 Ext. 101",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 19
      }
    ]
  },
  {
    "codigo": "110010843701",
    "nombre": "Clínica de Ortopedia Y Accidentes Laborales",
    "direccion": "CL 6 A 70 06",
    "localidad": "Kennedy",
    "coord": {
      "lat": 4.63034,
      "lng": -74.1309
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": null,
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 11,
        "ocupadasSnapshot": 5
      }
    ]
  },
  {
    "codigo": "110010867901",
    "nombre": "Sociedad de Cirugía de Bogotá - Hospital de San José",
    "direccion": "CL 10 18 75",
    "localidad": "Los Mártires",
    "coord": {
      "lat": 4.603998,
      "lng": -74.08589
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "3538000 ext 523 o 509",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 2,
        "ocupadasSnapshot": 1
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 19,
        "ocupadasSnapshot": 15
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 152,
        "ocupadasSnapshot": 148
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 6,
        "ocupadasSnapshot": 2
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 19,
        "ocupadasSnapshot": 19
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 16,
        "ocupadasSnapshot": 12
      }
    ]
  },
  {
    "codigo": "110010895201",
    "nombre": "Clínica Palermo",
    "direccion": "CL 45 C 22 02",
    "localidad": "Teusaquillo",
    "coord": {
      "lat": 4.635641,
      "lng": -74.073663
    },
    "naturaleza": "Privada",
    "complejidad": "media",
    "telefono": "7454500",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 24,
        "ocupadasSnapshot": 15
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 1,
        "ocupadasSnapshot": 0
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 173,
        "ocupadasSnapshot": 172
      }
    ]
  },
  {
    "codigo": "110010910401",
    "nombre": "Clínica Juan N Corpas Ltda",
    "direccion": "KR 111 159 A 61",
    "localidad": "Suba",
    "coord": {
      "lat": 4.760767,
      "lng": -74.092598
    },
    "naturaleza": "Privada",
    "complejidad": "media",
    "telefono": "6865000 Ext.1060 - 3233103491",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 2,
        "ocupadasSnapshot": 2
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 120,
        "ocupadasSnapshot": 72
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 13,
        "ocupadasSnapshot": 10
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 8,
        "ocupadasSnapshot": 8
      }
    ]
  },
  {
    "codigo": "110010911101",
    "nombre": "Fundación Cardio Infantil Instituto de Cardiología",
    "direccion": "CL 163 A 13 B 60",
    "localidad": "Usaquén",
    "coord": {
      "lat": 4.741267,
      "lng": -74.034405
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "6672727 Ext. 53304 Cel. 3183569506",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 28,
        "ocupadasSnapshot": 20
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 158,
        "ocupadasSnapshot": 146
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 1,
        "ocupadasSnapshot": 0
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 1,
        "ocupadasSnapshot": 0
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 66,
        "ocupadasSnapshot": 60
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 67,
        "ocupadasSnapshot": 64
      }
    ]
  },
  {
    "codigo": "110010917802",
    "nombre": "Centro Policlinico Del Olaya",
    "direccion": "KR 20 23 23 SUR",
    "localidad": "Rafael Uribe Uribe",
    "coord": {
      "lat": 4.583047,
      "lng": -74.105718
    },
    "naturaleza": "Privada",
    "complejidad": "media",
    "telefono": "3612888",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 162,
        "ocupadasSnapshot": 160
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 15,
        "ocupadasSnapshot": 15
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 10,
        "ocupadasSnapshot": 9
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 20,
        "ocupadasSnapshot": 20
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 5,
        "ocupadasSnapshot": 3
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 3,
        "ocupadasSnapshot": 3
      }
    ]
  },
  {
    "codigo": "110010918608",
    "nombre": "Clínica Reina Sofia",
    "direccion": "KR 21 127 03",
    "localidad": "Usaquén",
    "coord": {
      "lat": 4.706787,
      "lng": -74.05161
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "6466060 ext 5717528",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 9,
        "ocupadasSnapshot": 9
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 112,
        "ocupadasSnapshot": 108
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 5,
        "ocupadasSnapshot": 5
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 8,
        "ocupadasSnapshot": 8
      }
    ]
  },
  {
    "codigo": "110010918630",
    "nombre": "Clínica Universitaria Colombia",
    "direccion": "Cl 23 66 46",
    "localidad": "Teusaquillo",
    "coord": {
      "lat": 4.647611,
      "lng": -74.106988
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "5948650",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 47,
        "ocupadasSnapshot": 46
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 241,
        "ocupadasSnapshot": 237
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 2,
        "ocupadasSnapshot": 2
      }
    ]
  },
  {
    "codigo": "110010918655",
    "nombre": "Clínica Reina Sofia Pediatrica Y Mujer",
    "direccion": "Ac 127 20 56",
    "localidad": "Usaquén",
    "coord": {
      "lat": 4.706359,
      "lng": -74.051001
    },
    "naturaleza": "Privada",
    "complejidad": "media",
    "telefono": "6466060",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 24
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 15,
        "ocupadasSnapshot": 15
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 11,
        "ocupadasSnapshot": 11
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 3,
        "ocupadasSnapshot": 2
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 1,
        "ocupadasSnapshot": 1
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 1,
        "ocupadasSnapshot": 1
      }
    ]
  },
  {
    "codigo": "110010918668",
    "nombre": "Clínica Infantil Santa María Del Lago",
    "direccion": "CL 73 A 76 66",
    "localidad": "Engativá",
    "coord": {
      "lat": 4.69235,
      "lng": -74.098304
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "3406767",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 9,
        "ocupadasSnapshot": 7
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 9,
        "ocupadasSnapshot": 0
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 59,
        "ocupadasSnapshot": 41
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 6,
        "ocupadasSnapshot": 6
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 13,
        "ocupadasSnapshot": 8
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 85,
        "ocupadasSnapshot": 79
      }
    ]
  },
  {
    "codigo": "110010922401",
    "nombre": "Empresa Social Del Estado Hospital Universitario de La Samaritana",
    "direccion": "KR 8 0 29 SUR",
    "localidad": "San Cristóbal",
    "coord": {
      "lat": 4.58702,
      "lng": -74.0834
    },
    "naturaleza": "Pública",
    "complejidad": "alta",
    "telefono": "4077075 ext 10702",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 143,
        "ocupadasSnapshot": 120
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 9,
        "ocupadasSnapshot": 9
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 21,
        "ocupadasSnapshot": 19
      }
    ]
  },
  {
    "codigo": "110010936101",
    "nombre": "Clínica de Marly",
    "direccion": "CL 50 9 67",
    "localidad": "Chapinero",
    "coord": {
      "lat": 4.637006,
      "lng": -74.065106
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "3436600",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 87,
        "ocupadasSnapshot": 84
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 10,
        "ocupadasSnapshot": 4
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 8,
        "ocupadasSnapshot": 8
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 8,
        "ocupadasSnapshot": 7
      }
    ]
  },
  {
    "codigo": "110010945601",
    "nombre": "Hospital Universitario San Ignacio",
    "direccion": "KR 7 40 62",
    "localidad": "Chapinero",
    "coord": {
      "lat": 4.628037,
      "lng": -74.065101
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "5946161",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 31,
        "ocupadasSnapshot": 31
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 6,
        "ocupadasSnapshot": 6
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 26,
        "ocupadasSnapshot": 25
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 229,
        "ocupadasSnapshot": 210
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 2,
        "ocupadasSnapshot": 2
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 6,
        "ocupadasSnapshot": 6
      }
    ]
  },
  {
    "codigo": "110010952310",
    "nombre": "Virrey Solis I.P.S S.A. Americas",
    "direccion": "AV LAS AMERICAS 66 A 27",
    "localidad": "Puente Aranda",
    "coord": {
      "lat": 4.628247,
      "lng": -74.121085
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "6014473535 ext 248, 1360, 1365",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 47
      }
    ]
  },
  {
    "codigo": "110010952315",
    "nombre": "Virrey Solis IPS S.A - Clínica Suba",
    "direccion": "AC 145 95 B 22",
    "localidad": "Suba",
    "coord": {
      "lat": 4.740826,
      "lng": -74.088606
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "6014473535 ext 248, 1360, 1365",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 27
      }
    ]
  },
  {
    "codigo": "110010952317",
    "nombre": "Virrey Solis IPS.S.A. Calle 98",
    "direccion": "KR 49 98 A 28",
    "localidad": "Barrios Unidos",
    "coord": {
      "lat": 4.686828,
      "lng": -74.060859
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "6014473535 ext 248, 1360, 1365",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 27
      }
    ]
  },
  {
    "codigo": "110010959901",
    "nombre": "Clínica Del Country IPS",
    "direccion": "KR 16 82 57",
    "localidad": "Chapinero",
    "coord": {
      "lat": 4.668693,
      "lng": -74.056734
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "6013905099",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 6,
        "ocupadasSnapshot": 6
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 1,
        "ocupadasSnapshot": 0
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 6,
        "ocupadasSnapshot": 5
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 174,
        "ocupadasSnapshot": 131
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 32,
        "ocupadasSnapshot": 32
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 29,
        "ocupadasSnapshot": 27
      }
    ]
  },
  {
    "codigo": "110010966601",
    "nombre": "Clínica Del Occidente S.A.",
    "direccion": "AV DE LAS AMERICAS 71 C 29",
    "localidad": "Kennedy",
    "coord": {
      "lat": 4.629583,
      "lng": -74.135748
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "4254620 Ext 150",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-Intermedia Adultos",
        "total": 10,
        "ocupadasSnapshot": 10
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 111,
        "ocupadasSnapshot": 111
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 43,
        "ocupadasSnapshot": 43
      }
    ]
  },
  {
    "codigo": "110011613301",
    "nombre": "Fundación Hospital Infantil Universitario de San Jose",
    "direccion": "KR 52 67 A 71",
    "localidad": "Barrios Unidos",
    "coord": {
      "lat": 4.665382,
      "lng": -74.077941
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "4377540",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 21,
        "ocupadasSnapshot": 6
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 93,
        "ocupadasSnapshot": 91
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 1,
        "ocupadasSnapshot": 1
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 1,
        "ocupadasSnapshot": 0
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 65,
        "ocupadasSnapshot": 63
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 20,
        "ocupadasSnapshot": 16
      }
    ]
  },
  {
    "codigo": "110011693801",
    "nombre": "Hospital Militar Central",
    "direccion": "TV 3C 49 02",
    "localidad": "Chapinero",
    "coord": {
      "lat": 4.635694,
      "lng": -74.06226
    },
    "naturaleza": "Pública",
    "complejidad": "alta",
    "telefono": "3486868 ext: 3001/3002 3158653821",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 37,
        "ocupadasSnapshot": 18
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 330,
        "ocupadasSnapshot": 246
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 58,
        "ocupadasSnapshot": 38
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 2,
        "ocupadasSnapshot": 0
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 3,
        "ocupadasSnapshot": 2
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 6,
        "ocupadasSnapshot": 1
      }
    ]
  },
  {
    "codigo": "110011864201",
    "nombre": "Hospital Universitario Mayor-Mederi",
    "direccion": "CL 24 29 45",
    "localidad": "Los Mártires",
    "coord": {
      "lat": 4.623553,
      "lng": -74.081895
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "7055999 Ext 4140",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 70,
        "ocupadasSnapshot": 66
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 34,
        "ocupadasSnapshot": 31
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 505,
        "ocupadasSnapshot": 490
      }
    ]
  },
  {
    "codigo": "110011864202",
    "nombre": "Hospital Universitario Barrios Unidos-Mederi",
    "direccion": "CL 66 A 52 25",
    "localidad": "Barrios Unidos",
    "coord": {
      "lat": 4.664007,
      "lng": -74.079703
    },
    "naturaleza": "Privada",
    "complejidad": "media",
    "telefono": "4855970 ext 6214",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 2,
        "ocupadasSnapshot": 0
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 58,
        "ocupadasSnapshot": 48
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 6,
        "ocupadasSnapshot": 4
      }
    ]
  },
  {
    "codigo": "110012156401",
    "nombre": "Medicentro Familiar IPS SAS",
    "direccion": "CL 20 98 62",
    "localidad": "Fontibón",
    "coord": {
      "lat": 4.674254,
      "lng": -74.142295
    },
    "naturaleza": "Privada",
    "complejidad": "media",
    "telefono": "3108062745-3118895118",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 3,
        "ocupadasSnapshot": 1
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 41,
        "ocupadasSnapshot": 15
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 23,
        "ocupadasSnapshot": 5
      }
    ]
  },
  {
    "codigo": "110012156404",
    "nombre": "Clínica Medicentro Familiar Sede Suba",
    "direccion": "KR 94B 132A 65",
    "localidad": "Suba",
    "coord": {
      "lat": 4.732644,
      "lng": -74.088962
    },
    "naturaleza": "Privada",
    "complejidad": "media",
    "telefono": "3108077965",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 90,
        "ocupadasSnapshot": 99
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 8,
        "ocupadasSnapshot": 9
      }
    ]
  },
  {
    "codigo": "110012215001",
    "nombre": "Clínica Medical S.A.S.",
    "direccion": "CL 36 Sur 77 33",
    "localidad": "Kennedy",
    "coord": {
      "lat": 4.621924,
      "lng": -74.149548
    },
    "naturaleza": "Privada",
    "complejidad": "media",
    "telefono": "4505200 3168757999",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 130,
        "ocupadasSnapshot": 125
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 16,
        "ocupadasSnapshot": 16
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 13,
        "ocupadasSnapshot": 10
      }
    ]
  },
  {
    "codigo": "110012507001",
    "nombre": "Administradora Clínica La Colina SAS",
    "direccion": "CL 167 72 07",
    "localidad": "Suba",
    "coord": {
      "lat": 4.750761,
      "lng": -74.065343
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "6013905355",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 76,
        "ocupadasSnapshot": 58
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 1,
        "ocupadasSnapshot": 1
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 7,
        "ocupadasSnapshot": 7
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 7,
        "ocupadasSnapshot": 6
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 2,
        "ocupadasSnapshot": 2
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 47,
        "ocupadasSnapshot": 44
      }
    ]
  },
  {
    "codigo": "110012529701",
    "nombre": "Clínica Los Nogales SAS",
    "direccion": "CL 95 23 61",
    "localidad": "Chapinero",
    "coord": {
      "lat": 4.68318,
      "lng": -74.057277
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "5937000 Ext: 2045 / 2036 Cel: 3014199316",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 36,
        "ocupadasSnapshot": 32
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 11,
        "ocupadasSnapshot": 8
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 196,
        "ocupadasSnapshot": 180
      }
    ]
  },
  {
    "codigo": "110013028901",
    "nombre": "Unidad de Servicios de Salud Santa Clara Hospital Universitario",
    "direccion": "KR 14 B 1 45 SUR",
    "localidad": "Antonio Nariño",
    "coord": {
      "lat": 4.591033,
      "lng": -74.091912
    },
    "naturaleza": "Pública",
    "complejidad": "alta",
    "telefono": "3282828 ext 18191, 18000, 18151",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 19,
        "ocupadasSnapshot": 19
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 8,
        "ocupadasSnapshot": 8
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 8,
        "ocupadasSnapshot": 8
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 187,
        "ocupadasSnapshot": 127
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 43,
        "ocupadasSnapshot": 32
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 11,
        "ocupadasSnapshot": 11
      }
    ]
  },
  {
    "codigo": "110013028902",
    "nombre": "Unidad de Servicios de Salud San Blas",
    "direccion": "TV 5 ESTE 19 50 SUR",
    "localidad": "San Cristóbal",
    "coord": {
      "lat": 4.570145,
      "lng": -74.083731
    },
    "naturaleza": "Pública",
    "complejidad": "media",
    "telefono": "3282828 EXT 13192, 13941,13620",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 6,
        "ocupadasSnapshot": 6
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 40,
        "ocupadasSnapshot": 40
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 20,
        "ocupadasSnapshot": 0
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 90,
        "ocupadasSnapshot": 52
      }
    ]
  },
  {
    "codigo": "110013028915",
    "nombre": "Unidad de Servicios de Salud Perseverancia",
    "direccion": "KR 5 33 A 45",
    "localidad": "Santa Fe",
    "coord": {
      "lat": 4.619851,
      "lng": -74.06539
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "3282828 ETX 25181,25191",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 18,
        "ocupadasSnapshot": 12
      }
    ]
  },
  {
    "codigo": "110013028916",
    "nombre": "Unidad de Servicios de Salud Samper Mendoza",
    "direccion": "KR 22 22 A 26",
    "localidad": "Los Mártires",
    "coord": {
      "lat": 4.616992,
      "lng": -74.081325
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "3282828 EXT 19191,19181,19611",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 12,
        "ocupadasSnapshot": 12
      }
    ]
  },
  {
    "codigo": "110013028917",
    "nombre": "Unidad de Servicios de Salud Jorge Eliecer Gaitan",
    "direccion": "KR 4 A ESTE 5 20",
    "localidad": "Santa Fe",
    "coord": {
      "lat": 4.587542,
      "lng": -74.066706
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "3282828 ETX 16912, 16611,16571",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 34,
        "ocupadasSnapshot": 21
      }
    ]
  },
  {
    "codigo": "110013028918",
    "nombre": "Unidad de Servicios de Salud Diana Turbay",
    "direccion": "KR 1f 48x 40 sur",
    "localidad": "Rafael Uribe Uribe",
    "coord": {
      "lat": 4.545658,
      "lng": -74.106486
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "3282828",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 19
      }
    ]
  },
  {
    "codigo": "110013028919",
    "nombre": "Unidad de Servicios de Salud Chircales",
    "direccion": "TV 5 L BIS 48 F 69 SUR",
    "localidad": "Rafael Uribe Uribe",
    "coord": {
      "lat": 4.557585,
      "lng": -74.111869
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "3282828 EXT 21341, 21181,21621",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 12,
        "ocupadasSnapshot": 7
      }
    ]
  },
  {
    "codigo": "110013028920",
    "nombre": "Unidad de Servicios de Salud Olaya",
    "direccion": "KR 21 22 51 SUR",
    "localidad": "Rafael Uribe Uribe",
    "coord": {
      "lat": 4.584067,
      "lng": -74.105123
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "3282828 EXT 24192,24191,24851",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 19
      }
    ]
  },
  {
    "codigo": "110013028929",
    "nombre": "Unidad de Servicios de Salud Victoria",
    "direccion": "DG 39 SUR 3 20 ESTE",
    "localidad": "San Cristóbal",
    "coord": {
      "lat": 4.552174,
      "lng": -74.094367
    },
    "naturaleza": "Pública",
    "complejidad": "media",
    "telefono": "3282828 EXT 14131, 14132, 14192",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 104,
        "ocupadasSnapshot": 61
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 5,
        "ocupadasSnapshot": 3
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 13,
        "ocupadasSnapshot": 4
      }
    ]
  },
  {
    "codigo": "110013029101",
    "nombre": "Unidad de Servicios de Salud Simón Bolívar",
    "direccion": "CL 165 7 06",
    "localidad": "Usaquén",
    "coord": {
      "lat": 4.74116,
      "lng": -74.022577
    },
    "naturaleza": "Pública",
    "complejidad": "alta",
    "telefono": "4431790",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 32,
        "ocupadasSnapshot": 28
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 26,
        "ocupadasSnapshot": 26
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 150,
        "ocupadasSnapshot": 137
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 1,
        "ocupadasSnapshot": 1
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 59,
        "ocupadasSnapshot": 32
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 14,
        "ocupadasSnapshot": 12
      }
    ]
  },
  {
    "codigo": "110013029103",
    "nombre": "Unidad de Servicios de Salud Engativá Calle 80",
    "direccion": "TV 100 A 80 A 50",
    "localidad": "Engativá",
    "coord": {
      "lat": 4.711373,
      "lng": -74.109897
    },
    "naturaleza": "Pública",
    "complejidad": "media",
    "telefono": "4431790",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 3,
        "ocupadasSnapshot": 3
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 101,
        "ocupadasSnapshot": 94
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 12,
        "ocupadasSnapshot": 3
      }
    ]
  },
  {
    "codigo": "110013029104",
    "nombre": "Unidad de Servicios de Salud Emaus",
    "direccion": "CL 64 C 121 76",
    "localidad": "Engativá",
    "coord": {
      "lat": 4.715129,
      "lng": -74.141169
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "4431790",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 2,
        "ocupadasSnapshot": 2
      }
    ]
  },
  {
    "codigo": "110013029114",
    "nombre": "Unidad de Servicios de Salud Centro de Servicios Especializado",
    "direccion": "KR 104 152C 50",
    "localidad": "Suba",
    "coord": {
      "lat": 4.753563,
      "lng": -74.092268
    },
    "naturaleza": "Pública",
    "complejidad": "media",
    "telefono": "4431790",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 41,
        "ocupadasSnapshot": 29
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 70,
        "ocupadasSnapshot": 18
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 6,
        "ocupadasSnapshot": 3
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 3,
        "ocupadasSnapshot": 3
      }
    ]
  },
  {
    "codigo": "110013029116",
    "nombre": "Unidad de Servicios de Salud Gaitana I",
    "direccion": "TV 126 134 88",
    "localidad": "Suba",
    "coord": {
      "lat": 4.742218,
      "lng": -74.10861
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "4431790",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 27
      }
    ]
  },
  {
    "codigo": "110013029123",
    "nombre": "Unidad de Servicios de Salud Chapinero",
    "direccion": "CL 66 15 41",
    "localidad": "Barrios Unidos",
    "coord": {
      "lat": 4.653766,
      "lng": -74.065411
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "4431790",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 28,
        "ocupadasSnapshot": 25
      }
    ]
  },
  {
    "codigo": "110013029401",
    "nombre": "Unidad de Servicios de Salud El Tunal",
    "direccion": "CR 20 47B 35 SUR",
    "localidad": "Tunjuelito",
    "coord": {
      "lat": 4.582017,
      "lng": -74.130786
    },
    "naturaleza": "Pública",
    "complejidad": "alta",
    "telefono": "7300000 Opción 0",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 57,
        "ocupadasSnapshot": 57
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 35,
        "ocupadasSnapshot": 25
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 10,
        "ocupadasSnapshot": 10
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 45,
        "ocupadasSnapshot": 0
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 6,
        "ocupadasSnapshot": 0
      }
    ]
  },
  {
    "codigo": "110013029402",
    "nombre": "Unidad de Servicios de Salud Meissen",
    "direccion": "KR 18 B 60 G 36 SUR",
    "localidad": "Ciudad Bolívar",
    "coord": {
      "lat": 4.559662,
      "lng": -74.138745
    },
    "naturaleza": "Pública",
    "complejidad": "media",
    "telefono": "7300000 Opción 0",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 4,
        "ocupadasSnapshot": 2
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 20,
        "ocupadasSnapshot": 19
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 90,
        "ocupadasSnapshot": 90
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 8,
        "ocupadasSnapshot": 7
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 8,
        "ocupadasSnapshot": 8
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 83,
        "ocupadasSnapshot": 63
      }
    ]
  },
  {
    "codigo": "110013029407",
    "nombre": "Unidad de Servicios de Salud Ambulatoria Tunjuelito",
    "direccion": "AK 14 51 21 SUR",
    "localidad": "Tunjuelito",
    "coord": {
      "lat": 4.566051,
      "lng": -74.126887
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "7300000 Opción 0",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 37,
        "ocupadasSnapshot": 36
      }
    ]
  },
  {
    "codigo": "110013029413",
    "nombre": "Unidad de Servicios de Salud Jerusalen",
    "direccion": "CL 77 85 B 13 SUR",
    "localidad": "Ciudad Bolívar",
    "coord": {
      "lat": 4.571505,
      "lng": -74.163431
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "7300000 Opción 0",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 38
      }
    ]
  },
  {
    "codigo": "110013029428",
    "nombre": "Unidad de Servicios de Salud Vista Hermosa",
    "direccion": "KR 18 C 66 A 55 SUR",
    "localidad": "Ciudad Bolívar",
    "coord": {
      "lat": 4.552675,
      "lng": -74.144448
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "7300000 Opción 0",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 42,
        "ocupadasSnapshot": 35
      }
    ]
  },
  {
    "codigo": "110013029430",
    "nombre": "Unidad de Servicios de Salud Usme",
    "direccion": "KR 13 135 A 42 SUR",
    "localidad": "Usme",
    "coord": {
      "lat": 4.473259,
      "lng": -74.121853
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "7300000 Opción 0",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 14,
        "ocupadasSnapshot": 14
      }
    ]
  },
  {
    "codigo": "110013029431",
    "nombre": "Unidad de Servicios de Salud Santa Librada I",
    "direccion": "KR 9 B 75 49 SUR",
    "localidad": "Usme",
    "coord": {
      "lat": 4.514666,
      "lng": -74.113414
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "7300000 Opción 0",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 10,
        "ocupadasSnapshot": 6
      }
    ]
  },
  {
    "codigo": "110013029446",
    "nombre": "Unidad de Servicios de Salud San Juan de Sumapáz",
    "direccion": "Corregimiento San Juan de Sumapáz",
    "localidad": "Sumapaz",
    "coord": {
      "lat": 4.029047,
      "lng": -74.315175
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "3219007751",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 38
      }
    ]
  },
  {
    "codigo": "110013029449",
    "nombre": "Unidad de Servicios de Salud Nazareth",
    "direccion": "Corregimiento de Nazareth de Sumapaz",
    "localidad": "Sumapaz",
    "coord": {
      "lat": 4.173242,
      "lng": -74.146619
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "3108879305",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 2,
        "ocupadasSnapshot": 0
      }
    ]
  },
  {
    "codigo": "110013029450",
    "nombre": "Hospital de Usme",
    "direccion": "Cl. 137 Sur 3a 44",
    "localidad": "Usme",
    "coord": {
      "lat": 4.48923,
      "lng": -74.109771
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "7300000 Opción 0",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 38
      }
    ]
  },
  {
    "codigo": "110013029601",
    "nombre": "Hospital Occidente de Kennedy",
    "direccion": "TV 74 F 40 B 54 SUR",
    "localidad": "Kennedy",
    "coord": {
      "lat": 4.61678,
      "lng": -74.153833
    },
    "naturaleza": "Pública",
    "complejidad": "alta",
    "telefono": "3849160",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-Cuidado Intermedio Pediátrico",
        "total": 2,
        "ocupadasSnapshot": 1
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 5,
        "ocupadasSnapshot": 5
      },
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 2,
        "ocupadasSnapshot": 1
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 166,
        "ocupadasSnapshot": 141
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 13,
        "ocupadasSnapshot": 2
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 31,
        "ocupadasSnapshot": 30
      }
    ]
  },
  {
    "codigo": "110013029603",
    "nombre": "Hospital Pediátrico Tintal",
    "direccion": "CL 10 86 58",
    "localidad": "Kennedy",
    "coord": {
      "lat": 4.651066,
      "lng": -74.148798
    },
    "naturaleza": "Pública",
    "complejidad": "media",
    "telefono": "5550950",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 78,
        "ocupadasSnapshot": 53
      }
    ]
  },
  {
    "codigo": "110013029604",
    "nombre": "Centro de Salud Patio Bonito",
    "direccion": "DG 38 sur 82 30",
    "localidad": "Kennedy",
    "coord": {
      "lat": 4.634284,
      "lng": -74.161546
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "4547018",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 47
      }
    ]
  },
  {
    "codigo": "110013029622",
    "nombre": "Centro de Salud Trinidad Galán",
    "direccion": "KR 60 4 15",
    "localidad": "Puente Aranda",
    "coord": {
      "lat": 4.622195,
      "lng": -74.12051
    },
    "naturaleza": "Pública",
    "complejidad": "baja",
    "telefono": "2607876",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 6,
        "ocupadasSnapshot": 0
      }
    ]
  },
  {
    "codigo": "110013029625",
    "nombre": "Hospital Fontibón",
    "direccion": "KR 99 16i 41",
    "localidad": "Fontibón",
    "coord": {
      "lat": 4.671654,
      "lng": -74.145986
    },
    "naturaleza": "Pública",
    "complejidad": "media",
    "telefono": "4860033",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 48,
        "ocupadasSnapshot": 30
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 6,
        "ocupadasSnapshot": 2
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 2,
        "ocupadasSnapshot": 1
      }
    ]
  },
  {
    "codigo": "110013029654",
    "nombre": "Hospital de Bosa",
    "direccion": "CL 73 Sur 100 A 53",
    "localidad": "Bosa",
    "coord": {
      "lat": 4.635412,
      "lng": -74.205896
    },
    "naturaleza": "Pública",
    "complejidad": "alta",
    "telefono": "6013849160",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 180,
        "ocupadasSnapshot": 355
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 34,
        "ocupadasSnapshot": 67
      },
      {
        "tipo": "CAMAS-UCI Pediátrica",
        "total": 10,
        "ocupadasSnapshot": 20
      }
    ]
  },
  {
    "codigo": "110013097001",
    "nombre": "Grupo Empresarial Jarbsalud IPS S.A.S.",
    "direccion": "CL 33 bis 15 64",
    "localidad": "Teusaquillo",
    "coord": {
      "lat": 4.621651,
      "lng": -74.071258
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "4673216 - 7561334",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 19,
        "ocupadasSnapshot": 0
      }
    ]
  },
  {
    "codigo": "110013390301",
    "nombre": "Loscobos Medical Center SAS - Loscobos",
    "direccion": "AK 9 131 A 40",
    "localidad": "Usaquén",
    "coord": {
      "lat": 4.710742,
      "lng": -74.032778
    },
    "naturaleza": "Privada",
    "complejidad": "alta",
    "telefono": "7457581 EXT 2366",
    "servicios": [
      1102,
      712,
      744,
      203,
      201,
      320,
      245,
      743,
      110,
      109,
      108
    ],
    "camas": [
      {
        "tipo": "CAMAS-Pediátrica",
        "total": 19,
        "ocupadasSnapshot": 17
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 2,
        "ocupadasSnapshot": 0
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 162,
        "ocupadasSnapshot": 133
      },
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 34,
        "ocupadasSnapshot": 16
      }
    ]
  },
  {
    "codigo": "110013409101",
    "nombre": "Clininorte 161",
    "direccion": "Ac 161 16 C 39/51",
    "localidad": "Usaquén",
    "coord": {
      "lat": 4.740043,
      "lng": -74.040414
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "3188604159",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 5,
        "ocupadasSnapshot": 0
      }
    ]
  },
  {
    "codigo": "110013455201",
    "nombre": "Sociedad Medica Alcala SAS",
    "direccion": "AK 19 135 24",
    "localidad": "Usaquén",
    "coord": {
      "lat": 4.720053,
      "lng": -74.046612
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "3232255717-3114849286",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 12,
        "ocupadasSnapshot": 12
      }
    ]
  },
  {
    "codigo": "110013502501",
    "nombre": "Clínica Nueva El Lago S.A.S - Sede Calle 76",
    "direccion": "CL 76 15 55",
    "localidad": "Chapinero",
    "coord": {
      "lat": 4.663083,
      "lng": -74.05966
    },
    "naturaleza": "Privada",
    "complejidad": "media",
    "telefono": "3078061 - 3123459128",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 17,
        "ocupadasSnapshot": 12
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 141,
        "ocupadasSnapshot": 138
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 18,
        "ocupadasSnapshot": 18
      }
    ]
  },
  {
    "codigo": "110013627801",
    "nombre": "Clínica Azul",
    "direccion": "KR 49 D 91 33",
    "localidad": "Barrios Unidos",
    "coord": {
      "lat": 4.679823,
      "lng": -74.064351
    },
    "naturaleza": "Privada",
    "complejidad": "media",
    "telefono": "3184871071",
    "servicios": [
      1102,
      712,
      744,
      203,
      320,
      110
    ],
    "camas": [
      {
        "tipo": "CAMAS-UCI Adultos",
        "total": 16,
        "ocupadasSnapshot": 10
      },
      {
        "tipo": "CAMAS-Cuidado Intermedio Adulto",
        "total": 4,
        "ocupadasSnapshot": 2
      },
      {
        "tipo": "CAMAS-Adultos",
        "total": 85,
        "ocupadasSnapshot": 80
      }
    ]
  },
  {
    "codigo": "110013630032",
    "nombre": "Central de Urgencias Norte",
    "direccion": "CL 163 A 22 22",
    "localidad": "Usaquén",
    "coord": {
      "lat": 4.744252,
      "lng": -74.04646
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "6466060 Ext 5719469",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 27
      }
    ]
  },
  {
    "codigo": "110013630033",
    "nombre": "Unidad de Urgencias Puente Aranda",
    "direccion": "KR 62 14 41",
    "localidad": "Puente Aranda",
    "coord": {
      "lat": 4.634365,
      "lng": -74.112246
    },
    "naturaleza": "Privada",
    "complejidad": "baja",
    "telefono": "6466060",
    "servicios": [
      1102,
      712
    ],
    "camas": [
      {
        "tipo": "CAMAS-Adultos",
        "total": 24,
        "ocupadasSnapshot": 47
      }
    ]
  }
];
