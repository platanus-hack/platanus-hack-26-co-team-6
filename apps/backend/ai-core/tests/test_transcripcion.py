"""La costura de STT.

Los detalles de autenticación que se prueban aquí son los dos errores de
integración más comunes con estas APIs:
  · Deepgram usa `Authorization: Token <key>` — "Token", NO "Bearer".
  · ElevenLabs usa el header `xi-api-key`, NO Authorization.
Si alguien los "arregla", esto se cae antes que el demo.
"""

import httpx
import pytest

from app.config import settings
from app.transcripcion import (
    DEEPGRAM_URL,
    ELEVENLABS_URL,
    FalloTranscripcion,
    SinProveedorSTT,
    hay_stt,
    proveedor_activo,
    transcribir,
)

AUDIO = b"\x00\x01fake-opus-bytes"


@pytest.fixture(autouse=True)
def sin_credenciales(monkeypatch):
    monkeypatch.setattr(settings, "deepgram_api_key", "")
    monkeypatch.setattr(settings, "elevenlabs_api_key", "")
    monkeypatch.setattr(settings, "stt_proveedor", "auto")


#: La clase real, capturada al importar. Sin esto, un segundo `montar` en el
#: mismo test heredaría del falso anterior y su transporte ganaría.
_ASYNC_CLIENT_REAL = httpx.AsyncClient


def montar(monkeypatch, manejador):
    """Sustituye el transporte de httpx por uno que responde `manejador`."""
    transporte = httpx.MockTransport(manejador)

    class ClienteFalso(_ASYNC_CLIENT_REAL):
        def __init__(self, *a, **kw):
            kw["transport"] = transporte
            super().__init__(*a, **kw)

    monkeypatch.setattr(httpx, "AsyncClient", ClienteFalso)


# ── Selección de proveedor ───────────────────────────────────────


def test_sin_credenciales_no_hay_proveedor():
    assert proveedor_activo() is None
    assert hay_stt() is False


def test_auto_prefiere_deepgram_por_latencia(monkeypatch):
    monkeypatch.setattr(settings, "deepgram_api_key", "dg")
    monkeypatch.setattr(settings, "elevenlabs_api_key", "el")
    assert proveedor_activo() == "deepgram"


def test_auto_cae_a_elevenlabs_si_es_la_unica(monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "el")
    assert proveedor_activo() == "elevenlabs"


def test_forzar_proveedor_sin_su_credencial_no_usa_el_otro(monkeypatch):
    # Pedir explícitamente uno y recibir el otro en silencio sería peor que
    # fallar: cambiaría el proveedor bajo los pies sin avisar.
    monkeypatch.setattr(settings, "stt_proveedor", "elevenlabs")
    monkeypatch.setattr(settings, "deepgram_api_key", "dg")
    assert proveedor_activo() is None


def test_apagado_explicito(monkeypatch):
    monkeypatch.setattr(settings, "stt_proveedor", "ninguno")
    monkeypatch.setattr(settings, "deepgram_api_key", "dg")
    assert proveedor_activo() is None


def test_valor_desconocido_no_revienta(monkeypatch):
    monkeypatch.setattr(settings, "stt_proveedor", "whisper-local")
    monkeypatch.setattr(settings, "deepgram_api_key", "dg")
    assert proveedor_activo() == "deepgram"


async def test_sin_proveedor_lanza_error_claro():
    with pytest.raises(SinProveedorSTT, match="DEEPGRAM_API_KEY"):
        await transcribir(AUDIO)


async def test_audio_vacio_no_gasta_una_llamada(monkeypatch):
    monkeypatch.setattr(settings, "deepgram_api_key", "dg")
    with pytest.raises(FalloTranscripcion):
        await transcribir(b"")


# ── Deepgram ─────────────────────────────────────────────────────


async def test_deepgram_arma_bien_la_peticion(monkeypatch):
    monkeypatch.setattr(settings, "deepgram_api_key", "dg-secreta")
    vistas = {}

    def manejador(req: httpx.Request) -> httpx.Response:
        vistas["url"] = str(req.url)
        vistas["auth"] = req.headers.get("authorization")
        vistas["tipo"] = req.headers.get("content-type")
        vistas["cuerpo"] = req.content
        return httpx.Response(
            200,
            json={
                "results": {
                    "channels": [
                        {"alternatives": [{"transcript": "Paciente con dolor precordial"}]}
                    ]
                }
            },
        )

    montar(monkeypatch, manejador)
    t = await transcribir(AUDIO, "audio/ogg")

    assert t.texto == "Paciente con dolor precordial"
    assert t.proveedor == "deepgram"
    assert vistas["url"].startswith(DEEPGRAM_URL)
    assert vistas["auth"] == "Token dg-secreta"  # "Token", no "Bearer"
    assert vistas["tipo"] == "audio/ogg"
    assert vistas["cuerpo"] == AUDIO  # bytes crudos, no multipart
    assert "language=es" in vistas["url"]
    assert "model=nova-3" in vistas["url"]


