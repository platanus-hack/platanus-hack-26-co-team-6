"""Carga del prompt clínico canónico.

⚠️ EL PROMPT YA NO VIVE EN CÓDIGO. Está en `data/prompts/triage.txt`, junto
con `data/catalogos/servicios-reps.json`, y lo leen los DOS motores: este y
el de TypeScript en core.

Antes existía dos veces, idéntico carácter por carácter, y la única garantía
de que siguieran iguales era acordarse. Dos motores clínicos que discrepan sin
que nadie se entere es el bug más caro que este sistema puede tener.

Se carga una vez al arrancar. Si el archivo no está, revienta al importar y no
al primer dictado: un servicio que arranca y falla en la primera emergencia es
peor que uno que no arranca.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
from functools import lru_cache

#: app/ → ai-core/ → backend/ → apps/ → raíz del repo
RAIZ = pathlib.Path(__file__).resolve().parents[4]
PLANTILLA = RAIZ / "data/prompts/triage.txt"
CATALOGO = RAIZ / "data/catalogos/servicios-reps.json"

MARCADOR = "{{CATALOGO_SERVICIOS}}"


@lru_cache(maxsize=1)
def catalogo() -> dict:
    return json.loads(CATALOGO.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def prompt_triage() -> str:
    """El prompt renderizado, con el catálogo interpolado.

    Tiene que dar EXACTAMENTE lo mismo que el render de TypeScript. Lo fija
    `data/prompts/triage.rendered.txt` y lo verifica un test en cada lado.
    """
    plantilla = PLANTILLA.read_text(encoding="utf-8")
    # Las líneas de comentario son para quien edita el archivo, no para el
    # modelo.
    cuerpo = "\n".join(
        l for l in plantilla.splitlines() if not l.startswith("#")
    ).strip()

    cat = catalogo()
    nombres = cat["servicios"]
    # El ORDEN es el de `seleccionables`, no el numérico: cambiarlo cambiaría
    # el prompt y con él la salida del modelo. Es contenido, no formato.
    lineas = "\n".join(
        f"  {cod} = {nombres[str(cod)]}" for cod in cat["seleccionables"]
    )
    return cuerpo.replace(MARCADOR, lineas)


@lru_cache(maxsize=1)
def version_prompt() -> str:
    """Identidad del prompt. Se deriva del contenido, así que cambiar el
    prompt cambia la versión sola — nadie tiene que acordarse de subirla.

    Prepara la tarea 3.12 (saber con qué prompt se extrajo cada caso).
    """
    return hashlib.sha256(prompt_triage().encode("utf-8")).hexdigest()[:12]
