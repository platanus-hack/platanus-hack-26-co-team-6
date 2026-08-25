"""Las zonas de cobertura de Bogotá, con su demanda real.

Sale de `data/derivados/demanda_localidad.json`, que produce
`scripts/etl/demanda_123.py` a partir de las 9.206 llamadas del NUSE 123.
Kennedy concentra el 15,0% de la demanda de la ciudad; Sumapaz el 0,08%.

⚠️ LOS CENTROIDES SON APROXIMADOS Y HAY QUE DECIRLO.
   Las llamadas del 123 no traen coordenadas —la unidad más fina es la
   localidad— y en el repo no hay polígonos de localidad: `ins.geojson` son
   puntos de IPS sin campo de localidad. Estos centroides son referencias
   públicas de cada localidad, suficientes para repartir cobertura y NO
   suficientes para navegar.

   Cuando entren los polígonos oficiales (datos abiertos de Bogotá), esto se
   reemplaza y el motor no se entera: `Zona.id` es opaco a propósito.
"""

import json
import logging
import pathlib
from functools import lru_cache
from typing import Any

log = logging.getLogger(__name__)

#: app/ → voz/ → services/ → apps/ → raíz del repo. Son CINCO niveles: el
#: archivo cuenta como el nivel 0 de `parents`, y equivocarse por uno hace que
#: el archivo de demanda "no exista" y la cobertura devuelva cero zonas.
RAIZ = pathlib.Path(__file__).resolve().parents[4]
DEMANDA = RAIZ / "data/derivados/demanda_localidad.json"

#: Centroides aproximados por localidad. Sirven para decidir a qué zona mandar
#: una unidad, no para darle una dirección.
#:
#: Las claves van en ASCII SIN TILDES a propósito, igual que las normaliza el
#: ETL: el CSV del 123 tiene codificación mixta y "USAQUÉN" llega de dos
#: formas distintas según la fila. Una clave con tilde no cruza, la localidad
#: desaparece del reparto, y nadie la cubre — en silencio.
CENTROIDES: dict[str, tuple[float, float]] = {
    "USAQUEN": (4.703, -74.030),
    "CHAPINERO": (4.649, -74.058),
    "SANTA FE": (4.608, -74.070),
    "SAN CRISTOBAL": (4.557, -74.087),
    "USME": (4.479, -74.126),
    "TUNJUELITO": (4.572, -74.132),
    "BOSA": (4.618, -74.195),
    "KENNEDY": (4.628, -74.155),
    "FONTIBON": (4.674, -74.146),
    "ENGATIVA": (4.706, -74.117),
    "SUBA": (4.744, -74.083),
    "BARRIOS UNIDOS": (4.667, -74.083),
    "TEUSAQUILLO": (4.639, -74.092),
    "LOS MARTIRES": (4.604, -74.090),
    "ANTONIO NARINO": (4.591, -74.100),
    "PUENTE ARANDA": (4.615, -74.115),
    "LA CANDELARIA": (4.594, -74.074),
    "RAFAEL URIBE URIBE": (4.558, -74.116),
    "CIUDAD BOLIVAR": (4.531, -74.156),
    "SUMAPAZ": (4.100, -74.300),
}


@lru_cache(maxsize=1)
def zonas() -> list[dict[str, Any]]:
    """Las zonas listas para `POST /v1/cobertura`.

    Si falta el archivo de demanda, devuelve lista vacía y lo dice: el
    servicio no se cae por eso, pero la cobertura deja de poder calcularse y
    hay que enterarse.
    """
    if not DEMANDA.exists():
        log.warning(
            "[voz] falta %s — sin demanda no hay cobertura que calcular. "
            "Corre: python3 scripts/etl/demanda_123.py",
            DEMANDA,
        )
        return []

    datos = json.loads(DEMANDA.read_text(encoding="utf-8"))
    salida = []
    sin_centroide = []
    for z in datos.get("zonas", []):
        nombre = z["localidad"]
        centro = CENTROIDES.get(nombre)
        if centro is None:
            sin_centroide.append(nombre)
            continue
        salida.append({
            "id": z["codigo"] or nombre,
            "nombre": nombre,
            "demandaRelativa": z["fraccionDemanda"],
            "centroide": {"lat": centro[0], "lng": centro[1]},
        })

    if sin_centroide:
        # Una localidad sin centroide desaparece del reparto y nadie la cubre.
        # Callarlo sería dejar un hueco invisible en el mapa.
        log.warning("[voz] localidades sin centroide, quedan fuera: %s", sin_centroide)

    return salida
