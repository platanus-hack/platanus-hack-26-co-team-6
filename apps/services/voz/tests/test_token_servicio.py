"""El token de servicio con el que `voz` habla con core (tarea 1.8).

Lo que se prueba es lo que se prometió en la tarea:
  - `voz` funciona sin CORE_PASSWORD (ya ni existe la contraseña de turno aquí)
  - manda `Authorization: Bearer <token de servicio>`
  - sin token no llama a core, lo dice, y degrada por el camino de siempre
  - un 403 de core (el que devuelve al intentar aceptar un traslado) se
    distingue de un 401 y de un core caído
"""

import base64
import json
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app import metricas, webhooks_recibidos
from app.clientes import core as cliente_core
from app.clientes.core import CoreCaido, SinCredencial
from app.config import settings
from app.main import app
from app.sesiones import reiniciar

client = TestClient(app)


def _token(sub="svc:voz", alc=("caso:crear", "caso:leer", "notificar"), horas=24):
    """Un token con la forma que emite core: `<carga base64url>.<firma>`.

    La firma no se puede fabricar aquí —el secreto vive en core— y no hace
    falta: `voz` no verifica nada, solo transporta. Quien decide es core.
    """
    carga = {
        "sub": sub,
        "tip": "servicio",
        "alc": list(alc),
        "exp": int((time.time() + horas * 3600) * 1000),
    }
    crudo = base64.urlsafe_b64encode(json.dumps(carga).encode()).decode().rstrip("=")
    return f"{crudo}.firma-de-core"


@pytest.fixture(autouse=True)
def entorno(monkeypatch):
    reiniciar()
    webhooks_recibidos.reiniciar()
    metricas.reiniciar()
    monkeypatch.setattr(settings, "webhook_database_url", "")
    monkeypatch.setattr(settings, "core_service_token", _token())


def _interceptar(monkeypatch, manejador):
    """Reemplaza el transporte HTTP del cliente de core por uno de mentira."""
    monkeypatch.setattr(
        cliente_core,
        "_cliente",
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(manejador)),
    )


# ── El token viaja ───────────────────────────────────────────────


async def test_manda_el_token_de_servicio_como_bearer(monkeypatch):
    vistos: list[str] = []

    def manejador(req: httpx.Request) -> httpx.Response:
        vistos.append(req.headers.get("authorization", ""))
        return httpx.Response(200, json={"caso": {"id": "c1"}})

    _interceptar(monkeypatch, manejador)

    await cliente_core.triage("paciente con dolor precordial", "573001")

    assert vistos == [f"Bearer {settings.core_service_token}"]


async def test_funciona_sin_core_password(monkeypatch):
    # La contraseña de turno ya no participa: ni siquiera existe el ajuste.
    assert not hasattr(settings, "core_password")

    def manejador(req: httpx.Request) -> httpx.Response:
        assert req.headers["authorization"].startswith("Bearer ")
        return httpx.Response(200, json={"candidatos": []})

    _interceptar(monkeypatch, manejador)
    assert await cliente_core.match({"id": "c1"}) == {"candidatos": []}


async def test_no_hace_login_con_contrasena(monkeypatch):
    # El bug que cierra la tarea: un servicio autenticándose como humano.
    rutas: list[str] = []

    def manejador(req: httpx.Request) -> httpx.Response:
        rutas.append(req.url.path)
        return httpx.Response(200, json={})

    _interceptar(monkeypatch, manejador)
    await cliente_core.estado("c1")

    assert rutas == ["/estado"]
    assert "/auth/login" not in rutas


# ── Sin credencial: se dice, no se disimula ──────────────────────


async def test_sin_token_no_llama_a_core(monkeypatch):
    llamadas: list[str] = []

    def manejador(req: httpx.Request) -> httpx.Response:
        llamadas.append(req.url.path)
        return httpx.Response(200, json={})

    _interceptar(monkeypatch, manejador)
    monkeypatch.setattr(settings, "core_service_token", "")

    # Antes se mandaba el request SIN cabecera, confiando en que core no
    # tuviera guard. Eso es el fallback abierto que la regla prohíbe.
    with pytest.raises(SinCredencial) as e:
        await cliente_core.triage("dolor precordial irradiado", "573001")

    assert llamadas == []
    assert "CORE_SERVICE_TOKEN" in str(e.value)


def test_listo_dice_que_falta_el_token(monkeypatch):
    monkeypatch.setattr(settings, "core_service_token", "")

    r = client.get("/listo").json()

    assert r["core"]["puede_hablar"] is False
    assert r["core"]["modo"] == "sin credencial"
    assert "CORE_SERVICE_TOKEN" in r["core"]["detalle"]


def test_listo_publica_la_identidad_pero_nunca_el_token():
    r = client.get("/listo").json()

    assert r["core"]["modo"] == "token de servicio"
    assert r["core"]["identidad"] == "svc:voz"
    assert r["core"]["alcance"] == ["caso:crear", "caso:leer", "notificar"]
    assert r["core"]["puede_hablar"] is True
    # La credencial no se publica en un endpoint sin autenticar. Ni ahí ni en
    # ningún log.
    assert settings.core_service_token not in json.dumps(r)


def test_listo_avisa_si_el_token_ya_vencio(monkeypatch):
    monkeypatch.setattr(settings, "core_service_token", _token(horas=-1))

    r = client.get("/listo").json()["core"]

    assert r["vencido"] is True
    assert r["puede_hablar"] is False


def test_listo_no_revienta_con_un_token_mal_pegado(monkeypatch):
    # Copiar y pegar una variable de entorno sale mal más seguido de lo que
    # nadie admite. Que lo diga, no que tumbe la sonda.
    monkeypatch.setattr(settings, "core_service_token", "esto-no-es-un-token")

    r = client.get("/listo").json()["core"]

    assert r["puede_hablar"] is False
    assert r["modo"] == "token ilegible"


# ── Lo que responde core ─────────────────────────────────────────


async def test_403_de_core_se_explica_como_alcance(monkeypatch):
    # Es lo que devuelve core si `voz` intenta POST /handshake/respond: el
    # token de servicio no lleva `handshake:responder`.
    _interceptar(
        monkeypatch,
        lambda req: httpx.Response(403, json={"message": "sin alcance"}),
    )

    with pytest.raises(CoreCaido) as e:
        await cliente_core.dispatch("c1", "110010000101")

    assert "403" in str(e.value)
    assert "alcance" in str(e.value)


async def test_401_manda_a_renovar_el_token_no_a_mirar_la_red(monkeypatch):
    _interceptar(monkeypatch, lambda req: httpx.Response(401, json={}))

    with pytest.raises(CoreCaido) as e:
        await cliente_core.estado("c1")

    assert "401" in str(e.value)
    assert "Emite otro" in str(e.value)


async def test_un_401_no_dispara_un_reintento_con_contrasena(monkeypatch):
    intentos: list[str] = []

    def manejador(req: httpx.Request) -> httpx.Response:
        intentos.append(req.url.path)
        return httpx.Response(401, json={})

    _interceptar(monkeypatch, manejador)

    with pytest.raises(CoreCaido):
        await cliente_core.match({"id": "c1"})

    # Un solo intento: con un token estático, reintentar no arregla nada y
    # duplicaría la latencia justo cuando core ya dijo que no.
    assert intentos == ["/match"]
