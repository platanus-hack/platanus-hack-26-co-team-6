/**
 * ARCHIVO GENERADO — no editar a mano.
 *
 * Lo produce `python scripts/datos/construir.py` a partir de data/.
 * Cualquier cambio aqui se pierde en la siguiente corrida. Si necesitas
 * cambiar el contenido, cambia la fuente o su transformador.
 *
 * Generado: 2026-08-22
 * Fuente:   llamadas123.csv — 400 incidentes reales, muestra estratificada
 */

/** Un incidente real del 123. El `texto` es plantilla; el resto es el dato. */
export interface CasoReal {
  /** Numero de incidente del CRUE. Se pinta: es lo que lo hace verificable. */
  incidente: string;
  texto: string;
  triage: number;
  localidad: string | null;
  fecha: string;
  origen: { lat: number; lng: number } | null;
}

/**
 * Muestra estratificada de incidentes reales del 123 de Bogota.
 *
 * ⚠️ Los campos del incidente son REALES: tipo, prioridad, edad, sexo,
 *    localidad y hora salen del dato publicado. El campo `texto` es una
 *    plantilla armada con esos campos, porque el 123 no publica la narrativa
 *    clinica — seria dato personal de salud. Si alguien pregunta, esa es la
 *    respuesta exacta.
 */
