"""
Catalogo de sedes: 84 IPS de urgencias de Bogota, reales.

Reemplaza las 14 semillas escritas a mano de sedes/semillas.ts.

═══════════════════════════════════════════════════════════════════
 LA CADENA DE CRUCE — y por que el codigo importa tanto
═══════════════════════════════════════════════════════════════════
 osb_ofertasrv-ips-urgencias.csv trae las 84 sedes con urgencias, pero NO
 trae codigo. Se les pega uno cruzando por nombre normalizado contra el
 directorio REPS de Bogota (reps_bogota/sedes.json): 83 de 84 con match
 unico.

 ⚠️ EL CAMPO CORRECTO ES `codigohabilitacionsede`, DE 12 DIGITOS.
    NO `codigoprestador`, de 10.

    Se intento primero con `codigo_pre` de ins.geojson y salio mal en
    silencio: ese campo es el PRESTADOR, y una subred entera (Centro
    Oriente, por ejemplo) es UNA sola ESE con decenas de sedes. Resultado:
    9 sedes distintas compartiendo el codigo 1100130289, y `porCodigo()`
    en sedes.service.ts devolviendo la primera que encontrara. Despachar a
    Santa Clara podia resolverse a San Blas.

    Este modulo verifica la unicidad y REVIENTA si vuelve a pasar.

 La capacidad y la ocupacion del REPS usan un codigo de 10 digitos mas un
 numero de sede de 2. Concatenados dan la PK de 12. Los nombres de los
 campos mienten en las tres fuentes; las longitudes no.

═══════════════════════════════════════════════════════════════════
 QUE ES REAL Y QUE ES INFERIDO — leer antes del pitch
═══════════════════════════════════════════════════════════════════
 REAL, sale tal cual de datos abiertos:
   nombre, direccion, localidad, subred, telefono, naturaleza,
   complejidad, coordenadas, y el codigo de habilitacion de sede.

 REAL para la mayoria, inferido para el resto — cada sede dice cual le toco
 en su campo `origenCamas`:
   camas[]  la mayoria trae camas y ocupacion MEDIDAS del registro REPS del
            2022-11-30. Otras traen el total de capacidad instalada REPS con
            la ocupacion de su subred. Las que no estan en ninguno caen a un
            prior por complejidad.

 INFERIDO siempre, y marcado con `serviciosInferidos: true`:
   servicios[]  REPS no publica abierto que servicios tiene habilitado cada
                sede. Se derivan del nivel de complejidad, que SI es oficial.

 Si el jurado pregunta "¿de donde sacaron esto?", cada sede trae los campos
 `origenCodigo` y `origenCamas` con la respuesta.

 UNA NOTA SOBRE LAS SEDES QUE REPORTAN 0% DE OCUPACION:
 hay cinco, todas de complejidad baja y de 2 a 19 camas, y el registro REPS
 es internamente consistente (disponibles = total). Se dejan tal cual: para
 un centro de salud de 2 camas en Nazareth, estar vacio es lo normal, y una
 sede vacia SI es buen destino para un caso leve. El filtro duro de
 servicios impide que reciban un triage 1 — con complejidad baja solo tienen
 urgencias y toma de muestras.
═══════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import collections
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from comun import (  # noqa: E402
    DATOS,
    corregir_coord,
    escribir_json,
    leer_json,
    limpiar,
    normalizar_nombre,
    numero,
    porcentaje,
)
from fuentes import POR_ID, leer as leer_fuente  # noqa: E402

# ── Servicios REPS, espejo de catalogo/servicios-reps.ts ──────────

URGENCIAS = 1102
UCI_NEONATAL, UCI_PEDIATRICO, UCI_ADULTOS = 108, 109, 110
CIRUGIA_CABEZA_CUELLO, CIRUGIA_GENERAL, NEUROCIRUGIA = 201, 203, 245
GINECOBSTETRICIA = 320
HEMODINAMIA, IMAGENES_IONIZANTES, TOMA_MUESTRAS_LAB = 743, 744, 712

# Res. 3100/2019: la complejidad determina que puede resolver una sede.
# Una IPS de baja complejidad estabiliza y remite; no opera un politrauma.
PERFIL_POR_COMPLEJIDAD = {
    "baja": [URGENCIAS, TOMA_MUESTRAS_LAB],
    "media": [
        URGENCIAS, TOMA_MUESTRAS_LAB, IMAGENES_IONIZANTES,
        CIRUGIA_GENERAL, GINECOBSTETRICIA, UCI_ADULTOS,
    ],
    "alta": [
        URGENCIAS, TOMA_MUESTRAS_LAB, IMAGENES_IONIZANTES,
        CIRUGIA_GENERAL, CIRUGIA_CABEZA_CUELLO, GINECOBSTETRICIA,
        NEUROCIRUGIA, HEMODINAMIA,
        UCI_ADULTOS, UCI_PEDIATRICO, UCI_NEONATAL,
    ],
}

COMPLEJIDAD = {"BAJA": "baja", "MEDIANA": "media", "MEDIA": "media", "ALTA": "alta"}

# Ultimo recurso, solo para las sedes que no aparecen en ningun registro de
# capacidad. Sale de repartir las camas reales de Bogota entre las 84 sedes,
# ponderando por complejidad. Prior declarado, no medicion.
CAMAS_PRIOR = {
    "baja": [("CAMAS-Adultos", 24)],
    "media": [("CAMAS-Adultos", 90), ("CAMAS-UCI Adultos", 8)],
    "alta": [
        ("CAMAS-Adultos", 180),
        ("CAMAS-UCI Adultos", 34),
        ("CAMAS-UCI Pediátrica", 10),
    ],
}

# Sin subred conocida asumimos apretado: es lo conservador aqui, porque da
# peor score y por tanto no le regala pacientes a una sede que no sabemos si
# puede recibirlos.
OCUPACION_DESCONOCIDA = 0.85


def _pk(codigo: str | None, numero_sede: str | None) -> str | None:
    """
    Codigo de 10 digitos + numero de sede de 2 = la PK de 12 digitos.

    Las tres fuentes REPS llaman `c_digo_sede` / `codigo_habilitacion_sede` a
    un campo que en realidad es el prestador. La PK de verdad se arma aqui.
    """
    if not codigo:
        return None
    return f"{codigo}{str(numero_sede or '').strip().zfill(2)}"


def _canonizar(descripcion: str) -> str:
    """
    Normaliza el nombre del tipo de cama.

    ⚠️ ocupacionBase() en congestion.service.ts pondera doble las camas de UCI
       con la regex /UCI|Intensivo/i. Esa regex NO matchea "Intensiva"
       (femenino), que es justo como lo escribe el REPS: "Intensiva Adultos".
       Por eso aqui se emite siempre "CAMAS-UCI ...": la ponderacion de UCI
       depende de que esta cadena diga UCI.
    """
    limpio = descripcion.replace("CAMAS-", "").strip()
    bajo = limpio.lower()

    if "intensiv" in bajo:
        if "neonat" in bajo:
            return "CAMAS-UCI Neonatal"
        if "pediátr" in bajo or "pediatr" in bajo:
            return "CAMAS-UCI Pediátrica"
        if "quemado" in bajo:
            return "CAMAS-UCI Quemados"
        return "CAMAS-UCI Adultos"

    return f"CAMAS-{limpio}"


def _directorio_reps() -> dict[str, list[dict]]:
    """Directorio REPS de Bogota, indexado por nombre de sede normalizado."""
    reps = leer_json(DATOS / POR_ID["reps_sedes_bogota"].ruta)
    idx: dict[str, list[dict]] = collections.defaultdict(list)
    for r in reps:
        idx[normalizar_nombre(r.get("nombresede"))].append(r)
    return idx


def _camas_medidas() -> dict[str, list[dict]]:
    """Camas por sede del registro de ocupacion 2022 — total Y ocupadas."""
    filas = leer_json(DATOS / POR_ID["reps_ocupacion_bogota"].ruta)
    por_sede: dict[str, list[dict]] = collections.defaultdict(list)

    for r in filas:
        nombre = limpiar(r.get("nombre_capacidad_instalada")) or ""
        # Solo camas. CAMILLAS y SILLAS son observacion, no hospitalizacion.
        if not nombre.startswith("CAMAS-"):
            continue
        pk = _pk(r.get("codigo_habilitacion_sede"), r.get("numero_sede"))
        total = numero(r.get("cantidad_ci_total_reps"))
        if not pk or not total or total <= 0:
            continue
        ocupadas = numero(r.get("ocupacion_ci_no_covid19")) or 0
        por_sede[pk].append(
            {
                "tipo": _canonizar(nombre),
                "total": int(total),
                "ocupadasSnapshot": int(ocupadas),
            }
        )
    return por_sede


def _camas_capacidad() -> dict[str, list[dict]]:
    """Camas por sede de capacidad instalada. Trae total, no ocupacion."""
    filas = leer_json(DATOS / POR_ID["reps_capacidad_bogota"].ruta)
    por_sede: dict[str, list[dict]] = collections.defaultdict(list)

    for r in filas:
        if limpiar(r.get("nom_grupo_capacidad")) != "CAMAS":
            continue
        pk = _pk(r.get("c_digo_sede"), r.get("n_mero_sede"))
        total = numero(r.get("num_cantidad_capacidad_instalada"))
        if not pk or not total or total <= 0:
            continue
        desc = limpiar(r.get("nom_descripcion_capacidad")) or "Adultos"
        por_sede[pk].append({"tipo": _canonizar(desc), "total": int(total)})
    return por_sede


def _ocupacion_por_subred() -> tuple[dict[str, float], str]:
    """Ultima ocupacion mensual publicada, por subred. Devuelve (mapa, periodo)."""
    filas, _ = leer_fuente("ocupacion_urgencias")
    con_anio = [f for f in filas if limpiar(f.get("Año"))]
    if not con_anio:
        return {}, "sin dato"

    ultima = con_anio[-1]
    mapa = {}
    for s in ("Norte", "Centro Oriente", "Sur", "Sur Occidente"):
        v = porcentaje(ultima.get(s))
        if v is not None:
            mapa[s] = v
    return mapa, f"{limpiar(ultima.get('Mes'))} {limpiar(ultima.get('Año'))}"


def construir() -> dict:
    filas, encoding = leer_fuente("ips_urgencias")
    directorio = _directorio_reps()
    medidas = _camas_medidas()
    capacidad = _camas_capacidad()
    ocupacion, periodo = _ocupacion_por_subred()

    sedes = []
    diag = {
        "leidas": len(filas),
        "encoding_origen": encoding,
        "coords_corregidas": [],
        "sin_coord": [],
        "codigo_reps": 0,
        "codigo_ambiguo": [],
        "codigo_generado": [],
        "camas_medidas": 0,
        "camas_capacidad": 0,
        "camas_prior": 0,
        "periodo_ocupacion_subred": periodo,
        "ocupacion_por_subred": ocupacion,
    }

    for i, f in enumerate(filas):
        nombre = limpiar(f.get("sede_nombre"))
        if not nombre:
            continue

        lat_cruda, lng_cruda = numero(f.get("Latitud")), numero(f.get("Longitud"))
        coord = corregir_coord(lat_cruda, lng_cruda)
        if coord is None:
            diag["sin_coord"].append(nombre)
            continue
        if (lat_cruda, lng_cruda) != coord:
            diag["coords_corregidas"].append(nombre)
        lat, lng = coord

        # ── Codigo: PK de sede del directorio REPS ────────────────
        candidatos = directorio.get(normalizar_nombre(nombre), [])
        if len(candidatos) == 1:
            elegido, origen_codigo = candidatos[0], "reps"
            diag["codigo_reps"] += 1
        elif len(candidatos) > 1:
            # Mismo nombre en varias sedes: desempata la direccion.
            objetivo = normalizar_nombre(f.get("direccion"))
            elegido = next(
                (
                    c
                    for c in candidatos
                    if normalizar_nombre(c.get("direcci_nsede")) == objetivo
                ),
                candidatos[0],
            )
            origen_codigo = "reps-ambiguo"
            diag["codigo_ambiguo"].append(nombre)
        else:
            elegido, origen_codigo = None, "generado"
            diag["codigo_generado"].append(nombre)

        codigo = (
            limpiar((elegido or {}).get("codigohabilitacionsede"))
            or f"BOG-U-{i + 1:04d}"
        )

        complejidad = COMPLEJIDAD.get(
            (f.get("Complejidad") or "").strip().upper(), "baja"
        )
        subred = limpiar(f.get("Subred"))
        ocup = ocupacion.get(subred or "", OCUPACION_DESCONOCIDA)

        # ── Camas: medidas > capacidad instalada > prior ──────────
        if codigo in medidas:
            camas, origen_camas = medidas[codigo], "reps-2022-medida"
            diag["camas_medidas"] += 1
        elif codigo in capacidad:
            # Hay total real pero no ocupacion: se le aplica la de su subred.
            camas = [
                {**c, "ocupadasSnapshot": round(c["total"] * ocup)}
                for c in capacidad[codigo]
            ]
            origen_camas = "reps-capacidad+subred"
            diag["camas_capacidad"] += 1
        else:
            camas = [
                {"tipo": t, "total": n, "ocupadasSnapshot": round(n * ocup)}
                for t, n in CAMAS_PRIOR[complejidad]
            ]
            origen_camas = "prior-complejidad+subred"
            diag["camas_prior"] += 1

        sedes.append(
            {
                "codigo": codigo,
                "nombre": nombre,
                "direccion": limpiar(f.get("direccion")) or "",
                "localidad": limpiar(f.get("Localidad")),
                "coord": {"lat": round(lat, 6), "lng": round(lng, 6)},
                "naturaleza": limpiar(f.get("Naturaleza jurídica")) or "Privada",
                "complejidad": complejidad,
                "telefono": limpiar(f.get("telefono")),
                "servicios": PERFIL_POR_COMPLEJIDAD[complejidad],
                "camas": camas,
                # Trazabilidad: de donde salio cada cosa.
                "subred": subred,
                "serviciosInferidos": True,
                "origenCodigo": origen_codigo,
                "origenCamas": origen_camas,
                "ocupacionSubred": round(ocup, 4),
                "ocupacionSubredEsReal": subred in ocupacion,
            }
        )

    # ── El codigo es la PK del sistema entero ─────────────────────
    #
    # sedes.service.ts hace porCodigo() con un find(): dos sedes con el mismo
    # codigo significa despachar a una y resolver a otra. Ya paso una vez, con
    # el codigo de prestador. No se deja pasar en silencio otra vez.
    repetidos = {
        c: n
        for c, n in collections.Counter(s["codigo"] for s in sedes).items()
        if n > 1
    }
    if repetidos:
        raise ValueError(
            f"codigos de sede duplicados, la PK no es unica: {repetidos}. "
            "Revisa el cruce contra el directorio REPS en _directorio_reps()."
        )

    escribir_json("sedes.json", sedes)
    diag["escritas"] = len(sedes)
    diag["codigos_unicos"] = len({s["codigo"] for s in sedes})
    return diag
