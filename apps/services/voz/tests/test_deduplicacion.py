"""Idempotencia del webhook — tarea 0.4.

El bug que cierra: Meta reintenta con backoff exponencial hasta 7 días. Sin
esto, un reintento sobre `registrar_caso` crea DOS casos y despacha DOS
ambulancias al mismo paciente.
"""

import pytest
from fastapi.testclient import TestClient

from app import metricas, webhooks_recibidos
from app.config import settings
from app.main import app
from app.sesiones import reiniciar as reiniciar_sesiones

client = TestClient(app)


@pytest.fixture(autouse=True)
def entorno(monkeypatch):
    reiniciar_sesiones()
    webhooks_recibidos.reiniciar()
    metricas.reiniciar()
    monkeypatch.setattr(settings, "webhook_database_url", "")
    monkeypatch.setattr(settings, "whatsapp_verify_token", "secreto-del-demo")
    monkeypatch.setattr(settings, "whatsapp_token", "")


# ── El payload real de Meta ──────────────────────────────────────
#
# Copiado de la forma que manda Cloud API v25.0, con `metadata`, `contacts` y
# el `wamid` de verdad. Un payload inventado de tres claves no habría
# encontrado el bug del `entry[].changes[].value.messages[].id`.

WAMID = "wamid.HBgMNTczMDAxMjM0NTY3FQIAEhggQzM0NTY3ODlBQkNERUYwMTIzNDU2Nzg5QUJDREVGAA=="


