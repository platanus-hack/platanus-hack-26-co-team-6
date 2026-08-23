"""Parser clinico: dictado en crudo → entidades estructuradas.

Dos ramas, y el endpoint nunca falla por culpa de la primera:

  1. Claude (`claude-opus-5`, structured outputs) — la buena.
  2. `extraccion_heuristica()` — palabras clave, `confianza: 0.35`.

Se cae a la rama 2 si no hay API key, si Claude revienta, o si devuelve algo
que no valida. La respuesta trae `motor` para que nunca tengas que adivinar
cual corrio.
"""

import logging

from anthropic import AsyncAnthropic

from .config import settings
from .schemas import ExtraccionClinica
from .prompts import prompt_triage
from .servicios_reps import SERVICIOS_SELECCIONABLES

log = logging.getLogger(__name__)

#: El prompt vive en `data/prompts/triage.txt`, no aquí. Ver app/prompts.py:
#: lo leen ESTE motor y el de TypeScript en core, desde el mismo archivo.
PROMPT_SISTEMA = prompt_triage()


def _cliente() -> AsyncAnthropic:
    # Timeout por debajo del presupuesto de 30s que core le concede a ai-core:
    # queremos caer a la heuristica antes de que el gateway nos corte.
    return AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=25.0)


async def extraer_con_claude(texto: str) -> ExtraccionClinica:
    res = await _cliente().messages.parse(
        model=settings.modelo_triage,
        max_tokens=2048,
        system=PROMPT_SISTEMA,
        messages=[{"role": "user", "content": f'Dictado:\n"""{texto}"""'}],
        output_format=ExtraccionClinica,
        output_config={"effort": settings.esfuerzo_triage},
    )

    if res.parsed_output is None:
        raise ValueError("Claude no devolvió salida parseable")

    p = res.parsed_output
    return p.model_copy(
        update={
            # Cinturon de seguridad: si alucina un codigo fuera del catalogo,
            # se descarta en silencio. Un codigo inventado vacia el ranking.
            "servicios_requeridos": [
                c for c in p.servicios_requeridos if c in SERVICIOS_SELECCIONABLES
            ],
            "signos_alarma": p.signos_alarma[:4],
        }
    )


async def extraer(texto: str) -> tuple[ExtraccionClinica, str]:
    """Devuelve (extraccion, motor). Nunca lanza."""
    from .triage_heuristico import extraccion_heuristica

    if not settings.anthropic_api_key:
        return extraccion_heuristica(texto), "heuristica"

    try:
        return await extraer_con_claude(texto), "claude"
    except Exception:
        log.exception("[pulso] triaje con Claude falló, usando heurística")
        return extraccion_heuristica(texto), "heuristica"
