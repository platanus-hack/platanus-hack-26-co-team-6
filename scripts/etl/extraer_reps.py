"""
ETL REPS Bogotá → CSV listo para cargar a Supabase.
Dueño: Zaid.

    python extraer_reps.py

Produce en ./salida/:
    sedes.csv       — sedes de Bogotá, geocodificadas
    capacidad.csv   — semilla de camas del snapshot REPS 2022
    reporte.txt     — qué se pudo y qué no (LEER SIEMPRE)

═══════════════════════════════════════════════════════════════════
 LO QUE ESTE SCRIPT *NO* HACE — y es a propósito
═══════════════════════════════════════════════════════════════════
 No trae `servicio_sede` (qué servicios tiene habilitados cada sede).
 No existe un dataset nacional limpio de eso en Socrata.

 PLAN A (timebox 90 min, ni un minuto más):
   prestadores.minsalud.gov.co/habilitacion → consulta pública →
   filtrar Bogotá → exportar servicios → mapear a servicio_sede.

 PLAN B (si el Plan A pelea): llenar A MANO las ~60 sedes que
   sobreviven al filtro de urgencias + complejidad alta. Son 60 filas.
   Una persona las hace en una hora y quedan PERFECTAS para el demo.
   No gastes 6 horas peleando con un scraper. Ese no es el trabajo.
═══════════════════════════════════════════════════════════════════
"""

import csv
import json
import os
import time
from pathlib import Path
from urllib.parse import quote

import requests

SALIDA = Path(__file__).parent / "salida"
SALIDA.mkdir(exist_ok=True)

# ── Fuentes verificadas (agosto 2026) ──────────────────────────────

# Registro Especial de Prestadores y Sedes. Corte abril 2026. VIVO.
REPS_SEDES = "https://www.datos.gov.co/resource/c36g-9fc2.json"

# Registro diario de ocupación de capacidad instalada.
# ⚠️ 8.389 filas, UNA SOLA FECHA: 2022-11-30. El registro "diario"
#    obligatorio tiene un solo día vivo. Se apagó al terminar el mandato
#    COVID. Esto NO es un problema del ETL: es la evidencia de la tesis
#    de PULSO y va en la primera slide del pitch.
REPS_OCUPACION = "https://www.datos.gov.co/resource/uwc4-gvg3.json"

# El string del departamento viene así, sin punto final ni coma. No lo
# "arregles": si le pones "Bogotá D.C." el filtro devuelve 0 filas.
DEPTO_BOGOTA = "Bogotá D.C"

MAPBOX_TOKEN = os.environ.get("NEXT_PUBLIC_MAPBOX_TOKEN", "")


# ── 1. Descarga ────────────────────────────────────────────────────

def descargar_sedes(limite=20000):
    print(f"→ Descargando sedes de {DEPTO_BOGOTA}…")
    params = {
        "$where": f"departamentodededesc='{DEPTO_BOGOTA}'",
        "$limit": limite,
    }
    r = requests.get(REPS_SEDES, params=params, timeout=120)
    r.raise_for_status()
    filas = r.json()
    print(f"  {len(filas)} sedes crudas")
    return filas


def descargar_ocupacion():
    print("→ Descargando snapshot de ocupación (2022-11-30)…")
    r = requests.get(REPS_OCUPACION, params={"$limit": 50000}, timeout=120)
    r.raise_for_status()
    filas = r.json()
    print(f"  {len(filas)} filas de capacidad")
    return filas


# ── 2. Filtro ──────────────────────────────────────────────────────

def filtrar_relevantes(filas):
    """
    Del universo de ~16k sedes, quedarse solo con las que pueden recibir
    un traslado de urgencia.

    Criterio: clase IPS (no profesional independiente ni transporte).
    Sin el dataset de servicios no podemos filtrar por 1102 todavía, así
    que este es el mejor proxy disponible.
    """
    ips = [
        f for f in filas
        if "Instituciones Prestadoras" in (f.get("claseprestador") or "")
    ]
    print(f"  {len(ips)} son IPS (de {len(filas)})")

    # Heurística de tamaño: los nombres con estas palabras son casi siempre
    # instituciones con urgencias. Los consultorios se filtran solos.
    señales = ("hospital", "clinica", "clínica", "fundacion", "fundación",
               "e.s.e", "ese ", "universitario", "centro medico", "centro médico")
    grandes = [
        f for f in ips
        if any(s in (f.get("nombresede") or "").lower() for s in señales)
    ]
    print(f"  {len(grandes)} con nombre de institución con urgencias")
    return grandes


# ── 3. Geocoding ───────────────────────────────────────────────────

# ⚠️ Las direcciones bogotanas ("Cl 100 # 18-51") rompen geocoders.
#    Estas 12 están a mano, verificadas. Si el geocoder falla en alguna
#    grande, AGRÉGALA AQUÍ en vez de pelear con el geocoder.
COORDS_MANUALES = {
    "fundacion santa fe": (4.6963, -74.0308),
    "cardioinfantil": (4.7420, -74.0410),
    "shaio": (4.7010, -74.0760),
    "san ignacio": (4.6280, -74.0645),
    "mederi": (4.6180, -74.0870),
    "simon bolivar": (4.7480, -74.0350),
    "kennedy": (4.6280, -74.1560),
    "tunal": (4.5720, -74.1300),
    "santa clara": (4.5820, -74.0930),
    "country": (4.6690, -74.0530),
    "militar central": (4.6320, -74.0680),
    "palermo": (4.6350, -74.0700),
}

BOGOTA_BBOX = "-74.25,4.45,-73.98,4.84"  # descarta resultados fuera de la ciudad


def coord_manual(nombre):
    n = nombre.lower()
    for clave, coord in COORDS_MANUALES.items():
        if clave in n:
            return coord
    return None


