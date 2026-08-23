"""El canal de WhatsApp: verificación, normalización y salida."""

import hashlib
import hmac
import json
import logging

import pytest
from fastapi.testclient import TestClient

from app import metricas
from app.canales import whatsapp
from app.canales.whatsapp import FIRMA_CABECERA, _firma_valida, normalizar, verificar_webhook
from app.config import settings
from app.main import app


@pytest.fixture(autouse=True)
def entorno(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_verify_token", "secreto-del-demo")
    monkeypatch.setattr(settings, "whatsapp_token", "")
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "")


# ── Verificación ─────────────────────────────────────────────────


def test_verificacion_correcta_repite_el_reto():
    assert verificar_webhook("subscribe", "secreto-del-demo", "12345") == "12345"


def test_token_malo_no_pasa():
    # Repetir el reto con un token malo dejaría que cualquiera registre su
    # endpoint contra este número.
    with pytest.raises(PermissionError):
        verificar_webhook("subscribe", "otro", "12345")


def test_modo_malo_no_pasa():
    with pytest.raises(PermissionError):
        verificar_webhook("unsubscribe", "secreto-del-demo", "12345")


def test_sin_token_configurado_nadie_pasa(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_verify_token", "")
    with pytest.raises(PermissionError):
        verificar_webhook("subscribe", "", "12345")


# ── Normalización ────────────────────────────────────────────────


def _payload(*mensajes):
    return {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "contacts": [
                                {"wa_id": "573001", "profile": {"name": "Neyl"}}
                            ],
                            "messages": list(mensajes),
                        }
                    }
                ]
            }
        ]
    }


def test_texto():
    m = normalizar(
        _payload({"from": "573001", "id": "w1", "type": "text", "text": {"body": "hola"}})
    )[0]
    assert (m.tipo, m.texto, m.de, m.nombre_contacto) == ("texto", "hola", "573001", "Neyl")


def test_audio_limpia_el_mime():
    # Meta manda "audio/ogg; codecs=opus"; los proveedores de STT prefieren
    # el tipo pelado.
    m = normalizar(
        _payload(
            {
                "from": "573001",
                "id": "w2",
                "type": "audio",
                "audio": {"id": "MEDIA1", "mime_type": "audio/ogg; codecs=opus"},
            }
        )
    )[0]
    assert (m.tipo, m.id_media, m.mime_media) == ("audio", "MEDIA1", "audio/ogg")


def test_ubicacion():
    m = normalizar(
        _payload(
            {
                "from": "573001",
                "id": "w3",
                "type": "location",
                "location": {"latitude": 4.6, "longitude": -74.08},
            }
        )
    )[0]
    assert (m.tipo, m.lat, m.lng) == ("ubicacion", 4.6, -74.08)


def test_boton_interactivo_rescata_el_texto():
    m = normalizar(
        _payload(
            {
                "from": "573001",
                "id": "w4",
                "type": "interactive",
                "interactive": {"button_reply": {"title": "Ya llegué"}},
            }
        )
    )[0]
    assert (m.tipo, m.texto) == ("texto", "Ya llegué")


def test_varios_mensajes_en_un_solo_post():
    ms = normalizar(
        _payload(
            {"from": "573001", "id": "a", "type": "text", "text": {"body": "uno"}},
            {"from": "573001", "id": "b", "type": "text", "text": {"body": "dos"}},
        )
    )
    assert [m.texto for m in ms] == ["uno", "dos"]


def test_solo_estados_de_entrega_es_lista_vacia():
    # Meta manda muchos de estos. No es un error.
    assert normalizar({"entry": [{"changes": [{"value": {"statuses": [{}]}}]}]}) == []


def test_payload_vacio_no_revienta():
    assert normalizar({}) == []
    assert normalizar({"entry": []}) == []
    assert normalizar({"entry": [{"changes": [{"value": {}}]}]}) == []


def test_tipo_desconocido_no_se_pierde():
    m = normalizar(_payload({"from": "573001", "id": "w5", "type": "sticker"}))[0]
    assert m.tipo == "otro"


# ── Salida ───────────────────────────────────────────────────────


async def test_sin_credenciales_no_revienta_solo_avisa():
    # El flujo entero no se puede caer porque falte un token.
    r = await whatsapp.enviar_texto("573001", "hola")
    assert r["enviado"] is False