export const CASOS_REALES: CasoReal[] = [
  {
    "incidente": "CRU-00286143-26",
    "texto": "Mujer de 80 anos, dificultad respiratoria, saturacion baja.",
    "triage": 1,
    "localidad": "SUBA",
    "fecha": "2026-06-01T00:44:00",
    "origen": {
      "lat": 4.740891,
      "lng": -74.089124
    }
  },
  {
    "incidente": "CRU-00320035-26",
    "texto": "Paciente con herida en craneo, sangrado activo.",
    "triage": 1,
    "localidad": "RAFAEL URIBE URIBE",
    "fecha": "2026-06-18T05:41:00",
    "origen": {
      "lat": 4.569346,
      "lng": -74.1096
    }
  },
  {
    "incidente": "CRU-00327939-26",
    "texto": "Mujer de 38 anos, patologia ginecobstétrica.",
    "triage": 1,
    "localidad": "USME",
    "fecha": "2026-06-22T08:43:00",
    "origen": {
      "lat": 4.492385,
      "lng": -74.115013
    }
  },
  {
    "incidente": "CRU-00318536-26",
    "texto": "Hombre de 47 anos, intento de suicidio.",
    "triage": 1,
    "localidad": "USAQUEN",
    "fecha": "2026-06-17T10:28:00",
    "origen": {
      "lat": 4.721878,
      "lng": -74.038976
    }
  },
  {
    "incidente": "CRU-00324611-26",
    "texto": "Hombre de 83 anos, dificultad respiratoria, saturacion baja.",
    "triage": 1,
    "localidad": "TEUSAQUILLO",
    "fecha": "2026-06-20T12:24:00",
    "origen": {
      "lat": 4.634813,
      "lng": -74.080642
    }
  },
  {
    "incidente": "CRU-00342062-26",
    "texto": "Mujer de 20 anos, intoxicacion.",
    "triage": 1,
    "localidad": "USAQUEN",
    "fecha": "2026-06-29T14:12:00",
    "origen": {
      "lat": 4.721878,
      "lng": -74.038976
    }
  },
  {
    "incidente": "CRU-00321332-26",
    "texto": "Hombre de 40 anos, perdida de consciencia, sin respuesta a estimulos.",
    "triage": 1,
    "localidad": "SUBA",
    "fecha": "2026-06-18T17:45:00",
    "origen": {
      "lat": 4.740891,
      "lng": -74.089124
    }
  },
  {
    "incidente": "CRU-00306012-26",
    "texto": "Hombre de 1 anos, dificultad respiratoria, saturacion baja.",
    "triage": 1,
    "localidad": "KENNEDY",
    "fecha": "2026-06-10T20:41:00",
    "origen": {
      "lat": 4.627143,
      "lng": -74.145412
    }
  },
  {
    "incidente": "CRU-00286121-26",
    "texto": "Hombre de 30 anos, agitacion psicomotora, trastorno mental descompensado.",
    "triage": 2,
    "localidad": "USAQUEN",
    "fecha": "2026-06-01T00:46:00",
    "origen": {
      "lat": 4.721878,
      "lng": -74.038976
    }
  },
  {
    "incidente": "CRU-00294400-26",
    "texto": "Paciente con herida en craneo, sangrado controlado.",
    "triage": 2,
    "localidad": "CIUDAD BOLIVAR",
    "fecha": "2026-06-05T05:08:00",
    "origen": {
      "lat": 4.561281,
      "lng": -74.148875
    }
  },
  {
    "incidente": "CRU-00325907-26",
    "texto": "Paciente con malestar general, sin foco claro.",
    "triage": 2,
    "localidad": "TUNJUELITO",
    "fecha": "2026-06-21T08:12:00",
    "origen": {
      "lat": 4.574034,
      "lng": -74.128836
    }
  },
  {
    "incidente": "CRU-00310678-26",
    "texto": "Paciente con maltrato.",
    "triage": 2,
    "localidad": "ENGATIVA",
    "fecha": "2026-06-13T10:03:00",
    "origen": {
      "lat": 4.697922,
      "lng": -74.109584
    }
  },
  {
    "incidente": "CRU-00315263-26",
    "texto": "Paciente con herida en torax, sangrado controlado.",
    "triage": 2,
    "localidad": "TEUSAQUILLO",
    "fecha": "2026-06-15T12:44:00",
    "origen": {
      "lat": 4.634813,
      "lng": -74.080642
    }
  },
  {
    "incidente": "CRU-00335715-26",
    "texto": "Hombre de 13 anos, dificultad respiratoria, saturacion baja.",
    "triage": 2,
    "localidad": "USME",
    "fecha": "2026-06-26T14:02:00",
    "origen": {
      "lat": 4.492385,
      "lng": -74.115013
    }
  },
  {
    "incidente": "CRU-00313732-26",
    "texto": "Paciente con episodio convulsivo tonico clonico.",
    "triage": 2,
    "localidad": "SUBA",
    "fecha": "2026-06-14T17:39:00",
    "origen": {
      "lat": 4.740891,
      "lng": -74.089124
    }
  },
  {
    "incidente": "CRU-00336395-26",
    "texto": "Paciente con malestar general, sin foco claro.",
    "triage": 2,
    "localidad": "ENGATIVA",
    "fecha": "2026-06-26T20:10:00",
    "origen": {
      "lat": 4.697922,
      "lng": -74.109584
    }
  },
  {
    "incidente": "CRU-00287922-26",
    "texto": "Hombre de 35 anos, sintomas gastrointestinales.",
    "triage": 3,
    "localidad": "LOS MARTIRES",
    "fecha": "2026-06-02T00:17:00",
    "origen": {
      "lat": 4.609491,
      "lng": -74.084229
    }
  },
  {
    "incidente": "CRU-00342801-26",
    "texto": "Paciente con acompañamiento a evento.",
    "triage": 3,
    "localidad": "FONTIBON",
    "fecha": "2026-06-30T05:04:00",
    "origen": {
      "lat": 4.672954,
      "lng": -74.144141
    }
  },
  {
    "incidente": "CRU-00316581-26",
    "texto": "Mujer de 35 anos, amenaza de suicidio.",
    "triage": 3,
    "localidad": "SUBA",
    "fecha": "2026-06-16T08:12:00",
    "origen": {
      "lat": 4.740891,
      "lng": -74.089124
    }
  },
  {
    "incidente": "CRU-00335433-26",
    "texto": "Paciente con malestar general, sin foco claro.",
    "triage": 3,
    "localidad": "SUBA",
    "fecha": "2026-06-26T09:59:00",
    "origen": {
      "lat": 4.740891,
      "lng": -74.089124
    }
  },
  {
    "incidente": "CRU-00306904-26",
    "texto": "Mujer de 24 anos, agitacion psicomotora, trastorno mental descompensado.",
    "triage": 3,
    "localidad": "RAFAEL URIBE URIBE",
    "fecha": "2026-06-11T11:35:00",
    "origen": {
      "lat": 4.569346,
      "lng": -74.1096
    }
  },
  {
    "incidente": "CRU-00341964-26",
    "texto": "Hombre de 71 anos, malestar general, sin foco claro.",
    "triage": 3,
    "localidad": "SUBA",
    "fecha": "2026-06-29T12:48:00",
    "origen": {
      "lat": 4.740891,
      "lng": -74.089124
    }
  },
  {
    "incidente": "CRU-00335674-26",
    "texto": "Hombre de 14 anos, amenaza de suicidio.",
    "triage": 3,
    "localidad": "ENGATIVA",
    "fecha": "2026-06-26T14:02:00",
    "origen": {
      "lat": 4.697922,
      "lng": -74.109584
    }
  },
  {
    "incidente": "CRU-00335732-26",
    "texto": "Hombre de 23 anos, amenaza de suicidio.",
    "triage": 3,
    "localidad": "FONTIBON",
    "fecha": "2026-06-26T16:14:00",
    "origen": {
      "lat": 4.672954,
      "lng": -74.144141
    }
  },
  {
    "incidente": "CRU-00286112-26",
    "texto": "Paciente con acompañamiento a evento.",
    "triage": 4,
    "localidad": "LOS MARTIRES",
    "fecha": "2026-06-01T00:40:00",
    "origen": {
      "lat": 4.609491,
      "lng": -74.084229
    }
  },
  {
    "incidente": "CRU-00331127-26",
    "texto": "Hombre de 15 anos, acompañamiento a evento.",
    "triage": 4,
    "localidad": "LOS MARTIRES",
    "fecha": "2026-06-24T00:04:00",
    "origen": {
      "lat": 4.609491,
      "lng": -74.084229
    }
  },
  {
    "incidente": "CRU-00316337-26",
    "texto": "Hombre de 22 anos, dificultad respiratoria, saturacion baja.",
    "triage": 4,
    "localidad": "BOSA",
    "fecha": "2026-06-16T03:10:00",
    "origen": {
      "lat": 4.635412,
      "lng": -74.205896
    }
  },
  {
    "incidente": "CRU-00329349-26",
    "texto": "Paciente con herida en miembro inferior, sangrado activo.",
    "triage": 4,
    "localidad": "KENNEDY",
    "fecha": "2026-06-23T06:35:00",
    "origen": {
      "lat": 4.627143,
      "lng": -74.145412
    }
  },
  {
    "incidente": "CRU-00288553-26",
    "texto": "Mujer de 71 anos, perdida de consciencia, sin respuesta a estimulos.",
    "triage": 4,
    "localidad": "SUBA",
    "fecha": "2026-06-02T09:28:00",
    "origen": {
      "lat": 4.740891,
      "lng": -74.089124
    }
  },
  {
    "incidente": "CRU-00313108-26",
    "texto": "Paciente con dolor toracico opresivo.",
    "triage": 4,
    "localidad": "KENNEDY",
    "fecha": "2026-06-14T11:26:00",
    "origen": {
      "lat": 4.627143,
      "lng": -74.145412
    }
  },
  {
    "incidente": "CRU-00301770-26",
    "texto": "Paciente con malestar general, sin foco claro.",
    "triage": 4,
    "localidad": "SANTA FE",
    "fecha": "2026-06-08T15:09:00",
    "origen": {
      "lat": 4.603697,
      "lng": -74.066048
    }
  },
  {
    "incidente": "CRU-00307587-26",
    "texto": "Paciente con episodio convulsivo tonico clonico.",
    "triage": 4,
    "localidad": "BOSA",
    "fecha": "2026-06-11T18:57:00",
    "origen": {
      "lat": 4.635412,
      "lng": -74.205896
    }
  }
];