def geocodificar(direccion, nombre):
    manual = coord_manual(nombre)
    if manual:
        return manual, "manual"

    if not MAPBOX_TOKEN:
        return None, "sin_token"

    consulta = quote(f"{direccion}, Bogotá, Colombia")
    url = (
        f"https://api.mapbox.com/geocoding/v5/mapbox.places/{consulta}.json"
        f"?bbox={BOGOTA_BBOX}&limit=1&access_token={MAPBOX_TOKEN}"
    )
    try:
        r = requests.get(url, timeout=15)
        feats = r.json().get("features", [])
        if not feats:
            return None, "sin_resultado"
        lng, lat = feats[0]["center"]
        # Cinturón: si cayó fuera de Bogotá, no sirve.
        if not (4.45 <= lat <= 4.84 and -74.25 <= lng <= -73.98):
            return None, "fuera_de_bogota"
        return (lat, lng), "mapbox"
    except Exception as e:
        return None, f"error:{e}"


# ── 4. Capacidad ───────────────────────────────────────────────────

def indexar_capacidad(filas_ocupacion):
    """codigo_habilitacion_sede → lista de tipos de cama con ocupación."""
    idx = {}
    for f in filas_ocupacion:
        cod = f.get("codigo_habilitacion_sede")
        if not cod:
            continue
        idx.setdefault(cod, []).append({
            "tipo": f.get("nombre_capacidad_instalada", "CAMAS"),
            "total": int(f.get("cantidad_ci_total_reps") or 0),
            "ocupadas": (
                int(f.get("ocupacion_ci_confirmado") or 0)
                + int(f.get("ocupacion_ci_sospechoso") or 0)
                + int(f.get("ocupacion_ci_no_covid19") or 0)
            ),
        })
    return idx


def inferir_complejidad(camas):
    """Sin el dataset de servicios, el tamaño es el mejor proxy que hay."""
    total = sum(c["total"] for c in camas)
    tiene_uci = any("UCI" in c["tipo"] or "Intensivo" in c["tipo"] for c in camas)
    if tiene_uci or total > 120:
        return "alta"
    if total > 40:
        return "media"
    return "baja"


# ── Main ───────────────────────────────────────────────────────────

def main():
    inicio = time.time()
    sedes = filtrar_relevantes(descargar_sedes())
    capacidad = indexar_capacidad(descargar_ocupacion())

    filas_sede, filas_cap = [], []
    stats = {"manual": 0, "mapbox": 0, "fallidas": 0}
    fallidas = []

    print(f"→ Geocodificando {len(sedes)} sedes…")
    for i, s in enumerate(sedes, 1):
        codigo = s.get("codigohabilitacionsede")
        nombre = s.get("nombresede") or s.get("nombreprestador") or ""
        direccion = s.get("direcci_nsede") or s.get("direccionprestador") or ""
        if not codigo or not direccion:
            continue

        coord, fuente = geocodificar(direccion, nombre)
        if coord is None:
            stats["fallidas"] += 1
            fallidas.append(f"{codigo}\t{nombre}\t{direccion}\t{fuente}")
            continue
        stats["manual" if fuente == "manual" else "mapbox"] += 1

        camas = capacidad.get(codigo, [])
        filas_sede.append({
            "codigo": codigo,
            "nombre": nombre,
            "direccion": direccion,
            "localidad": s.get("municipiosededesc", "BOGOTÁ"),
            "lat": coord[0],
            "lng": coord[1],
            "naturaleza": s.get("naturalezajuridica", "Privada"),
            "complejidad": inferir_complejidad(camas),
            "telefono": s.get("t_lefonosede") or s.get("telefonoprestador") or "",
        })
        for c in camas:
            filas_cap.append({
                "codigo_sede": codigo,
                "tipo_capacidad": c["tipo"],
                "camas_reps": c["total"],
                "ocupadas_snapshot": c["ocupadas"],
            })

        if i % 25 == 0:
            print(f"  {i}/{len(sedes)}…")
        if MAPBOX_TOKEN and fuente == "mapbox":
            time.sleep(0.12)  # respetar el rate limit del geocoder

    escribir_csv(SALIDA / "sedes.csv", filas_sede)
    escribir_csv(SALIDA / "capacidad.csv", filas_cap)

    reporte = [
        f"ETL PULSO — {time.strftime('%Y-%m-%d %H:%M')}",
        f"Duración: {time.time() - inicio:.0f}s",
        "",
        f"Sedes geocodificadas: {len(filas_sede)}",
        f"  · a mano:  {stats['manual']}",
        f"  · Mapbox:  {stats['mapbox']}",
        f"  · fallidas:{stats['fallidas']}",
        f"Filas de capacidad: {len(filas_cap)}",
        "",
        "⚠️ FALTA servicio_sede. Ver el docstring de este archivo (Plan A / Plan B).",
        "",
        "── Fallidas (agregar a COORDS_MANUALES si alguna es importante) ──",
        *fallidas[:60],
    ]
    (SALIDA / "reporte.txt").write_text("\n".join(reporte), encoding="utf-8")
    print("\n".join(reporte[:10]))
    print(f"\n✓ Listo. Revisa {SALIDA}")
    print("  SIGUIENTE PASO OBLIGATORIO: pinta sedes.csv en un mapa y MÍRALO.")
    print("  Si hay un punto en el Amazonas o en el mar, el geocoding mintió.")


def escribir_csv(ruta, filas):
    if not filas:
        return
    with open(ruta, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(filas[0].keys()))
        w.writeheader()
        w.writerows(filas)
    print(f"  ✓ {ruta.name}: {len(filas)} filas")


if __name__ == "__main__":
    main()
