"""TTS. El otro lado de la voz, con la misma credencial que el STT."""

import httpx
import pytest

from app.config import settings
from app.sintesis import (
    ELEVENLABS_TTS_URL,
    FalloSintesis,
    SinProveedorTTS,
    _mime_de,
    hay_tts,
    sintetizar,
)

_ASYNC_CLIENT_REAL = httpx.AsyncClient
MP3 = b"ID3\x04fake-mp3-bytes"


@pytest.fixture(autouse=True)
def sin_credencial(monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "")


def montar(monkeypatch, manejador):
    transporte = httpx.MockTransport(manejador)

    class ClienteFalso(_ASYNC_CLIENT_REAL):
        def __init__(self, *a, **kw):
            kw["transport"] = transporte
            super().__init__(*a, **kw)

    monkeypatch.setattr(httpx, "AsyncClient", ClienteFalso)


def test_sin_credencial_no_hay_tts():
    assert hay_tts() is False


async def test_sin_credencial_lanza_error_claro():
    with pytest.raises(SinProveedorTTS, match="ELEVENLABS_API_KEY"):
        await sintetizar("hola")


async def test_texto_vacio_no_gasta_una_llamada(monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "el")
    with pytest.raises(FalloSintesis):
        await sintetizar("   ")


async def test_arma_bien_la_peticion(monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "el-secreta")
    monkeypatch.setattr(settings, "tts_voz_id", "voz-123")
    vistas = {}

    def manejador(req: httpx.Request) -> httpx.Response:
        vistas["url"] = str(req.url)
        vistas["xi"] = req.headers.get("xi-api-key")
        vistas["auth"] = req.headers.get("authorization")
        vistas["cuerpo"] = req.content
        return httpx.Response(200, content=MP3)

    montar(monkeypatch, manejador)
    audio = await sintetizar("La ambulancia lleva 20 minutos sin reportar.")

    assert audio.contenido == MP3
    assert audio.proveedor == "elevenlabs"
    assert audio.mime == "audio/mpeg"
    # El voice_id va en la RUTA, no en el cuerpo.
    assert vistas["url"].startswith(f"{ELEVENLABS_TTS_URL}/voz-123")
    assert vistas["xi"] == "el-secreta"  # misma llave que STT
    assert vistas["auth"] is None
    assert b"eleven_multilingual_v2" in vistas["cuerpo"]


async def test_la_voz_del_request_le_gana_al_default(monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "el")
    monkeypatch.setattr(settings, "tts_voz_id", "default")
    vistas = {}

    def manejador(req):
        vistas["url"] = str(req.url)
        return httpx.Response(200, content=MP3)

    montar(monkeypatch, manejador)
    await sintetizar("hola", voz="otra-voz")
    assert "/otra-voz" in vistas["url"]


async def test_no_2xx_es_fallo(monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "el")
    montar(monkeypatch, lambda req: httpx.Response(401, text="llave inválida"))
    with pytest.raises(FalloSintesis, match="401"):
        await sintetizar("hola")


async def test_cuerpo_vacio_es_fallo(monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "el")
    montar(monkeypatch, lambda req: httpx.Response(200, content=b""))
    with pytest.raises(FalloSintesis, match="vacío"):
        await sintetizar("hola")


def test_mime_por_formato():
    # ulaw_8000 es el que espera la red telefónica de Twilio.
    assert _mime_de("mp3_44100_128") == "audio/mpeg"
    assert _mime_de("ulaw_8000") == "audio/basic"
    assert _mime_de("opus_48000_128") == "audio/ogg"
    assert _mime_de("cualquier_cosa") == "application/octet-stream"


def test_stt_y_tts_comparten_la_misma_llave(monkeypatch):
    # Es el punto de consolidar en ElevenLabs: una credencial, los dos lados.
    from app.transcripcion import proveedor_activo

    monkeypatch.setattr(settings, "elevenlabs_api_key", "una-sola")
    monkeypatch.setattr(settings, "stt_proveedor", "elevenlabs")
    assert proveedor_activo() == "elevenlabs"
    assert hay_tts() is True
