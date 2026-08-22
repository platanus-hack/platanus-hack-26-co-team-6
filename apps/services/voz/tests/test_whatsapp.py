"""El canal de WhatsApp: verificación, normalización y salida."""

import pytest

from app.canales import whatsapp
from app.canales.whatsapp import normalizar, verificar_webhook
from app.config import settings


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
