"""Twilio: el TwiML y la puerta de la llamada saliente."""

import pytest

from app.config import settings
from app.telefonia import llamadas


@pytest.fixture(autouse=True)
def limpio(monkeypatch):
    for k in ("twilio_account_sid", "twilio_auth_token", "twilio_phone_number", "url_publica"):
        monkeypatch.setattr(settings, k, "")


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
