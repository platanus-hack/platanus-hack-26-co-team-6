"""Zonas de cobertura propias: una grilla de hexágonos H3 sobre Bogotá.

    uv run --directory apps/backend/ai-core python ../../../scripts/etl/grilla_h3.py

POR QUÉ NO LAS LOCALIDADES
  Son divisiones administrativas, no zonas de operación. Sumapaz tiene 780 km²
  y La Candelaria 2: mandar "una ambulancia a cubrir Sumapaz" no significa
  nada. Y sus formas son irregulares, así que no se pueden comparar ni
  subdividir.

POR QUÉ HEXÁGONOS Y NO CUADRADOS
  Un hexágono tiene 6 vecinos, TODOS a la misma distancia del centro. Un
  cuadrado tiene 4 de lado y 4 en diagonal, un 41% más lejos: cualquier
  cálculo de "la zona de al lado" queda sesgado. Uber inventó H3 justo para
  esto.

DE DÓNDE SALE LA DEMANDA, Y QUÉ SE ESTÁ ASUMIENDO
  Las llamadas del 123 NO traen coordenadas: lo más fino es la localidad. Así
  que a cada hexágono se le asigna la **densidad** de su localidad —llamadas
  por km²— y no una fracción del total.

  ⚠️ ESO ASUME QUE LA DEMANDA SE REPARTE UNIFORME DENTRO DE CADA LOCALIDAD, y
     no es cierto: dentro de Kennedy hay barrios con mucha más urgencia que
     otros. Es la mejor aproximación posible con el dato que hay, y hay que
     decirla en voz alta en vez de presentar el mapa como si fuera medido.

     Lo que SÍ es exacto es la comparación ENTRE localidades: Kennedy tiene
     1.378 llamadas en ~38 km² y Sumapaz 7 en ~780. Esa diferencia de
     densidad es real y es la que manda el reparto.
"""

from __future__ import annotations

import json
import pathlib
import sys

RAIZ = pathlib.Path(__file__).resolve().parents[2]
POLIGONOS = RAIZ / "data/geo/localidades.geojson"
SALIDA = RAIZ / "data/derivados/zonas_h3.json"

#: ~0.74 km² por hexágono. Una ambulancia cubre eso en un par de minutos, y
#: Bogotá entra en unos ~2.300 — manejable para un mapa y para un reparto.
#: Resolución 7 (5 km²) es demasiado gruesa para decidir dónde esperar;
#: la 9 (0,11 km²) da decenas de miles y no aporta.
RESOLUCION = 8


def main() -> int:
    try:
        import h3
    except ImportError:
        print("Falta h3. `uv add h3` en apps/backend/ai-core.", file=sys.stderr)
        return 1

    if not POLIGONOS.exists():
        print(f"Falta {POLIGONOS}", file=sys.stderr)
        return 1

    geo = json.loads(POLIGONOS.read_text(encoding="utf-8"))
    celdas: dict[str, dict] = {}
    sin_demanda = []

    for f in geo["features"]:
        p = f["properties"]
        nombre = p["nombre"]
        llamadas = p.get("llamadas")
        area = p.get("areaKm2") or 0

        if not llamadas or not area:
            sin_demanda.append(nombre)

        # Densidad: llamadas por km². Es lo que hace comparable una localidad
        # densa y pequeña con una enorme y vacía.
        densidad = (llamadas / area) if (llamadas and area) else 0.0

        # h3.polygon_to_cells espera el polígono en (lat, lng); el GeoJSON
        # viene en (lng, lat). Invertirlo mal pone Bogotá en el océano Índico.
        for anillo in f["geometry"]["coordinates"]:
            poly = h3.LatLngPoly([(lat, lng) for lng, lat in anillo])
            for celda in h3.polygon_to_cells(poly, RESOLUCION):
                if celda in celdas:
                    continue  # una celda en el borde cae en dos localidades
                lat, lng = h3.cell_to_latlng(celda)
                celdas[celda] = {
                    "id": celda,
                    "localidad": nombre,
                    "centroide": {"lat": round(lat, 6), "lng": round(lng, 6)},
                    "densidad": round(densidad, 4),
                }

    # Fuera lo que no se cubre. Sumapaz son 780 km² rurales sin una sola
    # llamada del 123 en el mes: 1.008 hexágonos, el 47% de la grilla, todos
    # con demanda cero. Dejarlos dentro infla el archivo, ensucia el mapa y
    # hace que el reparto proporcional le asigne cupo a un páramo.
    #
    # No es un juicio sobre Sumapaz: es que el dato dice que ahí no hay
    # demanda que cubrir, y una zona sin demanda no es una zona de cobertura.
    descartadas = [c for c in celdas.values() if c["densidad"] <= 0]
    celdas = {k: v for k, v in celdas.items() if v["densidad"] > 0}

    total = sum(c["densidad"] for c in celdas.values()) or 1.0
    for c in celdas.values():
        # Normalizada, que es lo que el motor de cobertura espera (suma 1).
        c["demandaRelativa"] = round(c["densidad"] / total, 8)

    zonas = sorted(celdas.values(), key=lambda c: -c["demandaRelativa"])

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps({
        "_fuente": "H3 res 8 sobre los polígonos oficiales de localidad (IDECA)",
        "_demanda": "Densidad de llamadas del NUSE 123 por km² de su localidad",
        "_advertencia": (
            "La demanda se reparte UNIFORME dentro de cada localidad: el 123 "
            "no trae coordenadas. La comparación ENTRE localidades sí es "
            "exacta; la de dos hexágonos de la misma localidad, no."
        ),
        "_descartado": (
            "Hexágonos con demanda cero. Sumapaz son 780 km² rurales sin una "
            "sola llamada del 123 en el mes; una zona sin demanda no es una "
            "zona de cobertura."
        ),
        "resolucion": RESOLUCION,
        "celdas": len(zonas),
        "zonas": zonas,
    }, ensure_ascii=False), encoding="utf-8")

    print(f"{len(zonas)} hexágonos (res {RESOLUCION}) → {SALIDA.relative_to(RAIZ)}")
    if descartadas:
        fuera = {c["localidad"] for c in descartadas}
        print(f"  {len(descartadas)} hexágonos descartados por demanda cero: "
              f"{', '.join(sorted(fuera))}")
    print(f"  peso: {SALIDA.stat().st_size // 1024} KB")
    if sin_demanda:
        print(f"  ⚠️ sin demanda del 123: {', '.join(sin_demanda)}")
    print("\n  Densidad por localidad (llamadas/km²):")
    vistas = {}
    for z in zonas:
        vistas.setdefault(z["localidad"], z["densidad"])
    for n, d in sorted(vistas.items(), key=lambda x: -x[1])[:6]:
        print(f"    {n:20s} {d:8.1f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
