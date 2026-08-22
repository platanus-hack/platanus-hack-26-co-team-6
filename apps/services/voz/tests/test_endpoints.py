"""Los endpoints públicos. Los que hay que exponer en Render."""

import pytest
from fastapi.testclient import TestClient

from app import metricas, webhooks_recibidos
from app.config import settings
from app.main import app
from app.sesiones import reiniciar

client = TestClient(app)


@pytest.fixture(autouse=True)
def entorno(monkeypatch):
    reiniciar()
    webhooks_recibidos.reiniciar()
    metricas.reiniciar()
    monkeypatch.setattr(settings, "webhook_database_url", "")
    monkeypatch.setattr(settings, "whatsapp_verify_token", "secreto-del-demo")
    monkeypatch.setattr(settings, "whatsapp_token", "")
    monkeypatch.setattr(settings, "secreto_endpoint", "")


def test_health_no_toca_nada_aguas_abajo():
    assert client.get("/health").json() == {"status": "ok"}


def test_listo_dice_que_falta():
    r = client.get("/listo").json()
    assert r["whatsapp"]["puede_enviar"] is False
    assert r["twilio"]["configurado"] is False
    assert r["aguas_abajo"]["ai_core"]


# ── GET /webhooks/whatsapp — la verificación de Meta ─────────────


def test_verificacion_devuelve_el_reto_en_texto_plano():
    r = client.get(
        "/webhooks/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "secreto-del-demo",
            "hub.challenge": "9876",
        },
    )
    assert r.status_code == 200
    assert r.text == "9876"


def test_verificacion_con_token_malo_es_403():
    r = client.get(
        "/webhooks/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "adivinado",
            "hub.challenge": "9876",
        },
    )
    assert r.status_code == 403


# ── POST /webhooks/whatsapp ──────────────────────────────────────


def _payload(id_msg="w1", texto="paciente con dolor precordial"):
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


def test_acusa_recibo_rapido():
    r = client.post("/webhooks/whatsapp", json=_payload())
    assert r.status_code == 200
    assert r.json()["mensajes"] == "1"


def test_un_cuerpo_ilegible_devuelve_200_igual():
    # Meta reintenta ante un error y, si insiste, DESACTIVA el webhook.
    # Un 500 aquí no avisa de un bug: deja sin canal a mitad del demo.
    r = client.post(
        "/webhooks/whatsapp", content=b"no es json", headers={"Content-Type": "application/json"}
    )
    assert r.status_code == 200


def test_payload_con_forma_rara_devuelve_200():
    assert client.post("/webhooks/whatsapp", json={"cosa": "rara"}).status_code == 200


def test_el_mismo_mensaje_dos_veces_se_procesa_una():
    # WhatsApp reintenta. Sin idempotencia, un reporte dispara dos traslados.
    primera = client.post("/webhooks/whatsapp", json=_payload("repetido"))
    segunda = client.post("/webhooks/whatsapp", json=_payload("repetido"))
    assert primera.json()["mensajes"] == "1"
    assert segunda.json()["mensajes"] == "1"  # normalizó 1, pero no lo encoló


# ── POST /telefonia/llamar ───────────────────────────────────────


def test_llamar_exige_e164():
    r = client.post("/telefonia/llamar", json={"a": "3001234567"})
    assert r.status_code == 400


def test_llamar_sin_twilio_es_503_y_dice_que_falta():
    r = client.post("/telefonia/llamar", json={"a": "+573001234567"})
    assert r.status_code == 503
    assert "TWILIO_ACCOUNT_SID" in r.json()["detail"]


def test_con_secreto_configurado_el_endpoint_queda_protegido(monkeypatch):
    # Cada llamada cuesta dinero real.
    monkeypatch.setattr(settings, "secreto_endpoint", "abc")
    assert client.post("/telefonia/llamar", json={"a": "+573001234567"}).status_code == 401
    r = client.post(
        "/telefonia/llamar",
        json={"a": "+573001234567"},
        headers={"X-Secreto": "abc"},
    )
    assert r.status_code != 401


# ── /interno — lo que llama core para cerrar el bucle ────────────


def test_notificar_manda_el_aviso(monkeypatch):
    enviados = []

    async def falso_texto(a, t):
        enviados.append((a, t))
        return {"enviado": True}

    monkeypatch.setattr("app.rutas.interno.whatsapp.enviar_texto", falso_texto)

    r = client.post(
        "/interno/notificar",
        json={"telefono": "573001", "texto": "✅ Clínica X aceptó"},
    )
    assert r.status_code == 200
    assert enviados == [("573001", "✅ Clínica X aceptó")]


