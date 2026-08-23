"""La firma del webhook.

`POST /webhooks/whatsapp` está en internet para que Meta o Kapso lo alcancen,
lo que significa que **cualquiera** puede alcanzarlo. Sin verificar la firma,
un tercero inventa una emergencia y PULSO despacha una ambulancia.
"""

import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from app.canales.firma import FirmaInvalida, verificar
from app.config import settings
from app.main import app
from app.sesiones import reiniciar

client = TestClient(app)
SECRETO = "secreto-del-webhook"
CUERPO = b'{"entry":[{"changes":[{"value":{"messages":[]}}]}]}'


def firmar(cuerpo: bytes, secreto: str = SECRETO) -> str:
    return hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest()


@pytest.fixture(autouse=True)
def entorno(monkeypatch):
    reiniciar()
    monkeypatch.setattr(settings, "whatsapp_webhook_secret", SECRETO)
    monkeypatch.setattr(settings, "whatsapp_token", "")


# ── La función ───────────────────────────────────────────────────


def test_firma_correcta_de_kapso_pasa():
    verificar(CUERPO, {"x-webhook-signature": firmar(CUERPO)})


def test_firma_correcta_de_meta_pasa():
    # Meta la manda como "sha256=<hex>"; Kapso, el hex pelado.
    verificar(CUERPO, {"x-hub-signature-256": f"sha256={firmar(CUERPO)}"})


def test_firma_de_otro_secreto_no_pasa():
    with pytest.raises(FirmaInvalida):
        verificar(CUERPO, {"x-webhook-signature": firmar(CUERPO, "otro")})


def test_cuerpo_alterado_no_pasa():
    # El punto entero: la firma es del cuerpo, no del emisor.
    buena = firmar(CUERPO)
    with pytest.raises(FirmaInvalida):
        verificar(CUERPO + b" ", {"x-webhook-signature": buena})


def test_sin_cabecera_no_pasa():
    with pytest.raises(FirmaInvalida, match="Falta"):
        verificar(CUERPO, {})


def test_sin_secreto_configurado_no_verifica(monkeypatch):
    # Arranca abierto para no bloquear a nadie, pero lo grita en el log.
    monkeypatch.setattr(settings, "whatsapp_webhook_secret", "")
    verificar(CUERPO, {})  # no lanza


# ── El endpoint ──────────────────────────────────────────────────


def _payload(texto="paciente con dolor precordial"):
    return {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "from": "573001",
                                    "id": "w-firma-1",
                                    "type": "text",
                                    "text": {"body": texto},
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }


def test_webhook_sin_firma_es_403():
    r = client.post("/webhooks/whatsapp", json=_payload())
    assert r.status_code == 403


def test_webhook_con_firma_valida_pasa():
    crudo = json.dumps(_payload()).encode()
    r = client.post(
        "/webhooks/whatsapp",
        content=crudo,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": firmar(crudo),
        },
    )
    assert r.status_code == 200


def test_la_firma_se_calcula_sobre_el_cuerpo_crudo():
    # Sobre el JSON re-serializado no cuadraría: un espacio o un cambio de
    # orden de claves cambia el hash. Este cuerpo trae espacios raros a
    # propósito.
    crudo = b'{"entry":  [ {"changes": []} ]}'
    r = client.post(
        "/webhooks/whatsapp",
        content=crudo,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": firmar(crudo),
        },
    )
    assert r.status_code == 200


def test_un_tercero_no_puede_inventar_una_emergencia():
    crudo = json.dumps(_payload("paciente inconsciente en la 26")).encode()
    r = client.post(
        "/webhooks/whatsapp",
        content=crudo,
        headers={
            "Content-Type": "application/json",
            "X-Webhook-Signature": "0" * 64,
        },
    )
    assert r.status_code == 403
