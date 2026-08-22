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
from .servicios_reps import (
    CIRUGIA_GENERAL,
    HEMODINAMIA,
    IMAGENES_IONIZANTES,
    NEUROCIRUGIA,
    SERVICIOS_SELECCIONABLES,
    UCI_ADULTOS,
    UCI_PEDIATRICO,
    nombre_servicio,
)

log = logging.getLogger(__name__)

_CATALOGO = "\n".join(
    f"  {c} = {nombre_servicio(c)}" for c in SERVICIOS_SELECCIONABLES
)

PROMPT_SISTEMA = f"""Eres el motor de extraccion clinica de PULSO, un sistema colombiano de ruteo de urgencias.

Recibes el dictado de un paramedico o medico de urgencias, en espanol colombiano, con jerga clinica, abreviaturas y errores de transcripcion de voz. Devuelves entidades estructuradas.

CONTEXTO NORMATIVO:
- Triage segun Resolucion 5596 de 2015 (Colombia), 5 niveles.
- Los servicios se identifican con codigos del REPS (Registro Especial de Prestadores de Servicios de Salud) de MinSalud.

CODIGOS DE SERVICIO PERMITIDOS (no inventes otros):
{_CATALOGO}

REGLAS:
1. Solo pide servicios que este caso realmente necesita para resolverse.
   Un infarto con supradesnivel del ST necesita {HEMODINAMIA} (hemodinamia) y {UCI_ADULTOS} (UCI adultos).
   Un ACV necesita {NEUROCIRUGIA} (neurocirugia), {UCI_ADULTOS} e {IMAGENES_IONIZANTES} (imagenes).
   Un politrauma pediatrico necesita {CIRUGIA_GENERAL} (cirugia general) y {UCI_PEDIATRICO} (UCI pediatrica).
   No pidas UCI si el paciente esta estable y no la necesita: pedir de mas descarta sedes viables.
2. No incluyas 1102 (urgencias) en serviciosRequeridos: el sistema lo agrega siempre.
3. Si el dictado no da la edad o el sexo, devuelve null / "desconocido". No inventes.
4. Si el dictado es ambiguo o muy corto, baja la confianza. Es preferible confianza baja que un dato inventado.
5. Ante duda entre dos niveles de triage, escoge el MAS grave. En urgencias el falso negativo mata.
6. NUNCA inventes un codigo CIE-10. Si no estas seguro, devuelve null en dxCie10 y describe el cuadro en dxDescripcion."""


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
