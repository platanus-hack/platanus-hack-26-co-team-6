"""Renderiza el prompt clínico canónico y escribe el golden.

    python3 scripts/prompts/render.py

Los dos motores —ai-core en Python y core en TypeScript— leen el MISMO
`data/prompts/triage.txt` y le interpolan el MISMO catálogo. Este script
produce `data/prompts/triage.rendered.txt`, y cada lado tiene un test que
compara su render contra ese archivo, carácter por carácter.

POR QUÉ UN GOLDEN Y NO UNA COMPARACIÓN DIRECTA
  Comparar Python contra TypeScript exigiría levantar los dos runtimes en el
  mismo test. Con un golden, cada lado se verifica solo en su propio CI, y si
  uno se desvía el diff sale en su suite — no en un job cruzado que nadie
  mira.

Corre esto cada vez que cambies el prompt o el catálogo. Si no lo corres, los
tests fallan con el diff exacto, que es justamente lo que se quiere.
"""

from __future__ import annotations

import hashlib
import json
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parents[2]
CATALOGO = RAIZ / "data/catalogos/servicios-reps.json"
PROMPTS = RAIZ / "data/prompts"

#: Cada prompt canónico y su golden. Agregar uno es agregar una línea.
NOMBRES = ("triage", "sbar")

MARCADOR = "{{CATALOGO_SERVICIOS}}"


def cargar_catalogo() -> dict:
    return json.loads(CATALOGO.read_text(encoding="utf-8"))


def lineas_catalogo(catalogo: dict) -> str:
    """Las líneas de códigos que van dentro del prompt.

    El ORDEN es el de `seleccionables`, no el numérico: cambiarlo cambiaría
    el prompt y por lo tanto la salida del modelo. Es contenido, no formato.
    """
    nombres = catalogo["servicios"]
    return "\n".join(
        f"  {cod} = {nombres[str(cod)]}" for cod in catalogo["seleccionables"]
    )


def renderizar(nombre: str = "triage") -> str:
    plantilla = (PROMPTS / f"{nombre}.txt").read_text(encoding="utf-8")
    # Las líneas de comentario son para quien edita el archivo, no para el
    # modelo. Se quitan antes de interpolar.
    cuerpo = "\n".join(
        l for l in plantilla.splitlines() if not l.startswith("#")
    ).strip()
    return cuerpo.replace(MARCADOR, lineas_catalogo(cargar_catalogo()))


def version(nombre: str = "triage") -> str:
    """Identidad del prompt renderizado. Prepara la tarea 3.12.

    Se deriva del contenido: cambiar el prompt cambia la versión sola, sin
    que nadie tenga que acordarse de subir un número.
    """
    return hashlib.sha256(renderizar(nombre).encode("utf-8")).hexdigest()[:12]


def main() -> int:
    for nombre in NOMBRES:
        render = renderizar(nombre)
        golden = PROMPTS / f"{nombre}.rendered.txt"
        golden.write_text(render, encoding="utf-8")
        print(
            f"{golden.relative_to(RAIZ)} · {len(render)} caracteres "
            f"· versión {version(nombre)}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
