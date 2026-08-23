"""Twilio: el TwiML, la puerta de la llamada saliente y la firma del stream."""

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient
from twilio.request_validator import RequestValidator

from app import metricas
from app.config import settings
from app.main import app
from app.telefonia import llamadas


@pytest.fixture(autouse=True)
def limpio(monkeypatch):
    for k in ("twilio_account_sid", "twilio_auth_token", "twilio_phone_number", "url_publica"):
        monkeypatch.setattr(settings, k, "")
    # `entorno` no se limpiaba antes porque no existía: default explícito
    # para que un test de otro módulo no deje "produccion" pegado aquí.
    monkeypatch.setattr(settings, "entorno", "desarrollo")
    metricas.reiniciar()


def test_sin_configurar_no_esta_listo():
    assert llamadas.configurado() is False


def test_faltando_solo_la_url_publica_sigue_sin_estar_listo(monkeypatch):
    # Es el olvido más común: Twilio abre un WebSocket de VUELTA, así que sin
    # URL pública la llamada no suena aunque las credenciales estén bien.
    monkeypatch.setattr(settings, "twilio_account_sid", "AC1")
    monkeypatch.setattr(settings, "twilio_auth_token", "t")
    monkeypatch.setattr(settings, "twilio_phone_number", "+573001")
    assert llamadas.configurado() is False

    monkeypatch.setattr(settings, "url_publica", "https://pulso-voz.onrender.com")
    assert llamadas.configurado() is True


def test_el_error_dice_exactamente_que_falta(monkeypatch):
    monkeypatch.setattr(settings, "twilio_account_sid", "AC1")
    with pytest.raises(llamadas.TwilioNoConfigurado) as e:
        llamadas.llamar("+573001234567")
    faltan = str(e.value)
    assert "TWILIO_AUTH_TOKEN" in faltan and "URL_PUBLICA" in faltan
    assert "TWILIO_ACCOUNT_SID" not in faltan


def test_el_twiml_apunta_a_wss_con_el_host_pelado(monkeypatch):
    # El TwiML necesita el host sin esquema. Dejarle el https:// produce
    # "wss://https://..." y Twilio falla sin decir por qué.
    monkeypatch.setattr(settings, "url_publica", "https://pulso-voz.onrender.com/")
    twiml = llamadas.twiml_stream()
    assert 'wss://pulso-voz.onrender.com/telefonia/twilio' in twiml
    assert "https://" not in twiml.split("wss://")[1]


# ── Firma de Twilio en el handshake del WebSocket (tarea 0.2) ────
#
# RequestValidator es la misma libreria que usa la produccion: generar la
# firma con ella en el test no es trampa, es exactamente como Twilio firma
# de verdad. Lo que se prueba es _urls_candidatas() (¿elegimos la URL que
# Twilio realmente firmo?) y la asimetria desarrollo/produccion — no HMAC.

client = TestClient(app)

HOST = "pulso-voz.onrender.com"


def _firmar(url: str, token: str) -> str:
    return RequestValidator(token).compute_signature(url, {})


def test_firma_de_twilio_valida_acepta_la_conexion(monkeypatch):
    monkeypatch.setattr(settings, "url_publica", f"https://{HOST}")
    monkeypatch.setattr(settings, "twilio_auth_token", "tok-123")
    url = f"wss://{HOST}/telefonia/twilio"
    firma = _firmar(url, "tok-123")

    with client.websocket_connect(
        "/telefonia/twilio", headers={"X-Twilio-Signature": firma}
    ) as ws:
        # Si la firma hubiera sido rechazada, `ws.close()` corre ANTES de
        # `ws.accept()` y este `with` ya habría lanzado WebSocketDisconnect
        # al entrar — llegar aquí ya es la prueba de que aceptó.
        ws.send_text("audio-fake-chunk")


def test_firma_de_twilio_con_barra_final_tambien_acepta(monkeypatch):
    # El quirk conocido: Twilio a veces firma con "/" al final de la ruta.
    monkeypatch.setattr(settings, "url_publica", f"https://{HOST}")
    monkeypatch.setattr(settings, "twilio_auth_token", "tok-123")
    url = f"wss://{HOST}/telefonia/twilio/"
    firma = _firmar(url, "tok-123")

    with client.websocket_connect(
        "/telefonia/twilio", headers={"X-Twilio-Signature": firma}
    ) as ws:
        ws.send_text("audio-fake-chunk")


def test_firma_ausente_rechaza_antes_de_aceptar(monkeypatch):
    monkeypatch.setattr(settings, "twilio_auth_token", "tok-123")

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/telefonia/twilio"):
            pass

    assert exc.value.code == 1008


def test_firma_invalida_rechaza_antes_de_aceptar(monkeypatch):
    monkeypatch.setattr(settings, "twilio_auth_token", "tok-123")

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(
            "/telefonia/twilio", headers={"X-Twilio-Signature": "firma-inventada"}
        ):
            pass

    assert exc.value.code == 1008


def test_produccion_sin_token_rechaza(monkeypatch):
    monkeypatch.setattr(settings, "twilio_auth_token", "")
    monkeypatch.setattr(settings, "entorno", "produccion")

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/telefonia/twilio"):
            pass

    assert exc.value.code == 1008


def test_desarrollo_sin_token_acepta_la_conexion(monkeypatch):
    # Mismo caso que hoy: sin credenciales, degrada y avisa (regla 2 de
    # AGENTS.md), pero no tumba el desarrollo local.
    monkeypatch.setattr(settings, "twilio_auth_token", "")
    monkeypatch.setattr(settings, "entorno", "desarrollo")

    with client.websocket_connect("/telefonia/twilio") as ws:
        ws.send_text("audio-fake-chunk")


def test_metrica_de_twilio_se_incrementa_en_cada_rechazo(monkeypatch):
    monkeypatch.setattr(settings, "twilio_auth_token", "tok-123")

    for _ in range(2):
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/telefonia/twilio"):
                pass

    assert metricas.leer("pulso_webhook_firma_invalida_total", proveedor="twilio") == 2
