"""Mensaje suelto de WhatsApp → una acción decidida, con argumentos en JSON.

El modelo elige UNA herramienta de `herramientas.py` y devuelve sus argumentos.
Este servicio no ejecuta nada: ai-core no tiene estado ni base de datos. Quien
ejecuta es `core` (o el servicio de voz), que sí sabe de qué caso y de qué
teléfono se trata.

Sin ANTHROPIC_API_KEY cae a un clasificador por palabras clave, igual que el
triaje. Nunca lanza: una decisión mala se puede confirmar con el paramédico;
una excepción deja el mensaje sin respuesta.
"""

import logging
import re
import time
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from anthropic import AsyncAnthropic

from ..config import settings
from .herramientas import (
    HERRAMIENTAS,
    NO_ENTENDIDO,
    NOMBRES_HERRAMIENTAS,
    PROMPT_SISTEMA,
)

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _cliente() -> AsyncAnthropic:
    """Uno por proceso. Ver la nota en `app/triage.py`."""
    return AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=20.0)


@dataclass(frozen=True)
class Decision:
    accion: str
    argumentos: dict[str, Any] = field(default_factory=dict)
    #: "claude" | "heuristica". Igual que en el triaje: hay que poder saber
    #: cuál corrió sin adivinar por la forma del resultado.
    motor: str = "claude"
    latencia_ms: int = 0


async def interpretar(mensaje: str, contexto: str | None = None) -> Decision:
    """Nunca lanza. Ante cualquier fallo devuelve una decisión conservadora."""
    mensaje = (mensaje or "").strip()
    if not mensaje:
        return Decision(NO_ENTENDIDO, {"motivo": "Mensaje vacío"}, motor="heuristica")

    if not settings.anthropic_api_key:
        return _heuristica(mensaje)

    try:
        return await _con_claude(mensaje, contexto)
    except Exception:
        log.exception("[pulso] el intérprete falló, usando heurística")
        return _heuristica(mensaje)


async def _con_claude(mensaje: str, contexto: str | None) -> Decision:
    t0 = time.perf_counter()
    cliente = _cliente()

    contenido = mensaje if not contexto else f"{contexto}\n\n---\n\nMensaje:\n{mensaje}"

    res = await cliente.messages.create(
        model=settings.modelo_triage,
        max_tokens=1024,
        system=PROMPT_SISTEMA,
        messages=[{"role": "user", "content": contenido}],
        tools=HERRAMIENTAS,
        output_config={"effort": settings.esfuerzo_triage},
    )

    latencia = round((time.perf_counter() - t0) * 1000)

    for bloque in res.content:
        if bloque.type == "tool_use" and bloque.name in NOMBRES_HERRAMIENTAS:
            # `strict: true` ya validó la forma del lado del proveedor, pero
            # el que ejecuta no confía en lo que le llega por la red.
            args = dict(bloque.input) if isinstance(bloque.input, dict) else {}
            return Decision(bloque.name, args, motor="claude", latencia_ms=latencia)

    # Respondió texto en vez de llamar una herramienta. El prompt lo prohíbe y
    # existe `no_entendido` justo para que no pase, pero si pasa no se pierde
    # el mensaje: se marca como no clasificado y un humano decide.
    log.warning("[pulso] el modelo no llamó ninguna herramienta; marcando no_entendido")
    return Decision(
        NO_ENTENDIDO,
        {"motivo": "El modelo no eligió una acción"},
        motor="claude",
        latencia_ms=latencia,
    )


# ─────────────────────────────────────────────────────────────────
# Respaldo sin LLM. Tosco a propósito: existe para que el canal nunca
# se quede mudo, no para ser bueno.
# ─────────────────────────────────────────────────────────────────

#: Entrega consumada. Gana sobre lo clínico porque es inequívoca: nadie
#: "entrega el paciente" en el mismo mensaje en que lo reporta por primera vez.
_ENTREGA = re.compile(r"entregam|entregu|ya lo dejamos|lo dejamos en")
#: "quedé libre" / "a dónde me muevo" — el punto D.
_ZONA = re.compile(
    r"a d[oó]nde (me )?(voy|muevo|dirijo)|qued[eé] libre|disponible|"
    r"qu[eé] sigue|d[oó]nde me quedo|donde espero"
)
#: "soy la AMB-014". Captura el identificador para no perderlo.
_UNIDAD = re.compile(
    r"(?:soy|habla|aqu[ií]|es)\s+(?:la|el)?\s*(?:unidad|m[oó]vil|ambulancia)?\s*"
    r"([A-Za-z]{2,4}[- ]?\d{1,4}|\d{1,4})|(?:unidad|m[oó]vil|amb)[- ]?(\d{1,4})",
    re.IGNORECASE,
)
_LLEGADA = re.compile(r"ya lleg|llegamos|estoy en|en la puerta")
_HOSPITAL = re.compile(r"hospital|clinic|sede|puerta|urgencias")
_DEMORA = re.compile(r"tranc|trafico|tráfico|demor|retras|tarde|varad|cerrad")
_UBICACION = re.compile(
    r"ubicaci|direcci|dónde queda|donde queda|como llego|cómo llego|no sé llegar|mapa"
)
_ESTADO = re.compile(
    r"ya aceptaron|acept[oó]|respondier|qué pasó con|que paso con|en qué va|en que va"
)
#: Señales de que el mensaje describe un PACIENTE, no una gestión.
_CLINICO = re.compile(
    r"pacient|masculin|femenin|a[nñ]os|dolor|trauma|glasgow|tensi[oó]n|"
    r"satur|inconsc|convuls|sangr|fractur|infart|acv|herida|quemad|gestante|"
    r"disnea|hipoten|taquic|precordial"
)


def _heuristica(mensaje: str) -> Decision:
    t = mensaje.lower()

    # El orden importa. Primero la entrega consumada, que es inequívoca aunque
    # mencione al paciente. Después lo clínico, que manda sobre el resto
    # porque es lo único que no se puede posponer.
    if _ENTREGA.search(t):
        return Decision("confirmar_llegada", {"donde": "hospital"}, motor="heuristica")
    if _CLINICO.search(t):
        return Decision("registrar_caso", {"dictado": mensaje}, motor="heuristica")
    # El punto D antes que "pedir_ubicacion": "a dónde me muevo" y "mándame
    # la ubicación" se parecen, pero el primero pregunta por la ZONA a cubrir
    # y el segundo por la dirección del hospital ya asignado.
    if _ZONA.search(t):
        return Decision("pedir_zona_cobertura", {}, motor="heuristica")
    if _UBICACION.search(t):
        return Decision("pedir_ubicacion", {}, motor="heuristica")
    m = _UNIDAD.search(mensaje)
    if m:
        uid = (m.group(1) or m.group(2) or "").strip().upper().replace(" ", "-")
        return Decision(
            "declarar_unidad",
            {"unidad_id": uid, "tripulante": None},
            motor="heuristica",
        )
    if _ESTADO.search(t):
        return Decision("consultar_estado", {}, motor="heuristica")
    if _DEMORA.search(t):
        return Decision(
            "reportar_demora",
            {"motivo": mensaje, "minutos_estimados": None},
            motor="heuristica",
        )
    if _LLEGADA.search(t):
        donde = "hospital" if _HOSPITAL.search(t) else "escena"
        return Decision("confirmar_llegada", {"donde": donde}, motor="heuristica")

    return Decision(
        NO_ENTENDIDO,
        {"motivo": "No se reconoció la intención sin LLM"},
        motor="heuristica",
    )