async def test_ubicacion_manda_tarjeta_no_enlace(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_token", "t")
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "123")
    visto = {}

    async def falso(contenido, a):
        visto.update(contenido)
        return {"enviado": True}

    monkeypatch.setattr(whatsapp, "_enviar", falso)
    await whatsapp.enviar_ubicacion("573001", 4.6, -74.08, "Hospital X", "Calle 1")

    assert visto["type"] == "location"
    assert visto["location"]["latitude"] == 4.6
    assert visto["location"]["name"] == "Hospital X"


# ── Verificación de firma de Meta (tarea 0.2) ────────────────────
#
# `_firma_valida` se prueba directo (unidad); el resto pasa por el
# endpoint real con TestClient, porque lo que importa es que el HMAC se
# calcule sobre `request.body()` — el cuerpo CRUDO — no sobre el payload
# ya parseado. Un `client.post(json=...)` deja que httpx decida cómo
# serializar; aquí se manda `content=` con los bytes exactos que se firman.

client_firma = TestClient(app)


@pytest.fixture(autouse=True)
def _firma_entorno(monkeypatch):
    # Explícito aunque coincida con los defaults de Settings: que una prueba
    # de otro módulo no deje `entorno`/`whatsapp_app_secret` contaminados.
    monkeypatch.setattr(settings, "whatsapp_app_secret", "")
    monkeypatch.setattr(settings, "entorno", "desarrollo")
    metricas.reiniciar()