async def test_deepgram_no_2xx_es_fallo(monkeypatch):
    monkeypatch.setattr(settings, "deepgram_api_key", "dg")
    montar(monkeypatch, lambda req: httpx.Response(401, text="sin credencial"))
    with pytest.raises(FalloTranscripcion, match="401"):
        await transcribir(AUDIO)


async def test_deepgram_forma_inesperada_es_fallo(monkeypatch):
    monkeypatch.setattr(settings, "deepgram_api_key", "dg")
    montar(monkeypatch, lambda req: httpx.Response(200, json={"results": {}}))
    with pytest.raises(FalloTranscripcion, match="inesperada"):
        await transcribir(AUDIO)


async def test_transcript_vacio_es_fallo_no_dictado_vacio(monkeypatch):
    # Un transcript vacío que pasara al parser produciría un caso inventado
    # con confianza baja. Mejor fallar aquí.
    monkeypatch.setattr(settings, "deepgram_api_key", "dg")
    montar(
        monkeypatch,
        lambda req: httpx.Response(
            200,
            json={"results": {"channels": [{"alternatives": [{"transcript": "   "}]}]}},
        ),
    )
    with pytest.raises(FalloTranscripcion, match="vacío"):
        await transcribir(AUDIO)


# ── ElevenLabs ───────────────────────────────────────────────────


async def test_elevenlabs_arma_bien_la_peticion(monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "el-secreta")
    monkeypatch.setattr(settings, "stt_proveedor", "elevenlabs")
    vistas = {}

    def manejador(req: httpx.Request) -> httpx.Response:
        vistas["url"] = str(req.url)
        vistas["xi"] = req.headers.get("xi-api-key")
        vistas["auth"] = req.headers.get("authorization")
        vistas["tipo"] = req.headers.get("content-type", "")
        vistas["cuerpo"] = req.content
        return httpx.Response(
            200, json={"text": "Femenina de 68 años con hemiparesia", "language_code": "es"}
        )

    montar(monkeypatch, manejador)
    t = await transcribir(AUDIO, "audio/ogg")

    assert t.texto == "Femenina de 68 años con hemiparesia"
    assert t.proveedor == "elevenlabs"
    assert t.idioma == "es"
    assert vistas["url"].startswith(ELEVENLABS_URL)
    assert vistas["xi"] == "el-secreta"  # xi-api-key, no Authorization
    assert vistas["auth"] is None
    assert vistas["tipo"].startswith("multipart/form-data")
    assert b"scribe_v2" in vistas["cuerpo"]  # model_id es obligatorio


async def test_elevenlabs_no_2xx_es_fallo(monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "el")
    monkeypatch.setattr(settings, "stt_proveedor", "elevenlabs")
    montar(monkeypatch, lambda req: httpx.Response(422, text="model_id inválido"))
    with pytest.raises(FalloTranscripcion, match="422"):
        await transcribir(AUDIO)


async def test_los_dos_proveedores_devuelven_la_misma_forma(monkeypatch):
    # Es el punto de la costura: cambiar de proveedor es una variable de
    # entorno, no un refactor.
    monkeypatch.setattr(settings, "deepgram_api_key", "dg")
    montar(
        monkeypatch,
        lambda req: httpx.Response(
            200,
            json={"results": {"channels": [{"alternatives": [{"transcript": "hola"}]}]}},
        ),
    )
    a = await transcribir(AUDIO)

    monkeypatch.setattr(settings, "stt_proveedor", "elevenlabs")
    monkeypatch.setattr(settings, "elevenlabs_api_key", "el")
    montar(monkeypatch, lambda req: httpx.Response(200, json={"text": "hola"}))
    b = await transcribir(AUDIO)

    assert a.texto == b.texto
    assert {a.proveedor, b.proveedor} == {"deepgram", "elevenlabs"}
    assert isinstance(a.latencia_ms, int) and isinstance(b.latencia_ms, int)
