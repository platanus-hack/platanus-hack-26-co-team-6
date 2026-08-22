"""
Inventario de data/ -> data/CATALOGO.md

Contesta, sin abrir un solo archivo, las tres preguntas que el equipo se hace
cada vez que mira esa carpeta:

    ¿que es este archivo?
    ¿cubre Bogota o me va a hacer perder la tarde?
    ¿alguien lo esta usando ya?

Ademas detecta dos cosas que se pagan caro:
  - archivos en data/ que nadie declaro en fuentes.py (huerfanos)
  - fuentes declaradas cuyo archivo ya no existe (rutas muertas)
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path

from comun import DATOS, leer_csv, leer_json, leer_texto, reparar_mojibake, sospechoso
from fuentes import FUENTES

ICONO = {"usable": "OK", "truncado": "ROTO", "metadato": "meta"}

# Extensiones que contamos como fuente de datos. Lo demas es ruido.
EXTENSIONES = {".csv", ".json", ".geojson", ".xlsx", ".xls", ".txt"}


def _medir(ruta: Path, sep: str, reparar: bool = False) -> dict:
    """Filas, columnas, encoding y mojibake residual. Nunca revienta."""
    info = {"bytes": ruta.stat().st_size, "filas": None, "columnas": None, "encoding": None}
    try:
        # Deteccion de mojibake ANTES de nada: caracteres de control C1 en el
        # texto significan que el archivo viene de un codepage DOS y que
        # cualquiera que lo lea "normal" va a leer basura. Fue exactamente lo
        # que paso con llamadas123.csv.
        texto, _ = leer_texto(ruta)
        crudos = sospechoso(texto)
        if crudos:
            info["mojibake"] = crudos
            info["mojibakeReparado"] = reparar and sospechoso(reparar_mojibake(texto)) == 0

        if ruta.suffix == ".csv":
            filas, enc = leer_csv(ruta, sep, reparar=reparar)
            info.update(filas=len(filas), encoding=enc)
            if filas:
                info["columnas"] = len(filas[0])
        elif ruta.suffix in {".json", ".geojson"}:
            datos = leer_json(ruta)
            _, enc = leer_texto(ruta)
            info["encoding"] = enc
            if isinstance(datos, list):
                info["filas"] = len(datos)
            elif isinstance(datos, dict):
                if "features" in datos:
                    info["filas"] = len(datos["features"])
                elif "concept" in datos:
                    info["filas"] = len(datos["concept"])
    except Exception as e:  # noqa: BLE001 — el catalogo nunca debe tumbar el pipeline
        info["error"] = f"{type(e).__name__}: {e}"
    return info


def construir() -> dict:
    declaradas = {f.ruta for f in FUENTES}
    en_disco = {
        str(p.relative_to(DATOS)).replace("\\", "/")
        for p in DATOS.rglob("*")
        if p.is_file() and p.suffix.lower() in EXTENSIONES and "procesado" not in p.parts
    }

    huerfanos = sorted(en_disco - declaradas)
    muertas = sorted(declaradas - en_disco)

    lineas = [
        "# Catalogo de `data/`",
        "",
        "> Generado por `scripts/datos/catalogar.py`. **No editar a mano** —",
        "> se sobrescribe. Para cambiar una descripcion, edita `scripts/datos/fuentes.py`.",
        "",
        f"Ultima generacion: {dt.date.today().isoformat()}  ·  "
        f"{len(en_disco)} archivos  ·  {len(declaradas)} declarados",
        "",
    ]

    if muertas:
        lineas += [
            "## Rutas muertas",
            "",
            "Declaradas en `fuentes.py` pero el archivo no esta en disco:",
            "",
            *[f"- `{r}`" for r in muertas],
            "",
        ]

    if huerfanos:
        lineas += [
            "## Sin declarar",
            "",
            "Estan en `data/` pero nadie dijo que son. Agregalos a `fuentes.py`:",
            "",
            *[f"- `{r}`" for r in huerfanos],
            "",
        ]

    medidas = {}
    for grupo, titulo, nota in [
        ("usable", "Fuentes en uso", "Alimentan `data/procesado/` y de ahi la app."),
        ("truncado", "Fuentes rotas", "Descargas incompletas. **No usar sin re-descargar** — ver el README."),
        ("metadato", "Fichas tecnicas", "Documentan a su vecino. No traen datos."),
    ]:
        delgrupo = [f for f in FUENTES if f.estado == grupo]
        if not delgrupo:
            continue

        lineas += [f"## {titulo}", "", nota, ""]
        for f in delgrupo:
            ruta = DATOS / f.ruta
            existe = ruta.exists()
            info = _medir(ruta, f.sep, f.reparar) if existe else {}
            medidas[f.id] = info

            lineas.append(f"### `{f.ruta}`")
            lineas.append("")
            lineas.append(f"{f.que_es}")
            lineas.append("")
            if not existe:
                lineas += ["> **Falta en disco.**", ""]
                continue

            detalle = [f"cobertura **{f.cobertura}**"]
            if info.get("filas") is not None:
                detalle.append(f"{info['filas']} filas")
            if info.get("columnas"):
                detalle.append(f"{info['columnas']} columnas")
            if info.get("encoding"):
                detalle.append(f"encoding `{info['encoding']}`")
            detalle.append(f"{info.get('bytes', 0) / 1024:.0f} KB")
            lineas.append(" · ".join(detalle))
            lineas.append("")

            if f.produce:
                lineas.append(f"Produce: {', '.join(f'`{p}`' for p in f.produce)}")
                lineas.append("")
            if f.notas:
                lineas.append(f"> {f.notas}")
                lineas.append("")
            if info.get("mojibake"):
                estado_rep = (
                    "reparado por el pipeline (`reparar=True`)"
                    if info.get("mojibakeReparado")
                    else "**SIN REPARAR** — declara `reparar=True` en `fuentes.py`"
                )
                lineas.append(
                    f"> Mojibake: {info['mojibake']} caracteres de control C1 "
                    f"(codepage DOS mezclado). {estado_rep}."
                )
                lineas.append("")
            if info.get("error"):
                lineas.append(f"> No se pudo leer: `{info['error']}`")
                lineas.append("")

    (DATOS / "CATALOGO.md").write_text("\n".join(lineas), encoding="utf-8")

    return {
        "archivos_en_disco": len(en_disco),
        "declarados": len(declaradas),
        "huerfanos": huerfanos,
        "rutas_muertas": muertas,
        "medidas": medidas,
    }