def _meta(wamid: str = WAMID, texto: str = "hombre de 62, dolor precordial") -> dict:
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
                                {
                                    "profile": {"name": "Paramédico Neyl"},
                                    "wa_id": "573001234567",
                                }
                            ],
                            "messages": [
                                {
                                    "from": "573001234567",
                                    "id": wamid,
                                    "timestamp": "1755900000",
                                    "type": "text",
                                    "text": {"body": texto},
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }


@pytest.fixture
def procesados(monkeypatch):
    """Cuenta cuántas veces se llegó a procesar de verdad (a tocar core)."""
    vistos = []

    async def falso(m):
        vistos.append(m.id_externo)

    monkeypatch.setattr("app.rutas.whatsapp.procesar", falso)
    return vistos


# ── Lo que el reintento NO debe hacer ────────────────────────────


def test_el_mismo_wamid_dos_veces_crea_un_solo_caso(procesados):
    client.post("/webhooks/whatsapp", json=_meta())
    client.post("/webhooks/whatsapp", json=_meta())

    assert procesados == [WAMID]


def test_el_segundo_request_responde_200_y_no_toca_core(procesados):
    primera = client.post("/webhooks/whatsapp", json=_meta())
    segunda = client.post("/webhooks/whatsapp", json=_meta())

    # 200 las dos veces: un 4xx haría que Meta reintente durante 7 días y
    # después desactive el webhook.
    assert (primera.status_code, segunda.status_code) == (200, 200)
    assert primera.json()["duplicados"] == "0"
    assert segunda.json()["duplicados"] == "1"
    assert len(procesados) == 1


def test_siete_reintentos_seguidos_siguen_siendo_un_caso(procesados):
    # El backoff de Meta llega a siete intentos antes de rendirse.
    for _ in range(7):
        client.post("/webhooks/whatsapp", json=_meta())
    assert len(procesados) == 1


def test_dos_mensajes_distintos_en_el_mismo_post_pasan_los_dos(procesados):
    client.post("/webhooks/whatsapp", json=_meta("wamid.AAA"))
    client.post("/webhooks/whatsapp", json=_meta("wamid.BBB"))
    assert procesados == ["wamid.AAA", "wamid.BBB"]


# ── La métrica ───────────────────────────────────────────────────


def test_cuenta_los_duplicados_por_proveedor(procesados):
    client.post("/webhooks/whatsapp", json=_meta())
    client.post("/webhooks/whatsapp", json=_meta())
    client.post("/webhooks/whatsapp", json=_meta())

    assert metricas.leer("pulso_webhook_duplicados_total", proveedor="whatsapp") == 2
    assert metricas.leer("pulso_webhook_recibidos_total", proveedor="whatsapp") == 1


def test_la_metrica_se_expone_en_prometheus(procesados):
    client.post("/webhooks/whatsapp", json=_meta())
    client.post("/webhooks/whatsapp", json=_meta())

    cuerpo = client.get("/metrics").text
    assert '# TYPE pulso_webhook_duplicados_total counter' in cuerpo
    assert 'pulso_webhook_duplicados_total{proveedor="whatsapp"} 1' in cuerpo


# ── La degradación, dicha en voz alta ────────────────────────────


def test_sin_base_lo_dice_en_listo():
    r = client.get("/listo").json()["deduplicacion"]
    assert r["persistida"] is False
    assert "memoria" in r["modo"]


def test_con_base_lo_dice_en_listo(monkeypatch):
    monkeypatch.setattr(
        settings, "webhook_database_url", "postgresql://x/y"
    )
    r = client.get("/listo").json()["deduplicacion"]
    assert r["persistida"] is True
    assert r["modo"] == "postgres"


# ── El registro por dentro ───────────────────────────────────────


async def test_un_id_vacio_no_se_puede_deduplicar_pero_pasa():
    # Un mensaje sin id sigue siendo una emergencia: descartarlo sería peor.
    a = await webhooks_recibidos.reclamar("whatsapp", "")
    b = await webhooks_recibidos.reclamar("whatsapp", "")
    assert (a.duplicado, b.duplicado) == (False, False)


async def test_un_wamid_y_un_callsid_iguales_no_se_pisan():
    # `wamid` y `CallSid` no comparten espacio de nombres. Si se pisaran, el
    # modo de fallo es descartar una emergencia real y en silencio.
    await webhooks_recibidos.reclamar("whatsapp", "X1")
    otro = await webhooks_recibidos.reclamar("twilio", "X1")
    assert otro.duplicado is False


async def test_el_reintento_recupera_lo_que_se_anoto():
    await webhooks_recibidos.reclamar("whatsapp", "X2")
    await webhooks_recibidos.anotar_resultado(
        "whatsapp", "X2", {"estado": "procesado", "accion": "registrar_caso"}
    )

    acuse = await webhooks_recibidos.reclamar("whatsapp", "X2")
    assert acuse.duplicado is True
    assert acuse.resultado == {"estado": "procesado", "accion": "registrar_caso"}


async def test_en_memoria_avisa_que_no_esta_persistido():
    acuse = await webhooks_recibidos.reclamar("whatsapp", "X3")
    assert acuse.persistido is False


# ── El camino de Postgres, con una base falsa ────────────────────
#
# La base de verdad se prueba en `test_deduplicacion_postgres.py`, que se
# salta si no hay una. Esto prueba la LÓGICA: que `rowcount == 0` signifique
# reintento y que un fallo de la base no tumbe el webhook.


class _CursorFalso:
    def __init__(self, rowcount, fila=None):
        self.rowcount = rowcount
        self._fila = fila

    async def fetchone(self):
        return self._fila


class _ConexionFalsa:
    def __init__(self, respuestas):
        self._respuestas = list(respuestas)
        self.sql = []

    async def execute(self, sql, params=None):
        self.sql.append((sql, params))
        return self._respuestas.pop(0)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class _PoolFalso:
    def __init__(self, respuestas):
        self.cx = _ConexionFalsa(respuestas)

    def connection(self):
        return self.cx


@pytest.fixture
def con_base(monkeypatch):
    monkeypatch.setattr(settings, "webhook_database_url", "postgresql://x/y")

    def montar(respuestas):
        pool = _PoolFalso(respuestas)

        async def falso():
            return pool

        monkeypatch.setattr(webhooks_recibidos, "_obtener_pool", falso)
        return pool

    return montar


async def test_el_insert_que_gana_es_el_que_procesa(con_base):
    pool = con_base([_CursorFalso(rowcount=1)])

    acuse = await webhooks_recibidos.reclamar("whatsapp", WAMID)

    assert (acuse.duplicado, acuse.persistido) == (False, True)
    sql, params = pool.cx.sql[0]
    assert "on conflict do nothing" in sql
    assert params == ("whatsapp", WAMID)


async def test_rowcount_cero_es_un_reintento_y_devuelve_lo_guardado(con_base):
    con_base(
        [
            _CursorFalso(rowcount=0),
            _CursorFalso(rowcount=1, fila={"resultado": {"estado": "procesado"}}),
        ]
    )

    acuse = await webhooks_recibidos.reclamar("whatsapp", WAMID)

    assert (acuse.duplicado, acuse.persistido) == (True, True)
    assert acuse.resultado == {"estado": "procesado"}
    assert metricas.leer("pulso_webhook_duplicados_total", proveedor="whatsapp") == 1


async def test_si_la_base_se_cae_degrada_a_memoria_y_grita(monkeypatch, caplog):
    monkeypatch.setattr(settings, "webhook_database_url", "postgresql://x/y")

    async def revienta():
        raise RuntimeError("connection refused")

    monkeypatch.setattr(webhooks_recibidos, "_obtener_pool", revienta)

    acuse = await webhooks_recibidos.reclamar("whatsapp", "Y1")

    # El webhook NO se cae: del otro lado hay un paramédico con un paciente.
    assert acuse.duplicado is False
    assert acuse.persistido is False
    assert "DEGRADO A MEMORIA" in caplog.text
    # Y la memoria sigue deduplicando dentro de esta instancia.
    assert (await webhooks_recibidos.reclamar("whatsapp", "Y1")).duplicado is True
    assert "degradé" in webhooks_recibidos.modo()