def test_notificar_con_ubicacion_manda_las_dos_cosas(monkeypatch):
    textos, ubicaciones = [], []
    monkeypatch.setattr(
        "app.rutas.interno.whatsapp.enviar_texto",
        lambda a, t: _async({"enviado": True}, textos, (a, t)),
    )
    monkeypatch.setattr(
        "app.rutas.interno.whatsapp.enviar_ubicacion",
        lambda a, lat, lng, n, d: _async({"enviado": True}, ubicaciones, (a, lat, lng, n)),
    )

    client.post(
        "/interno/notificar",
        json={
            "telefono": "573001",
            "texto": "aceptó",
            "ubicacion": {"lat": 4.6, "lng": -74.08, "nombre": "Clínica X"},
        },
    )
    assert len(textos) == 1 and len(ubicaciones) == 1


def _async(resultado, registro, dato):
    async def _c():
        registro.append(dato)
        return resultado

    return _c()


def test_notificar_sin_telefono_es_400():
    assert client.post("/interno/notificar", json={"texto": "x"}).status_code == 400


def test_interno_queda_protegido_por_secreto(monkeypatch):
    # Está en el mismo servicio público que los webhooks: cualquiera lo alcanza.
    monkeypatch.setattr(settings, "secreto_endpoint", "abc")
    sin = client.post("/interno/notificar", json={"telefono": "1", "texto": "x"})
    assert sin.status_code == 401


def test_seguimiento_sin_twilio_degrada_a_whatsapp(monkeypatch):
    # Una demora que nadie ve es justo el problema que veníamos a resolver:
    # mejor un mensaje que perder el aviso.
    enviados = []
    monkeypatch.setattr(
        "app.rutas.interno.whatsapp.enviar_texto",
        lambda a, t: _async({"enviado": True}, enviados, (a, t)),
    )

    r = client.post(
        "/interno/seguimiento",
        json={"telefono": "573001", "motivo": "Lleva 31 min contra 20 estimados."},
    )
    assert r.status_code == 200
    assert r.json()["via"] == "whatsapp"
    assert "31 min" in enviados[0][1]


def test_seguimiento_llama_cuando_twilio_esta_listo(monkeypatch):
    monkeypatch.setattr("app.rutas.interno.llamadas.configurado", lambda: True)
    monkeypatch.setattr("app.rutas.interno.llamadas.llamar", lambda a: "CA123")

    r = client.post("/interno/seguimiento", json={"telefono": "573001", "motivo": "x"})
    assert r.json() == {"via": "llamada", "sid": "CA123"}


def test_seguimiento_agrega_el_mas_si_falta(monkeypatch):
    vistos = []
    monkeypatch.setattr("app.rutas.interno.llamadas.configurado", lambda: True)
    monkeypatch.setattr(
        "app.rutas.interno.llamadas.llamar", lambda a: vistos.append(a) or "CA1"
    )

    client.post("/interno/seguimiento", json={"telefono": "573001234567"})
    assert vistos == ["+573001234567"]


def test_si_la_llamada_falla_no_se_pierde_el_aviso(monkeypatch):
    enviados = []
    monkeypatch.setattr("app.rutas.interno.llamadas.configurado", lambda: True)

    def revienta(a):
        raise RuntimeError("Twilio 21215")

    monkeypatch.setattr("app.rutas.interno.llamadas.llamar", revienta)
    monkeypatch.setattr(
        "app.rutas.interno.whatsapp.enviar_texto",
        lambda a, t: _async({"enviado": True}, enviados, (a, t)),
    )

    r = client.post("/interno/seguimiento", json={"telefono": "573001", "motivo": "x"})
    assert r.json()["via"] == "whatsapp"
    assert enviados


# ── Autenticación contra core ────────────────────────────────────


async def test_expira_en_se_interpreta_en_milisegundos(monkeypatch):
    # core lo arma con Date.now(): son MILISEGUNDOS. Tratarlo como segundos
    # lo pone en el año 57000 y el token no se renovaría jamás.
    import time as _t

    from app.clientes import core as cliente_core

    monkeypatch.setattr(settings, "core_password", "clave")
    cliente_core._invalidar()

    class ResFalsa:
        status_code = 200
        cookies = {"pulso_sesion": "tok-1"}

        def json(self):
            return {"ok": True, "expiraEn": (_t.time() + 3600) * 1000}

    class ClienteFalso:
        async def post(self, *a, **kw):
            return ResFalsa()

    tok = await cliente_core._token_valido(ClienteFalso())
    assert tok == "tok-1"
    # Dentro de la hora siguiente, no del año 57000.
    assert _t.time() < cliente_core._expira_en < _t.time() + 7200
    cliente_core._invalidar()


async def test_sin_password_no_manda_authorization(monkeypatch):
    from app.clientes import core as cliente_core

    monkeypatch.setattr(settings, "core_password", "")
    cliente_core._invalidar()

    assert await cliente_core._token_valido(None) is None
