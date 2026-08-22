"""
Utilidades compartidas del pipeline de datos.

Todo aqui es stdlib pura, a proposito: este pipeline tiene que correr en la
maquina de cualquiera del equipo sin pip install, sin venv, sin pelear. Si
alguna vez necesita una dependencia, primero pregunta si de verdad la necesita.

Los problemas que resuelve este modulo son los que tiene la carpeta data/ de
verdad, no problemas hipoteticos:

  - Tres encodings distintos conviviendo (latin-1, utf-8, utf-8 con BOM).
  - Separador ';' y coma decimal, formato colombiano.
  - Porcentajes como texto: "132,52%".
  - Coordenadas lat/lng invertidas en algunas filas.
  - Nombres de la misma institucion escritos distinto en cada fuente.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DATOS = RAIZ / "data"
SALIDA = DATOS / "procesado"

# El orden importa: utf-8-sig primero porque un archivo con BOM tambien decodea
# como utf-8 pero deja un ﻿ pegado al primer nombre de columna, y entonces
# fila["Año"] falla con un KeyError que no dice nada.
ENCODINGS = ("utf-8-sig", "utf-8", "cp1252", "latin-1")

# Caja de Bogota, generosa. Sirve para detectar coordenadas invertidas.
BOGOTA_LAT = (3.9, 5.1)
BOGOTA_LNG = (-75.0, -73.5)


# ── Lectura ───────────────────────────────────────────────────────


def leer_texto(ruta: Path) -> tuple[str, str]:
    """Devuelve (texto, encoding_usado). Prueba en orden hasta que uno decodea."""
    crudo = ruta.read_bytes()
    for enc in ENCODINGS:
        try:
            return crudo.decode(enc), enc
        except UnicodeDecodeError:
            continue
    # latin-1 nunca falla, asi que llegar aqui significa un archivo binario.
    raise ValueError(f"{ruta.name}: no es texto en ningun encoding conocido")


# ── Reparacion de mojibake ────────────────────────────────────────

# llamadas123.csv esta escrito en DOS codepages MEZCLADOS. No es un error de
# lectura nuestro: el archivo trae, en la misma linea, bytes de cp850 y de
# latin-1. Cualquier encoding que elijas deja algo roto:
#
#   byte   latin-1   cp850   lo correcto
#   0xA4     ¤         ñ       ñ    "A¤os"        -> "Años"      (5909 veces)
#   0x90    ctrl       É       É    "USAQU?N"     -> "USAQUÉN"    (534)
#   0xB5     µ         Á       Á    "TORµCICO"    -> "TORÁCICO"   (355)
#   0xD1     Ñ         Ð       Ñ    "ACOMPAÑAM"   -> ya correcto  (281)
#
# Se decodifica como latin-1 (que nunca falla y conserva los bytes 1:1) y se
# reparan los tres que quedan mal. Es una tabla explicita y no un "adivina el
# encoding" a proposito: son 4 bytes, se verificaron uno por uno contra su
# contexto, y una heuristica podria romper un caracter legitimo.
#
# Se aplica SOLO a las fuentes que lo declaran en fuentes.py.
REPARACIONES_CP850 = {
    "\xa4": "ñ",
    "\x90": "É",
    "\xb5": "Á",
}

# Bytes 0x80-0x9F. Texto de verdad nunca los tiene: si aparecen despues de
# decodificar, el archivo viene de un codepage DOS y hay que mirarlo.
_C1 = re.compile(r"[\x80-\x9f]")


def reparar_mojibake(texto: str) -> str:
    for malo, bueno in REPARACIONES_CP850.items():
        texto = texto.replace(malo, bueno)
    return texto


def sospechoso(texto: str) -> int:
    """Cuantos caracteres de control C1 quedaron. > 0 significa mojibake."""
    return len(_C1.findall(texto))


def leer_csv(ruta: Path, sep: str = ";", reparar: bool = False) -> tuple[list[dict], str]:
    """Filas como dicts + el encoding que funciono."""
    texto, enc = leer_texto(ruta)
    if reparar:
        texto = reparar_mojibake(texto)
    filas = list(csv.DictReader(io.StringIO(texto), delimiter=sep))
    # Algunos exports traen filas vacias al final para cuadrar una tabla.
    filas = [f for f in filas if any((v or "").strip() for v in f.values())]
    return filas, enc


def leer_json(ruta: Path):
    texto, _ = leer_texto(ruta)
    return json.loads(texto)


# ── Numeros al estilo colombiano ──────────────────────────────────


def numero(valor: str | float | None) -> float | None:
    """
    "132,52%" -> 132.52   ·   "-74,05710014" -> -74.0571   ·   "1.234,5" -> 1234.5

    None cuando no hay nada que leer, para poder distinguir "no vino el dato"
    de "vino cero". Esa diferencia importa en ocupacion de camas.
    """
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)

    s = valor.strip().replace("%", "").replace(" ", "")
    if not s or s in {"N/A", "-", "n/a", "ND"}:
        return None

    # Separador de miles con punto Y decimal con coma: "1.234,5".
    if "," in s and "." in s:
        s = s.replace(".", "")
    s = s.replace(",", ".")

    try:
        return float(s)
    except ValueError:
        return None


def porcentaje(valor: str | None) -> float | None:
    """"132,52%" -> 1.3252. Ojo: la ocupacion de urgencias pasa de 1 a menudo."""
    n = numero(valor)
    return None if n is None else n / 100


# ── Texto ─────────────────────────────────────────────────────────


# Ruido que aparece en el nombre de una institucion en una fuente y no en otra.
RUIDO = {
    "ips", "sede", "principal", "de", "del", "la", "el", "los", "las", "y",
    "bogota", "dc", "ese", "sa", "sas", "ltda", "eu", "spa", "e", "u",
}


def normalizar_nombre(s: str | None) -> str:
    """
    Nombre canonico para cruzar fuentes: sin tildes, sin puntuacion, sin las
    palabras de relleno que cada entidad escribe a su manera.

        "Clínica La Inmaculada"      -> "clinica inmaculada"
        "CLINICA LA INMACULADA S.A." -> "clinica inmaculada"
    """
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    palabras = [p for p in s.split() if p and p not in RUIDO]
    return " ".join(palabras)


def limpiar(s: str | None) -> str | None:
    """Espacios de sobra fuera; cadena vacia -> None."""
    if s is None:
        return None
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


# ── Geografia ─────────────────────────────────────────────────────


def en_bogota(lat: float, lng: float) -> bool:
    return BOGOTA_LAT[0] < lat < BOGOTA_LAT[1] and BOGOTA_LNG[0] < lng < BOGOTA_LNG[1]


def corregir_coord(lat: float | None, lng: float | None) -> tuple[float, float] | None:
    """
    Devuelve (lat, lng) validas para Bogota, o None si no hay forma.

    En osb_ofertasrv-ips-urgencias.csv hay filas con lat y lng al reves
    (Hospital de Usme, Centro de Salud Patio Bonito). Sin esta correccion esas
    sedes caen en medio del oceano, el filtro por radio nunca las alcanza, y
    desaparecen del ranking sin un solo error en los logs.
    """
    if lat is None or lng is None:
        return None
    if en_bogota(lat, lng):
        return (lat, lng)
    if en_bogota(lng, lat):
        return (lng, lat)
    return None


def distancia_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine. Suficiente para cruzar fuentes por cercania."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(a))


# ── Escritura ─────────────────────────────────────────────────────


def escribir_json(nombre: str, contenido) -> Path:
    """Escribe en data/procesado/. UTF-8 de verdad, con salto de linea final."""
    SALIDA.mkdir(parents=True, exist_ok=True)
    ruta = SALIDA / nombre
    ruta.write_text(
        json.dumps(contenido, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return ruta
