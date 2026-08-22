"""
Ocupacion de urgencias por subred, 2021-2025.

El numero de la primera slide. No es una estimacion nuestra: es lo que publica
el Observatorio de Salud de Bogota.

    Sur Occidente, julio 2025 ......... 219,34%
    Sur,           junio 2025 ......... 176,40%
    Total RISS,    septiembre 2025 .... 132,52%

Un servicio de urgencias al 219% es literalmente el doble de pacientes que
camas. Eso es el problema que PULSO ataca, dicho por la propia Secretaria.

Se conserva el ratio CRUDO (2.1934), sin recortar. sedes.json recorta a 0.98
porque ahi alimenta un indice 0..1, pero para citar hay que usar este archivo.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from comun import DATOS, escribir_json, leer_csv, limpiar, porcentaje  # noqa: E402
from fuentes import POR_ID, leer as leer_fuente  # noqa: E402

SUBREDES = ("Norte", "Centro Oriente", "Sur", "Sur Occidente")
MESES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


def construir() -> dict:
    filas, encoding = leer_fuente("ocupacion_urgencias")

    serie = []
    for f in filas:
        anio, mes = limpiar(f.get("Año")), limpiar(f.get("Mes"))
        if not anio or not mes:
            continue

        punto = {
            "anio": int(anio),
            "mes": mes,
            "mesNumero": MESES.index(mes) + 1 if mes in MESES else None,
            "totalRiss": porcentaje(f.get("Total RISS")),
            "subredes": {s: porcentaje(f.get(s)) for s in SUBREDES},
        }
        # Las sedes priorizadas son las seis que la Secretaria vigila aparte.
        priorizadas = {
            k.replace("Sede priorizada ", ""): porcentaje(v)
            for k, v in f.items()
            if k and k.startswith("Sede priorizada")
        }
        if any(v is not None for v in priorizadas.values()):
            punto["sedesPriorizadas"] = priorizadas

        serie.append(punto)

    if not serie:
        raise ValueError("osb_ocupacion-urgencias.csv: sin filas con año y mes")

    ultima = serie[-1]
    picos = {}
    for s in SUBREDES:
        vals = [(p["subredes"][s], p) for p in serie if p["subredes"].get(s)]
        if vals:
            v, p = max(vals, key=lambda x: x[0])
            picos[s] = {"valor": round(v, 4), "periodo": f"{p['mes']} {p['anio']}"}

    salida = {
        "fuente": "Observatorio de Salud de Bogota — ocupacion de urgencias",
        "encodingOrigen": encoding,
        "desde": f"{serie[0]['mes']} {serie[0]['anio']}",
        "hasta": f"{ultima['mes']} {ultima['anio']}",
        "meses": len(serie),
        "ultimo": ultima,
        "picoHistoricoPorSubred": picos,
        "serie": serie,
    }
    escribir_json("ocupacion.json", salida)

    return {
        "meses": len(serie),
        "rango": f"{salida['desde']} -> {salida['hasta']}",
        "ultimo_total_riss": ultima["totalRiss"],
        "pico_absoluto": max(
            ((v["valor"], f"{k} {v['periodo']}") for k, v in picos.items()), default=None
        ),
    }
