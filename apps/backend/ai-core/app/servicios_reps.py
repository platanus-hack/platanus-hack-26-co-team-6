"""Catalogo de servicios habilitados del REPS.

FUENTE OFICIAL — no inventamos codigos:
  CodeSystem FHIR de MinSalud, 130 conceptos, CC-BY-4.0
  canonical: https://fhir.minsalud.gov.co/rda/CodeSystem/REPShealthcareServices
  navegable: https://vulcano.ihcecol.gov.co/CodeSystem-REPShealthcareServices

Puerto 1:1 de `apps/frontend/lib/servicios-reps.ts`. Ese archivo y este
tienen que decir lo mismo: si agregas un codigo aca, agregalo alla.

OJO: 408 es RADIOTERAPIA, no hemodinamia. Hemodinamia es 743.
"""

from typing import Literal

Complejidad = Literal["baja", "media", "alta"]
TipoMovil = Literal["TAB", "TAM"]

# Urgencias
URGENCIAS = 1102

# Cuidado intensivo
UCI_NEONATAL = 108
UCI_PEDIATRICO = 109
UCI_ADULTOS = 110

# Quirurgicos
CIRUGIA_CABEZA_CUELLO = 201
CIRUGIA_GENERAL = 203
NEUROCIRUGIA = 245

# Materno-infantil
GINECOBSTETRICIA = 320

# Apoyo diagnostico y terapeutico
RADIOTERAPIA = 408
QUIMIOTERAPIA = 709
TOMA_MUESTRAS_LAB = 712
HEMODINAMIA = 743
IMAGENES_IONIZANTES = 744

NOMBRE_SERVICIO: dict[int, str] = {
    108: "Cuidado intensivo neonatal",
    109: "Cuidado intensivo pediátrico",
    110: "Cuidado intensivo adultos",
    201: "Cirugía de cabeza y cuello",
    203: "Cirugía general",
    245: "Neurocirugía",
    320: "Ginecobstetricia",
    408: "Radioterapia",
    709: "Quimioterapia",
    712: "Toma de muestras de laboratorio clínico",
    743: "Hemodinamia e intervencionismo",
    744: "Imágenes diagnósticas ionizantes",
    1102: "Urgencias",
}


def nombre_servicio(cod: int) -> str:
    return NOMBRE_SERVICIO.get(cod, f"Servicio {cod}")


def nombres_servicios(cods: list[int]) -> str:
    return " + ".join(nombre_servicio(c) for c in cods)


# Subconjunto que el LLM puede elegir. Se lo pasamos en el prompt para que
# no invente codigos, y filtramos su salida contra esta lista.
SERVICIOS_SELECCIONABLES: list[int] = [
    1102, 110, 109, 108, 743, 245, 203, 201, 320, 744, 712,
]

_ORDEN_COMPLEJIDAD: dict[str, int] = {"baja": 0, "media": 1, "alta": 2}


def complejidad_suficiente(sede: Complejidad, requerida: Complejidad) -> bool:
    return _ORDEN_COMPLEJIDAD[sede] >= _ORDEN_COMPLEJIDAD[requerida]


def servicios_faltantes(
    servicios_sede: list[int], servicios_requeridos: list[int]
) -> list[int]:
    """FILTRO DURO. Devuelve los servicios exigidos que la sede NO tiene.

    Lista vacia = la sede es viable. Urgencias (1102) siempre es obligatorio:
    sin urgencias habilitadas no puede recibir un traslado de emergencia.
    """
    tiene = set(servicios_sede)
    exigidos = [URGENCIAS] + [s for s in servicios_requeridos if s != URGENCIAS]
    return [s for s in dict.fromkeys(exigidos) if s not in tiene]


def movil_compatible(tipo_movil: TipoMovil, requiere_medico_a_bordo: bool) -> bool:
    """Un TAB no puede trasladar un paciente que requiere medico a bordo.

    Esto no pondera: descarta.
    """
    return not requiere_medico_a_bordo or tipo_movil == "TAM"


# Tiempo maximo de atencion por nivel de triage (Res. 5596/2015), en minutos.
MINUTOS_MAX_TRIAGE: dict[int, int] = {1: 0, 2: 30, 3: 120, 4: 240, 5: 360}

ETIQUETA_TRIAGE: dict[int, str] = {
    1: "I · Inmediato",
    2: "II · ≤ 30 min",
    3: "III · ≤ 120 min",
    4: "IV · ≤ 240 min",
    5: "V · ≤ 360 min",
}


def es_hora_dorada(triage: int) -> bool:
    """Triage I y II entran al carril rojo de hora dorada."""
    return triage <= 2
