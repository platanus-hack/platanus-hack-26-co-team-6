"""
Las fuentes chicas: ambulancias, camas, tiempos por localidad y el CodeSystem.

Ninguna manda sola en el ruteo, pero juntas dan el contexto que sostiene el
pitch y validan el catalogo de servicios que ya usa el codigo.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from comun import (  # noqa: E402
    DATOS,
    escribir_json,
    leer_csv,
    leer_json,
    limpiar,
    numero,
)
from fuentes import POR_ID, leer as leer_fuente  # noqa: E402


def _ambulancias_prestadores() -> dict:
    """225 prestadores de transporte asistencial, con su marca TAB/TAM."""
    filas, encoding = leer_fuente("transporte_especial")

    marcado = lambda f, col: bool((f.get(col) or "").strip())  # noqa: E731
    prestadores = []
    for f in filas:
        nombre = limpiar(f.get("Pestador ")) or limpiar(f.get("Sede"))
        if not nombre:
            continue
        prestadores.append(
            {
                "prestador": nombre,
                "sede": limpiar(f.get("Sede")),
                "direccion": limpiar(f.get("Dirección")),
                "telefono": limpiar(f.get("Teléfono")),
                "email": limpiar(f.get("Email")),
                # TAB / TAM, el filtro duro del tipo de movil.
                "basico": marcado(f, "BÁSICO"),
                "medicalizado": marcado(f, "MEDICALIZADO"),
                "urgencias": marcado(f, "URGENCIAS"),
            }
        )

    return {
        "fuente": "Secretaria de Salud de Bogota — transporte especial de pacientes, corte 01/07/2026",
        "encodingOrigen": encoding,
        "total": len(prestadores),
        "conBasico": sum(1 for p in prestadores if p["basico"]),
        "conMedicalizado": sum(1 for p in prestadores if p["medicalizado"]),
        "prestadores": prestadores,
    }


def _flota() -> dict:
    """Cuantas ambulancias hay en Bogota, por tipo y naturaleza."""
    filas, _ = leer_fuente("razon_ambulancias")

    detalle, total, poblacion = [], None, None
    for f in filas:
        tipo = limpiar(f.get("Tipo de ambulancia"))
        if not tipo:
            continue
        if tipo == "Poblacion proyectada" or tipo.startswith("Población"):
            poblacion = numero(f.get("Naturaleza"))
            continue
        fila = {
            "tipo": tipo,
            "naturaleza": limpiar(f.get("Naturaleza")),
            "cantidad": numero(f.get("Cantidad")),
            "tasaPor10kHab": numero(f.get("Tasa")),
        }
        if tipo == "Total":
            total = fila
        else:
            detalle.append(fila)

    medicalizadas = sum(
        d["cantidad"] or 0 for d in detalle if (d["tipo"] or "").startswith("Medical")
    )
    return {
        "fuente": "Observatorio de Salud de Bogota — razon de ambulancias",
        "detalle": detalle,
        "total": total,
        "poblacionProyectada": poblacion,
        "medicalizadas": medicalizadas,
    }


def _camas() -> dict:
    """Camas de Bogota por tipo y naturaleza. Es el prior de CAMAS_POR_COMPLEJIDAD."""
    filas, _ = leer_fuente("razon_camas")

    detalle = [
        {
            "concepto": limpiar(f.get("Conceptos")),
            "naturaleza": limpiar(f.get("Naturaleza")),
            "cantidad": numero(f.get("Cantidad")),
        }
        for f in filas
        if limpiar(f.get("Conceptos"))
    ]
    uci = sum(
        d["cantidad"] or 0
        for d in detalle
        if "Intensiva" in (d["concepto"] or "") and d["naturaleza"] != "Total"
    )
    return {
        "fuente": "Observatorio de Salud de Bogota — razon de camas",
        "detalle": detalle,
        "camasIntensivas": uci,
    }


def _tiempos() -> dict:
    """Minutos promedio al centro medico por localidad. El baseline a batir."""
    filas, _ = leer_fuente("tiempo_centro_medico")

    serie = []
    for f in filas:
        # La columna del año trae BOM en el archivo original; comun.py ya lo
        # quita al decodificar con utf-8-sig, pero la clave puede variar.
        anio = limpiar(f.get("Año")) or limpiar(next(iter(f.values()), None))
        loc, prom = limpiar(f.get("Localidad")), numero(f.get("Promedio"))
        if loc and prom is not None:
            serie.append({"anio": anio, "localidad": loc, "minutos": prom})

    ultimo = {}
    for x in serie:
        ultimo[x["localidad"]] = x["minutos"]

    return {
        "fuente": "Observatorio de Salud de Bogota — tiempo promedio al centro medico",
        "serie": serie,
        "minutosPorLocalidad": ultimo,
        "promedioCiudad": round(sum(ultimo.values()) / len(ultimo), 2) if ultimo else None,
    }


def _servicios() -> dict:
    """CodeSystem FHIR de MinSalud: los 157 servicios REPS con su codigo."""
    cs = leer_json(DATOS / POR_ID["codesystem_reps"].ruta)
    conceptos = [
        {"codigo": c.get("code"), "nombre": c.get("display")}
        for c in cs.get("concept", [])
        if c.get("code")
    ]
    return {
        "fuente": cs.get("url") or "CodeSystem REPShealthcareServices, MinSalud",
        "total": len(conceptos),
        "servicios": conceptos,
    }


def construir() -> dict:
    servicios = _servicios()
    escribir_json("servicios.json", servicios)

    ambulancias = _ambulancias_prestadores()
    escribir_json("ambulancias.json", ambulancias)

    contexto = {
        "flotaAmbulancias": _flota(),
        "camasCiudad": _camas(),
        "tiemposPorLocalidad": _tiempos(),
    }
    escribir_json("contexto.json", contexto)

    return {
        "servicios_reps": servicios["total"],
        "prestadores_ambulancia": ambulancias["total"],
        "con_medicalizado": ambulancias["conMedicalizado"],
        "ambulancias_medicalizadas_ciudad": contexto["flotaAmbulancias"]["medicalizadas"],
        "localidades_con_tiempo": len(contexto["tiemposPorLocalidad"]["minutosPorLocalidad"]),
    }