def _firmar(cuerpo: bytes, secreto: str) -> str:
    digest = hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _payload_meta(id_msg: str = "wf1", texto: str = "paciente con dolor precordial") -> dict:
    return {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "from": "573001",
                                    "id": id_msg,
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


def _payload_real_meta() -> dict:
    # Forma real de Cloud API v25.0, con `metadata` y `contacts` (ver
    # test_deduplicacion.py, que ya la copió de un payload de verdad).
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "102290129340398",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "573001234567",
                                "phone_number_id": "106540352242922",
                            },
                            "contacts": [
                                {"profile": {"name": "Paramédico"}, "wa_id": "573001234567"}
                            ],
                            "messages": [
                                {
                                    "from": "573001234567",
                                    "id": "wamid.REAL123",
                                    "timestamp": "1755900000",
                                    "type": "text",
                                    "text": {"body": "hombre de 62, dolor precordial"},
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }


# ── `_firma_valida` — unidad ─────────────────────────────────────


def test_firma_valida_acepta_hmac_correcto():
    cuerpo = b'{"a":1}'
    cabecera = _firmar(cuerpo, "shh")
    assert _firma_valida(cuerpo, cabecera, "shh") is True


def test_firma_valida_rechaza_cuerpo_alterado():
    original = b'{"a":1}'
    alterado = b'{"a":2}'
    cabecera = _firmar(original, "shh")
    assert _firma_valida(alterado, cabecera, "shh") is False


def test_firma_valida_rechaza_cabecera_ausente():
    assert _firma_valida(b"x", None, "shh") is False


def test_firma_valida_rechaza_sin_prefijo_sha256():
    # El hex coincide, pero sin "sha256=" al frente no es la forma que manda
    # Meta — tratarlo como válido igual sería aceptar un formato que no es el
    # que se está verificando.
    cuerpo = b"x"
    digest = hmac.new("shh".encode(), cuerpo, hashlib.sha256).hexdigest()
    assert _firma_valida(cuerpo, digest, "shh") is False


# ── El endpoint real, vía TestClient ──────────────────────────────


def test_firma_valida_sobre_cuerpo_crudo_permite_el_paso(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_app_secret", "shh")
    cuerpo = json.dumps(_payload_meta()).encode()
    r = client_firma.post(
        "/webhooks/whatsapp",
        content=cuerpo,
        headers={"Content-Type": "application/json", FIRMA_CABECERA: _firmar(cuerpo, "shh")},
    )
    assert r.status_code == 200
    assert r.json()["mensajes"] == "1"


def test_cuerpo_alterado_con_firma_del_original_se_rechaza(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_app_secret", "shh")
    original = json.dumps(_payload_meta(id_msg="orig")).encode()
    cabecera = _firmar(original, "shh")
    alterado = json.dumps(_payload_meta(id_msg="alterado")).encode()

    r = client_firma.post(
        "/webhooks/whatsapp",
        content=alterado,
        headers={"Content-Type": "application/json", FIRMA_CABECERA: cabecera},
    )
    assert r.status_code == 401


def test_firma_se_calcula_sobre_bytes_crudos_no_json_reserializado(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_app_secret", "shh")
    payload = _payload_meta(id_msg="crudo-1")
    # Con indentación: bytes distintos a los que produciría re-serializar el
    # mismo dict de forma compacta. Si la implementación firmara contra el
    # JSON re-parseado y re-serializado, esta firma (calculada sobre el
    # crudo) dejaría de coincidir y el test fallaría con 401.
    crudo = json.dumps(payload, indent=2).encode()
    assert crudo != json.dumps(payload).encode()

    r = client_firma.post(
        "/webhooks/whatsapp",
        content=crudo,
        headers={"Content-Type": "application/json", FIRMA_CABECERA: _firmar(crudo, "shh")},
    )
    assert r.status_code == 200


def test_firma_valida_contra_payload_real_de_meta(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_app_secret", "shh")
    cuerpo = json.dumps(_payload_real_meta()).encode()
    r = client_firma.post(
        "/webhooks/whatsapp",
        content=cuerpo,
        headers={"Content-Type": "application/json", FIRMA_CABECERA: _firmar(cuerpo, "shh")},
    )
    assert r.status_code == 200


def test_desarrollo_sin_secreto_acepta_y_advierte(monkeypatch, caplog):
    monkeypatch.setattr(settings, "whatsapp_app_secret", "")
    monkeypatch.setattr(settings, "entorno", "desarrollo")
    cuerpo = json.dumps(_payload_meta()).encode()

    with caplog.at_level(logging.ERROR):
        r = client_firma.post(
            "/webhooks/whatsapp", content=cuerpo, headers={"Content-Type": "application/json"}
        )

    assert r.status_code == 200
    assert "secret" in caplog.text.lower()


def test_produccion_sin_secreto_rechaza_todo(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_app_secret", "")
    monkeypatch.setattr(settings, "entorno", "produccion")
    cuerpo = json.dumps(_payload_meta()).encode()

    r = client_firma.post(
        "/webhooks/whatsapp", content=cuerpo, headers={"Content-Type": "application/json"}
    )
    assert r.status_code == 401


@pytest.mark.parametrize("entorno", ["produccion", "prod", "staging", "PRODUCCION"])
def test_cualquier_entorno_fuera_de_la_lista_blanca_cuenta_como_produccion(monkeypatch, entorno):
    # S1 del diseño: la lista blanca es de DESARROLLO, todo lo demás cierra.
    monkeypatch.setattr(settings, "whatsapp_app_secret", "")
    monkeypatch.setattr(settings, "entorno", entorno)
    cuerpo = json.dumps(_payload_meta()).encode()

    r = client_firma.post(
        "/webhooks/whatsapp", content=cuerpo, headers={"Content-Type": "application/json"}
    )
    assert r.status_code == 401


def test_secreto_presente_firma_ausente_se_rechaza_y_cuenta_metrica(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_app_secret", "shh")
    cuerpo = json.dumps(_payload_meta()).encode()

    r = client_firma.post(
        "/webhooks/whatsapp", content=cuerpo, headers={"Content-Type": "application/json"}
    )

    assert r.status_code == 401
    assert metricas.leer("pulso_webhook_firma_invalida_total", proveedor="whatsapp") == 1


def test_secreto_presente_firma_incorrecta_en_produccion_tambien_rechaza(monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_app_secret", "shh")
    monkeypatch.setattr(settings, "entorno", "produccion")
    cuerpo = json.dumps(_payload_meta()).encode()

    r = client_firma.post(
        "/webhooks/whatsapp",
        content=cuerpo,
        headers={"Content-Type": "application/json", FIRMA_CABECERA: "sha256=deadbeef"},
    )
    assert r.status_code == 401
    assert metricas.leer("pulso_webhook_firma_invalida_total", proveedor="whatsapp") == 1


def test_un_rechazo_por_firma_no_filtra_el_payload_en_el_log(monkeypatch, caplog):
    # Regla 5 de AGENTS.md: ni el log ni la métrica llevan el cuerpo del
    # webhook. El payload de este test lleva un dictado con datos de paciente
    # a propósito, para probar que NO aparece en el log del rechazo.
    monkeypatch.setattr(settings, "whatsapp_app_secret", "shh")
    texto_paciente = "hombre 62 años, dolor precordial, calle 80 con caracas"
    cuerpo = json.dumps(_payload_meta(texto=texto_paciente)).encode()

    with caplog.at_level(logging.ERROR):
        r = client_firma.post(
            "/webhooks/whatsapp", content=cuerpo, headers={"Content-Type": "application/json"}
        )

    assert r.status_code == 401
    assert texto_paciente not in caplog.text
