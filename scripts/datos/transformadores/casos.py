"""
Casos de demo sacados de incidentes reales del 123.

Hoy, para mostrar PULSO, alguien tiene que inventarse un dictado. Con esto el
demo corre sobre incidentes que de verdad ocurrieron en Bogota en junio 2026:
tipo, prioridad, edad, sexo, localidad y hora son el dato original.

═══════════════════════════════════════════════════════════════════
 HONESTIDAD SOBRE EL DICTADO
═══════════════════════════════════════════════════════════════════
 El 123 no publica el audio ni la narrativa del paramedico — seria dato
 personal de salud. Lo que publica son los campos estructurados.

 Asi que el INCIDENTE es real y el TEXTO del dictado es una plantilla armada
 a partir de sus campos. Cada caso sale marcado con `dictadoSintetico: true`.
 Si alguien del jurado pregunta, la respuesta es exactamente esa: el caso es
 real, la forma de decirlo la redactamos nosotros.

 Sirve igual para lo que importa: probar el parser clinico y el ruteo contra
 la mezcla real de patologias y prioridades de la ciudad, en vez de contra
 cuatro casos escogidos para quedar bonitos.
═══════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import collections
import datetime as dt
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from comun import (  # noqa: E402
    DATOS,
    corregir_coord,
    escribir_json,
    leer_json,
    limpiar,
    numero,
)
from fuentes import POR_ID, leer as leer_fuente  # noqa: E402

PRIORIDAD_A_TRIAGE = {"Critica": 1, "Alta": 2, "Media": 3, "Baja": 4}

# El TIPO_INCIDENTE del 123 viene como "CODIGO - DESCRIPCION". Traducimos los
# 21 tipos a como lo diria un paramedico por radio. La descripcion clinica
# aproximada permite que el parser tenga algo real que extraer.
GUION_POR_TIPO = {
    "HERIDO": "paciente con herida {donde}, sangrado {sangrado}",
    "TRASTMENT": "paciente con agitacion psicomotora, trastorno mental descompensado",
    "EVERES": "paciente con dificultad respiratoria, saturacion baja",
    "ENFERMO": "paciente con malestar general, sin foco claro",
    "CONVULSION": "paciente con episodio convulsivo tonico clonico",
    "INCONSCIEN": "paciente inconsciente, sin respuesta a estimulos",
    "ACCTRANS": "paciente politraumatizado por accidente de transito",
    "DOLORTORAX": "paciente con dolor toracico opresivo",
    "CAIDA": "paciente con caida de altura, trauma multiple",
    "GESTANTE": "paciente gestante con actividad uterina",
    "INTOXICA": "paciente con cuadro de intoxicacion",
    "QUEMADO": "paciente con quemaduras",
    "HEMORRAG": "paciente con hemorragia activa",
    "ACV": "paciente con deficit neurologico focal subito",
}

DONDE = ["en region abdominal", "en miembro inferior", "en craneo", "en torax"]
SANGRADO = ["activo", "controlado", "abundante"]


def _fecha(s: str | None) -> dt.datetime | None:
    try:
        return dt.datetime.strptime((s or "").strip(), "%d/%m/%Y %H:%M")
    except ValueError:
        return None


def _clave_localidad(s: str | None) -> str:
    """
    Las dos fuentes escriben la localidad distinto y por eso no cruzaban:

        osb_ofertasrv-ips-urgencias.csv -> "Usaquén", "Ciudad Bolívar"
        llamadas123.csv                 -> "USAQUEN",  "CIUDAD BOLIVAR"

    Sin quitar las tildes se perdian 7 de 19 localidades, y los casos de esas
    localidades salian sin origen — o sea, sin poder rutearse.
    """
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().upper()


def _centroides_localidad() -> tuple[dict[str, dict], dict[str, str]]:
    """
    Centro aproximado de cada localidad. Devuelve (centroides, de_donde_salio).

    Primero promedia las IPS de urgencias de la localidad, que es la fuente
    correcta. Pero LA CANDELARIA no tiene NINGUNA IPS de urgencias — no es un
    bug del cruce, es el dato: sus urgencias las atiende otra localidad. Sin
    respaldo, sus casos salian sin origen y por tanto sin poder rutearse.

    El respaldo sale de las 2900 IPS del geojson, tomando solo los barrios
    cuyo nombre ES IGUAL al de la localidad. Esa igualdad estricta es la que
    lo hace seguro: "LA CANDELARIA" entra, y "CANDELARIA LA NUEVA" —que queda
    en Ciudad Bolivar, a 12 km— no. Para La Candelaria da 5 puntos en un
    radio de 0.9 km, a 760 m del centro historico.
    """
    filas, _ = leer_fuente("ips_urgencias")
    acum: dict[str, list] = collections.defaultdict(list)

    for f in filas:
        loc = _clave_localidad(f.get("Localidad"))
        coord = corregir_coord(numero(f.get("Latitud")), numero(f.get("Longitud")))
        if loc and coord:
            acum[loc].append(coord)

    centroides = {loc: _promedio(cs) for loc, cs in acum.items()}
    origen = {loc: "ips-urgencias" for loc in centroides}

    # Respaldo por barrio homonimo, solo para las localidades que faltan.
    geo = leer_json(DATOS / POR_ID["ins_geojson"].ruta)
    por_barrio: dict[str, list] = collections.defaultdict(list)
    for ft in geo.get("features", []):
        barrio = _clave_localidad(ft.get("properties", {}).get("barrio"))
        coords = (ft.get("geometry") or {}).get("coordinates") or []
        if barrio and len(coords) == 2:
            por_barrio[barrio].append((coords[1], coords[0]))

    for loc, puntos in por_barrio.items():
        if loc not in centroides and puntos:
            centroides[loc] = _promedio(puntos)
            origen[loc] = "barrio-homonimo"

    return centroides, origen


def _promedio(coords: list) -> dict:
    return {
        "lat": round(sum(c[0] for c in coords) / len(coords), 6),
        "lng": round(sum(c[1] for c in coords) / len(coords), 6),
    }


def _dictado(tipo: str, edad, sexo: str | None, semilla: int) -> str:
    codigo = (tipo or "").split("-")[0].strip()
    plantilla = GUION_POR_TIPO.get(codigo)

    if plantilla is None:
        # Tipo sin guion propio: usamos su descripcion tal cual, en minuscula.
        desc = (tipo or "").split("-", 1)[-1].strip().lower() or "cuadro no especificado"
        plantilla = f"paciente con {desc}"

    texto = plantilla.format(
        donde=DONDE[semilla % len(DONDE)],
        sangrado=SANGRADO[semilla % len(SANGRADO)],
    )

    quien = "Paciente"
    if edad is not None:
        genero = {"MASCULINO": "masculino", "FEMENINO": "femenino"}.get(sexo or "")
        quien = f"{'Hombre' if genero == 'masculino' else 'Mujer' if genero else 'Paciente'} de {edad} anos"

    return f"{quien}, {texto}."


def construir(maximo: int = 400) -> dict:
    filas, _ = leer_fuente("llamadas_123")
    centroides, origen_centroide = _centroides_localidad()

    casos = []
    sin_centroide = set()
    vistos = set()

    for i, f in enumerate(filas):
        incidente = limpiar(f.get("NUMERO_INCIDENTE"))
        # El mismo incidente aparece varias veces (una por movil despachado).
        if not incidente or incidente in vistos:
            continue
        vistos.add(incidente)

        fecha = _fecha(f.get("FECHA_INICIO_DESPLAZAMIENTO_MOVIL"))
        prioridad = limpiar(f.get("PRIORIDAD_FINAL"))
        if not fecha or not prioridad:
            continue

        localidad = _clave_localidad(f.get("LOCALIDAD"))
        origen = centroides.get(localidad)
        if origen is None and localidad:
            sin_centroide.add(localidad)

        # EDAD solo es util si UNIDAD dice que son anos.
        edad = None
        if (f.get("UNIDAD") or "").strip().lower().startswith("a"):
            e = numero(f.get("EDAD"))
            if e is not None and 0 < e < 120:
                edad = int(e)

        sexo = {"MASCULINO": "M", "FEMENINO": "F"}.get(
            (f.get("GENERO") or "").strip().upper()
        )
        tipo = limpiar(f.get("TIPO_INCIDENTE")) or ""

        casos.append(
            {
                "incidente": incidente,
                "triage": PRIORIDAD_A_TRIAGE.get(prioridad, 4),
                "prioridad123": prioridad,
                "tipoIncidente": tipo,
                "localidad": localidad or None,
                "hora": fecha.hour,
                "fecha": fecha.isoformat(),
                "edad": edad,
                "sexo": sexo or "desconocido",
                "origen": origen,
                "origenCentroide": origen_centroide.get(localidad),
                "texto": _dictado(tipo, edad, f.get("GENERO"), i),
                "dictadoSintetico": True,
            }
        )

    # Muestreo ESTRATIFICADO, no "los mas graves primero".
    #
    # Ordenar por triage y cortar daba 400 casos todos de triage 1: un set de
    # demo donde todo es critico no prueba el ruteo, porque nunca ejercita el
    # caso en que una sede de baja complejidad SI sirve. Aqui se conserva la
    # proporcion real de la ciudad (Alta 56%, Critica 27%, Media 12%, Baja 6%).
    por_nivel: dict[int, list] = collections.defaultdict(list)
    for c in casos:
        por_nivel[c["triage"]].append(c)

    recorte = []
    for nivel, grupo in sorted(por_nivel.items()):
        cupo = max(1, round(maximo * len(grupo) / len(casos)))
        grupo.sort(key=lambda c: c["hora"])
        # Repartidos a lo largo del grupo, para no quedarnos con una sola hora.
        paso = max(1, len(grupo) // cupo)
        recorte.extend(grupo[::paso][:cupo])

    recorte.sort(key=lambda c: (c["triage"], c["hora"]))

    escribir_json(
        "casos-demo.json",
        {
            "fuente": "Llamadas 123 Bogota, NUSE — incidentes reales, dictado sintetico",
            "advertencia": (
                "Los campos del incidente son reales. El campo `texto` es una "
                "plantilla armada a partir de ellos: el 123 no publica narrativa "
                "clinica. Ver la cabecera de scripts/datos/transformadores/casos.py."
            ),
            "total": len(recorte),
            "casos": recorte,
        },
    )

    por_triage = collections.Counter(c["triage"] for c in recorte)
    return {
        "incidentes_unicos": len(casos),
        "exportados": len(recorte),
        "por_triage": dict(sorted(por_triage.items())),
        "localidades_sin_centroide": sorted(sin_centroide),
        # Solo las localidades que realmente usaron el respaldo. El indice de
        # barrios trae cientos de entradas mas que ningun caso consulta.
        "localidades_por_barrio_homonimo": sorted(
            {
                c["localidad"]
                for c in recorte
                if c.get("origenCentroide") == "barrio-homonimo" and c["localidad"]
            }
        ),
    }
