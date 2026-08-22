"""Texto → audio (TTS). El otro lado de la voz.

Existe para la llamada de seguimiento: cuando una ambulancia se demora más de
lo normal, el agente la llama y le pregunta qué pasó. Ese audio sale de aquí.

ElevenLabs cubre los dos lados de la voz con la MISMA credencial:
  · STT  `POST /v1/speech-to-text`            → app/transcripcion.py
  · TTS  `POST /v1/text-to-speech/{voice_id}` → este archivo

Igual que en STT, el header es `xi-api-key` — no Authorization.

⚠️ Esto NO hace la llamada telefónica. Devuelve bytes de audio. Quien marque
   (Twilio, Kapso) vive en `core`: ai-core no habla con la red telefónica.
"""

import logging
import time
from dataclasses import dataclass

import httpx

from .config import settings

log = logging.getLogger(__name__)

ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech"


class SinProveedorTTS(RuntimeError):
    """No hay credencial de ElevenLabs. No hay nada a lo que caer."""


class FalloSintesis(RuntimeError):
    """El proveedor existe pero no devolvió audio utilizable."""


@dataclass(frozen=True)
class Audio:
    contenido: bytes
    mime: str
    proveedor: str
    latencia_ms: int


def hay_tts() -> bool:
    return bool(settings.elevenlabs_api_key)


async def sintetizar(texto: str, voz: str | None = None) -> Audio:
    """Texto → bytes de audio. Lanza si no hay credencial o si falla."""
    texto = (texto or "").strip()
    if not texto:
        raise FalloSintesis("No hay texto que sintetizar")

    if not hay_tts():
        raise SinProveedorTTS(
            "No hay ELEVENLABS_API_KEY. Ponla en apps/backend/ai-core/.env"
        )

    voz_id = voz or settings.tts_voz_id
    t0 = time.perf_counter()

    async with httpx.AsyncClient(timeout=settings.tts_timeout_s) as cliente:
        res = await cliente.post(
            f"{ELEVENLABS_TTS_URL}/{voz_id}",
            params={"output_format": settings.tts_formato},
            json={"text": texto, "model_id": settings.tts_modelo},
            headers={"xi-api-key": settings.elevenlabs_api_key},
        )

    if res.status_code != 200:
        raise FalloSintesis(f"ElevenLabs TTS {res.status_code}: {res.text[:300]}")

    if not res.content:
        raise FalloSintesis("ElevenLabs TTS devolvió un cuerpo vacío")

    return Audio(
        contenido=res.content,
        mime=_mime_de(settings.tts_formato),
        proveedor="elevenlabs",
        latencia_ms=round((time.perf_counter() - t0) * 1000),
    )


def _mime_de(formato: str) -> str:
    """`mp3_44100_128` → `audio/mpeg`. El prefijo antes del primer _ manda."""
    familia = formato.split("_", 1)[0].lower()
    return {
        "mp3": "audio/mpeg",
        "opus": "audio/ogg",
        "pcm": "audio/L16",
        "ulaw": "audio/basic",
        "alaw": "audio/basic",
        "wav": "audio/wav",
    }.get(familia, "application/octet-stream")
