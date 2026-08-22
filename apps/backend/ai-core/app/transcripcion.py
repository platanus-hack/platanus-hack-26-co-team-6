"""Audio → texto. La pieza que Claude no puede hacer.

La API de Claude recibe texto, imagenes y PDFs — **no audio**. Una nota de voz
de WhatsApp necesita este paso antes de que el parser clinico vea nada.

⚠️ AQUI NO HAY HEURISTICA A LA QUE CAER. Todo el resto de PULSO degrada con
   gracia cuando falta una credencial; esto no puede. Sin proveedor de STT no
   hay texto, y sin texto no hay triaje. Por eso `/v1/transcribir` devuelve 503
   explicito en vez de fingir que funciono.

   Corolario para el demo: el dictado desde la PWA usa Web Speech API en el
   navegador — gratis, instantaneo y sin dependencias. El audio de WhatsApp es
   el unico camino que necesita esto.

Dos proveedores detras de la misma interfaz. Cambiar de uno a otro es una
variable de entorno, no un refactor.
"""

import logging
import time
from dataclasses import dataclass

import httpx

from .config import settings

log = logging.getLogger(__name__)

DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"
ELEVENLABS_URL = "https://api.elevenlabs.io/v1/speech-to-text"


class SinProveedorSTT(RuntimeError):
    """No hay credencial de ningun proveedor. No hay nada a lo que caer."""


class FalloTranscripcion(RuntimeError):
    """El proveedor existe pero no devolvio un transcript utilizable."""


@dataclass(frozen=True)
class Transcripcion:
    texto: str
    proveedor: str
    latencia_ms: int
    idioma: str | None = None


# ─────────────────────────────────────────────────────────────────
# Seleccion de proveedor
# ─────────────────────────────────────────────────────────────────


def proveedor_activo() -> str | None:
    """Cual correria ahora mismo, o None si no hay credenciales.

    `auto` prefiere Deepgram: en dictados cortos es el mas rapido, y aqui la
    latencia se paga en el numero del pitch.
    """
    elegido = (settings.stt_proveedor or "auto").strip().lower()

    if elegido == "deepgram":
        return "deepgram" if settings.deepgram_api_key else None
    if elegido == "elevenlabs":
        return "elevenlabs" if settings.elevenlabs_api_key else None
    if elegido in ("", "auto"):
        if settings.deepgram_api_key:
            return "deepgram"
        if settings.elevenlabs_api_key:
            return "elevenlabs"
        return None
    if elegido in ("ninguno", "none", "off"):
        return None

    log.warning("STT_PROVEEDOR=%r no se reconoce; tratando como 'auto'.", elegido)
    return proveedor_activo_auto()


def proveedor_activo_auto() -> str | None:
    if settings.deepgram_api_key:
        return "deepgram"
    if settings.elevenlabs_api_key:
        return "elevenlabs"
    return None


def hay_stt() -> bool:
    return proveedor_activo() is not None


# ─────────────────────────────────────────────────────────────────
# Entrada
# ─────────────────────────────────────────────────────────────────


async def transcribir(audio: bytes, mime: str = "audio/ogg") -> Transcripcion:
    """Bytes de audio → texto. Lanza si no hay proveedor o si el proveedor falla.

    `mime` importa para Deepgram, que recibe los bytes crudos y necesita saber
    que le estan mandando. WhatsApp entrega notas de voz como `audio/ogg`
    (opus); la PWA suele mandar `audio/webm`.
    """
    if not audio:
        raise FalloTranscripcion("El audio venía vacío")

    quien = proveedor_activo()
    if quien is None:
        raise SinProveedorSTT(
            "No hay proveedor de STT configurado. "
            "Pon DEEPGRAM_API_KEY o ELEVENLABS_API_KEY en apps/backend/ai-core/.env"
        )

    t0 = time.perf_counter()
    if quien == "deepgram":
        texto, idioma = await _deepgram(audio, mime)
    else:
        texto, idioma = await _elevenlabs(audio, mime)

    texto = texto.strip()
    if not texto:
        raise FalloTranscripcion(f"{quien} devolvió un transcript vacío")

    return Transcripcion(
        texto=texto,
        proveedor=quien,
        latencia_ms=round((time.perf_counter() - t0) * 1000),
        idioma=idioma,
    )


# ─────────────────────────────────────────────────────────────────
# Proveedores
# ─────────────────────────────────────────────────────────────────


async def _deepgram(audio: bytes, mime: str) -> tuple[str, str | None]:
    """POST /v1/listen con los bytes crudos.

    Deepgram autentica con `Authorization: Token <key>` — "Token", no "Bearer".
    Es el error de integracion mas comun con esta API.
    """
    params = {
        "model": settings.stt_modelo_deepgram,
        "smart_format": "true",
        "language": settings.stt_idioma,
    }
    async with httpx.AsyncClient(timeout=settings.stt_timeout_s) as cliente:
        res = await cliente.post(
            DEEPGRAM_URL,
            params=params,
            content=audio,
            headers={
                "Authorization": f"Token {settings.deepgram_api_key}",
                "Content-Type": mime,
            },
        )

    if res.status_code != 200:
        raise FalloTranscripcion(f"Deepgram {res.status_code}: {res.text[:300]}")

    datos = res.json()
    try:
        alt = datos["results"]["channels"][0]["alternatives"][0]
    except (KeyError, IndexError, TypeError) as e:
        raise FalloTranscripcion(f"Deepgram devolvió una forma inesperada: {e}") from e

    return alt.get("transcript", ""), settings.stt_idioma


async def _elevenlabs(audio: bytes, mime: str) -> tuple[str, str | None]:
    """POST /v1/speech-to-text, multipart.

    ElevenLabs autentica con el header `xi-api-key`, no con Authorization.
    `model_id` es obligatorio.
    """
    datos_form = {
        "model_id": settings.stt_modelo_elevenlabs,
        "language_code": settings.stt_idioma,
    }
    async with httpx.AsyncClient(timeout=settings.stt_timeout_s) as cliente:
        res = await cliente.post(
            ELEVENLABS_URL,
            data=datos_form,
            files={"file": ("dictado", audio, mime)},
            headers={"xi-api-key": settings.elevenlabs_api_key},
        )

    if res.status_code != 200:
        raise FalloTranscripcion(f"ElevenLabs {res.status_code}: {res.text[:300]}")

    datos = res.json()
    if not isinstance(datos, dict):
        raise FalloTranscripcion("ElevenLabs devolvió una forma inesperada")

    return datos.get("text", "") or "", datos.get("language_code")
