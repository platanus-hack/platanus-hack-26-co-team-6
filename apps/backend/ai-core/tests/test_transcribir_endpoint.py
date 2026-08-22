"""Los endpoints de audio, incluido el camino audio → triaje."""

import base64

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)

AUDIO = b"\x00\x01fake-opus-bytes"
AUDIO_B64 = base64.b64encode(AUDIO).decode()
DICTADO = (
    "Paciente masculino de 54 años, dolor precordial opresivo, "
    "supradesnivel del ST, hemodinámicamente inestable."
)

_ASYNC_CLIENT_REAL = httpx.AsyncClient


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch):
    monkeypatch.setattr(settings, "deepgram_api_key", "")
    monkeypatch.setattr(settings, "elevenlabs_api_key", "")
    monkeypatch.setattr(settings, "stt_proveedor", "auto")
    monkeypatch.setattr(settings, "anthropic_api_key", "")


def con_deepgram(monkeypatch, texto=DICTADO, status=200):
    monkeypatch.setattr(settings, "deepgram_api_key", "dg")
    cuerpo = {"results": {"channels": [{"alternatives": [{"transcript": texto}]}]}}
    transporte = httpx.MockTransport(
        lambda req: httpx.Response(status, json=cuerpo if status == 200 else {"err": 1})
    )

    class ClienteFalso(_ASYNC_CLIENT_REAL):
        def __init__(self, *a, **kw):
            kw["transport"] = transporte
            super().__init__(*a, **kw)

    monkeypatch.setattr(httpx, "AsyncClient", ClienteFalso)


# ── GET /v1/stt ──────────────────────────────────────────────────


def test_stt_reporta_que_no_hay_proveedor():
    # Míralo antes de culpar al parser cuando un audio no produzca nada.
    assert client.get("/v1/stt").json() == {"disponible": False, "proveedor": None}


def test_stt_reporta_el_proveedor_activo(monkeypatch):
    monkeypatch.setattr(settings, "deepgram_api_key", "dg")
    assert client.get("/v1/stt").json() == {
        "disponible": True,
        "proveedor": "deepgram",
    }


# ── POST /v1/transcribir ─────────────────────────────────────────


def test_sin_proveedor_es_503_no_500():
    # No es un bug, es una credencial que falta. Y a diferencia del triaje,
    # aquí NO hay heurística a la que caer.
    r = client.post("/v1/transcribir", json={"audioBase64": AUDIO_B64})
    assert r.status_code == 503
    assert "DEEPGRAM_API_KEY" in r.json()["detail"]


def test_transcribe_y_devuelve_camelcase(monkeypatch):
    con_deepgram(monkeypatch)
    r = client.post("/v1/transcribir", json={"audioBase64": AUDIO_B64}).json()
    assert r["texto"] == DICTADO
    assert r["proveedor"] == "deepgram"
    assert "latenciaMs" in r


def test_base64_invalido_es_400(monkeypatch):
    con_deepgram(monkeypatch)
    r = client.post("/v1/transcribir", json={"audioBase64": "no-es-base64!!"})
    assert r.status_code == 400
    assert "base64" in r.json()["detail"]


def test_fallo_del_proveedor_es_502(monkeypatch):
    con_deepgram(monkeypatch, status=500)
    r = client.post("/v1/transcribir", json={"audioBase64": AUDIO_B64})
    assert r.status_code == 502


def test_subida_de_archivo_tambien_funciona(monkeypatch):
    con_deepgram(monkeypatch)
    r = client.post(
        "/v1/transcribir/archivo",
        files={"archivo": ("nota.ogg", AUDIO, "audio/ogg")},
    )
    assert r.status_code == 200
    assert r.json()["texto"] == DICTADO


# ── POST /v1/triage con audio ────────────────────────────────────


def test_audio_hace_stt_y_extraccion_en_una_llamada(monkeypatch):
    con_deepgram(monkeypatch)

    r = client.post("/v1/triage", json={"audioBase64": AUDIO_B64}).json()

    assert r["caso"]["textoCrudo"] == DICTADO
    assert r["transcripcion"]["proveedor"] == "deepgram"
    assert r["transcripcion"]["texto"] == DICTADO
    assert r["caso"]["serviciosRequeridos"]


def test_el_texto_le_gana_al_audio_si_vienen_los_dos(monkeypatch):
    # Quien ya transcribió sabe algo que nosotros no. Y evita pagar el STT.
    con_deepgram(monkeypatch, texto="ESTO NO DEBERÍA USARSE")

    r = client.post(
        "/v1/triage", json={"texto": DICTADO, "audioBase64": AUDIO_B64}
    ).json()

    assert r["caso"]["textoCrudo"] == DICTADO
    assert r["transcripcion"] is None


def test_sin_transcripcion_el_campo_va_nulo():
    r = client.post("/v1/triage", json={"texto": DICTADO}).json()
    assert r["transcripcion"] is None


def test_audio_sin_proveedor_es_503_y_lo_dice(monkeypatch):
    r = client.post("/v1/triage", json={"audioBase64": AUDIO_B64})
    assert r.status_code == 503


def test_audio_que_transcribe_basura_es_400_con_mensaje_de_audio(monkeypatch):
    # "El audio salió vacío" y "no mandaste nada" se depuran distinto.
    con_deepgram(monkeypatch, texto="ehh")
    r = client.post("/v1/triage", json={"audioBase64": AUDIO_B64})
    assert r.status_code == 400
    assert "audio" in r.json()["detail"].lower()


# ── POST /v1/hablar y GET /v1/voz ────────────────────────────────


def con_tts(monkeypatch, contenido=b"ID3\x04audio", status=200):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "el")
    transporte = httpx.MockTransport(
        lambda req: httpx.Response(status, content=contenido)
    )

    class ClienteFalso(_ASYNC_CLIENT_REAL):
        def __init__(self, *a, **kw):
            kw["transport"] = transporte
            super().__init__(*a, **kw)

    monkeypatch.setattr(httpx, "AsyncClient", ClienteFalso)


def test_voz_reporta_los_dos_lados():
    r = client.get("/v1/voz").json()
    assert r == {
        "stt": {"disponible": False, "proveedor": None},
        "tts": {"disponible": False, "proveedor": None},
    }


def test_una_sola_llave_habilita_los_dos_lados(monkeypatch):
    monkeypatch.setattr(settings, "elevenlabs_api_key", "el")
    monkeypatch.setattr(settings, "stt_proveedor", "elevenlabs")
    r = client.get("/v1/voz").json()
    assert r["stt"]["disponible"] is True
    assert r["tts"]["disponible"] is True


def test_hablar_devuelve_bytes_no_json(monkeypatch):
    # Es un archivo. Envolverlo en base64 dentro de un JSON le agrega 33% de
    # peso a algo que quien llama manda tal cual por la red telefónica.
    con_tts(monkeypatch)
    r = client.post("/v1/hablar", json={"texto": "La ambulancia no ha reportado."})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/")
    assert r.headers["x-proveedor"] == "elevenlabs"
    assert r.content.startswith(b"ID3")


def test_hablar_sin_credencial_es_503():
    r = client.post("/v1/hablar", json={"texto": "hola"})
    assert r.status_code == 503
    assert "ELEVENLABS_API_KEY" in r.json()["detail"]


def test_hablar_con_fallo_del_proveedor_es_502(monkeypatch):
    con_tts(monkeypatch, status=500)
    assert client.post("/v1/hablar", json={"texto": "hola"}).status_code == 502
