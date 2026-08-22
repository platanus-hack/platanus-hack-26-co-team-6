"""Demanda de urgencias por localidad, desde las llamadas reales del 123.

    python3 scripts/etl/demanda_123.py

Lee `data/llamadas_123/llamadas123.csv` (9.207 llamadas del NUSE) y produce
`data/derivados/demanda_localidad.json`, que es el insumo del motor de
cobertura: cuánta demanda esperar en cada localidad, a cada hora.

LO QUE ESTE DATASET SÍ TIENE
  Localidad, fecha y hora de despacho, prioridad, tipo de incidente, edad.

LO QUE NO TIENE, Y HAY QUE SABERLO
  ⚠️ NO trae coordenadas. La unidad geográfica más fina es la LOCALIDAD (19
     en los datos, de 20 que tiene Bogotá). No se puede hacer una grilla de
     hexágonos con esto: no hay puntos que agrupar.
  ⚠️ NO trae el desenlace ni el tiempo de atención. Mide DEMANDA, no oferta
     ni desempeño.
  ⚠️ Es un corte histórico, no un flujo vivo.

El archivo viene en latin-1, no en UTF-8. Leerlo como UTF-8 rompe cada ñ y
cada tilde, y "ENGATIVA" deja de casar con "ENGATIVÁ" al cruzarlo.
"""

# El python del sistema en muchos macs es 3.9: sin esto, `datetime | None`
# revienta al importar. Este script lo corre el equipo, no solo el autor.
from __future__ import annotations

import collections
import csv
import json
import pathlib
import sys
from datetime import datetime

RAIZ = pathlib.Path(__file__).resolve().parents[2]
ENTRADA = RAIZ / "data/llamadas_123/llamadas123.csv"
SALIDA = RAIZ / "data/derivados/demanda_localidad.json"

#: Prioridades que el NUSE marca como urgentes de verdad. Son las que mueven
#: una ambulancia con prisa; las bajas se pueden diferir.
PRIORIDADES_ALTAS = {"alta", "media alta", "critica", "crítica"}


def leer_fecha(crudo: str) -> datetime | None:
    """"1/06/2026 0:40" → datetime. None si la fila viene rota."""
    for formato in ("%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y"):
        try:
            return datetime.strptime(crudo.strip(), formato)
        except (ValueError, AttributeError):
            continue
    return None


def main() -> int:
    if not ENTRADA.exists():
        print(f"No encuentro {ENTRADA}", file=sys.stderr)
        return 1

    por_localidad: dict[str, dict] = {}
    sin_fecha = 0
    total = 0

    with ENTRADA.open(encoding="latin-1") as f:
        for fila in csv.DictReader(f, delimiter=";"):
            loc = (fila.get("LOCALIDAD") or "").strip().upper()
            if not loc or loc in ("N/A", "SIN DATO"):
                continue

            total += 1
            z = por_localidad.setdefault(
                loc,
                {
                    "localidad": loc,
                    "codigo": (fila.get("CODIGO_LOCALIDAD") or "").strip(),
                    "llamadas": 0,
                    "llamadasPrioritarias": 0,
                    "porHora": [0] * 24,
                    "porDiaSemana": [0] * 7,
                    "tiposIncidente": collections.Counter(),
                },
            )
            z["llamadas"] += 1

            if (fila.get("PRIORIDAD_FINAL") or "").strip().lower() in PRIORIDADES_ALTAS:
                z["llamadasPrioritarias"] += 1

            cuando = leer_fecha(fila.get("FECHA_INICIO_DESPLAZAMIENTO_MOVIL", ""))
            if cuando is None:
                sin_fecha += 1
            else:
                z["porHora"][cuando.hour] += 1
                z["porDiaSemana"][cuando.weekday()] += 1

            tipo = (fila.get("TIPO_INCIDENTE") or "").strip()
            if tipo:
                z["tiposIncidente"][tipo] += 1

    zonas = []
    for z in por_localidad.values():
        # La fracción de la demanda total de la ciudad que cae en esta
        # localidad. Es lo que el motor usa para repartir cupos.
        z["fraccionDemanda"] = round(z["llamadas"] / total, 5) if total else 0
        z["tiposIncidente"] = [
            {"tipo": t, "n": n} for t, n in z["tiposIncidente"].most_common(5)
        ]
        zonas.append(z)

    zonas.sort(key=lambda z: -z["llamadas"])

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(
        json.dumps(
            {
                "fuente": "data/llamadas_123/llamadas123.csv (NUSE 123, Bogotá)",
                "llamadas": total,
                "sinFechaLegible": sin_fecha,
                "unidadGeografica": "localidad",
                "advertencia": (
                    "El dataset NO trae coordenadas: la unidad más fina es la "
                    "localidad. No sirve para una grilla de hexágonos. Mide "
                    "DEMANDA histórica, no oferta ni desempeño."
                ),
                "zonas": zonas,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"{total} llamadas · {len(zonas)} localidades → {SALIDA.relative_to(RAIZ)}")
    if sin_fecha:
        print(f"  ⚠️ {sin_fecha} filas sin fecha legible (no cuentan en porHora)")
    print("\n  Top 5 por demanda:")
    for z in zonas[:5]:
        pico = z["porHora"].index(max(z["porHora"]))
        print(
            f"    {z['llamadas']:5d}  {z['localidad']:22s} "
            f"{z['fraccionDemanda'] * 100:5.1f}%  pico {pico:02d}:00"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
