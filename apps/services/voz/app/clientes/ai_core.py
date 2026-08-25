"""Cliente de ai-core. El único archivo que sabe cómo se le habla al cerebro.

ai-core es interno: nunca lo alcanza un tercero. Por eso este cliente no
traduce errores para el navegador — los deja subir, y quien llama decide si
degrada o falla.
"""

import base64
import logging
from typing import Any

import httpx

from ..config import settings

log = logging.getLogger(__name__)


class AiCoreCaido(RuntimeError):
    """ai-core no respondió, tardó de más, o devolvió algo que no es JSON."""


async def _pedir(ruta: str, cuerpo: dict[str, Any]) -> dict[str, Any]:
    url = f"{settings.ai_core_base_url.rstrip('/')}{ruta}"
    try:
        async with httpx.AsyncClient(timeout=settings.timeout_ia_s) as c:
            res = await c.post(url, json=cuerpo)
    except httpx.TimeoutException as e:
        raise AiCoreCaido(f"ai-core {ruta} pasó de {settings.timeout_ia_s}s") from e
    except httpx.HTTPError as e:
        raise AiCoreCaido(f"ai-core {ruta} inalcanzable: {e}") from e

    if res.status_code >= 400:
        raise AiCoreCaido(f"ai-core {ruta} devolvió {res.status_code}: {res.text[:200]}")

    try:
        return res.json()
    except ValueError as e:
        raise AiCoreCaido(f"ai-core {ruta} no devolvió JSON") from e


async def interpretar(
    mensaje: str = "",
    audio: bytes | None = None,
    audio_mime: str = "audio/ogg",
    contexto: str | None = None,
) -> dict[str, Any]:
    """Mensaje (o nota de voz) → qué acción corresponde, con argumentos JSON."""
    cuerpo: dict[str, Any] = {"mensaje": mensaje, "contexto": contexto}
    if audio is not None:
        cuerpo["audioBase64"] = base64.b64encode(audio).decode()
        cuerpo["audioMime"] = audio_mime
    return await _pedir("/v1/interpretar", cuerpo)


async def triage(
    texto: str = "",
    audio: bytes | None = None,
    audio_mime: str = "audio/ogg",
    origen: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Dictado → entidades clínicas estructuradas."""
    cuerpo: dict[str, Any] = {"texto": texto}
    if audio is not None:
        cuerpo["audioBase64"] = base64.b64encode(audio).decode()
        cuerpo["audioMime"] = audio_mime
    if origen:
        cuerpo["origen"] = origen
    return await _pedir("/v1/triage", cuerpo)


async def cobertura(
    zonas: list[dict[str, Any]],
    unidades: list[dict[str, Any]],
    locks: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Punto D: qué zona debe cubrir cada unidad libre.

    Función pura del lado de ai-core: entra la foto de la flota, sale el
    reparto. Quien guarda los locks es core.
    """
    return await _pedir(
        "/v1/cobertura",
        {"zonas": zonas, "unidades": unidades, "locks": locks or []},
    )


async def hablar(texto: str, voz_id: str | None = None) -> bytes:
    """Texto → bytes de audio. Devuelve el archivo, no JSON."""
    url = f"{settings.ai_core_base_url.rstrip('/')}/v1/hablar"
    cuerpo: dict[str, Any] = {"texto": texto}
    if voz_id:
        cuerpo["vozId"] = voz_id
    try:
        async with httpx.AsyncClient(timeout=settings.timeout_ia_s) as c:
            res = await c.post(url, json=cuerpo)
    except httpx.HTTPError as e:
        raise AiCoreCaido(f"ai-core /v1/hablar inalcanzable: {e}") from e

    if res.status_code >= 400:
        raise AiCoreCaido(f"ai-core /v1/hablar devolvió {res.status_code}")
    return res.content
