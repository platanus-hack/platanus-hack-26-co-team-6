"""El enrutador de intención: qué hacer con un mensaje suelto de WhatsApp."""

import pytest
from fastapi.testclient import TestClient

from app.agente import HERRAMIENTAS, NOMBRES_HERRAMIENTAS, interpretar
from app.agente.herramientas import NO_ENTENDIDO
from app.config import settings
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def sin_llm(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")


# ── Los esquemas de las herramientas ─────────────────────────────


def test_todas_las_herramientas_son_estrictas():
    # strict + additionalProperties:false es lo que garantiza que
    # `tool_use.input` valide exacto. Si alguien lo quita, el despachador
    # empieza a recibir campos que no espera.
    for h in HERRAMIENTAS:
        assert h["strict"] is True, h["name"]
        assert h["input_schema"]["additionalProperties"] is False, h["name"]
        assert h["input_schema"]["type"] == "object", h["name"]


def test_toda_propiedad_declarada_es_requerida():
    # Con strict, un campo opcional que el modelo omite llega ausente y el
    # despachador revienta. Mejor exigirlos todos y permitir null.
    for h in HERRAMIENTAS:
        props = set(h["input_schema"]["properties"])
        assert props == set(h["input_schema"]["required"]), h["name"]


def test_toda_herramienta_tiene_descripcion_util():
    for h in HERRAMIENTAS:
        assert len(h["description"]) > 60, h["name"]


def test_existe_la_salida_de_escape():
    # Sin `no_entendido` el modelo responde texto libre ante un mensaje raro
    # y el despachador se queda sin acción que ejecutar.
    assert NO_ENTENDIDO in NOMBRES_HERRAMIENTAS


# ── El respaldo sin LLM ──────────────────────────────────────────


@pytest.mark.parametrize(
    ("mensaje", "esperada"),
    [
        ("Masculino de 54 años con dolor precordial y supra ST", "registrar_caso"),
        ("paciente inconsciente en la vía", "registrar_caso"),
        ("gestante de 33 semanas con sangrado", "registrar_caso"),
        ("ya llegamos al hospital", "confirmar_llegada"),
        ("ya llegué", "confirmar_llegada"),
        ("hay un trancón tenaz en la 26", "reportar_demora"),
        ("vamos demorados", "reportar_demora"),
        ("mándame la ubicación porfa", "pedir_ubicacion"),
        ("no sé llegar", "pedir_ubicacion"),
        ("¿ya aceptaron?", "consultar_estado"),
        ("hola", NO_ENTENDIDO),
        ("ok", NO_ENTENDIDO),
    ],
)
async def test_clasificacion_heuristica(mensaje, esperada):
    assert (await interpretar(mensaje)).accion == esperada


async def test_lo_clinico_le_gana_a_todo():
    # Un paciente es lo único que no se puede posponer. Si el mensaje trae
    # cuadro clínico Y otra cosa, manda el cuadro clínico.
    d = await interpretar("hay trancón pero el paciente está inconsciente")
    assert d.accion == "registrar_caso"


async def test_el_dictado_va_tal_cual():
    # Si el respaldo resumiera, el parser clínico perdería datos.
    texto = "Masculino 54 años, dolor precordial, TA 85/50, diaforético"
    d = await interpretar(texto)
    assert d.argumentos["dictado"] == texto


async def test_llegada_distingue_escena_de_hospital():
    assert (await interpretar("ya llegué"))
    assert (await interpretar("ya llegué")).argumentos["donde"] == "escena"
    assert (await interpretar("entregamos el paciente")).argumentos["donde"] == "hospital"


async def test_no_inventa_minutos():
    # Un estimado falso corrompe el promedio con el que se calcula cobertura.
    d = await interpretar("hay trancón")
    assert d.argumentos["minutos_estimados"] is None


async def test_mensaje_vacio_no_revienta():
    assert (await interpretar("")).accion == NO_ENTENDIDO
    assert (await interpretar("   ")).accion == NO_ENTENDIDO


async def test_siempre_devuelve_una_accion_conocida():
    for m in ["", "hola", "asdkjhasd", "🚑", "123", "PACIENTE"]:
        assert (await interpretar(m)).accion in NOMBRES_HERRAMIENTAS


async def test_si_claude_revienta_sigue_la_heuristica(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-falsa")

    async def explota(*a, **kw):
        raise RuntimeError("503 del proveedor")

    monkeypatch.setattr("app.agente.interprete._con_claude", explota)

    d = await interpretar("paciente con dolor precordial")
    assert d.accion == "registrar_caso"
    assert d.motor == "heuristica"


# ── El endpoint ──────────────────────────────────────────────────


def test_endpoint_devuelve_camelcase():
    r = client.post(
        "/v1/interpretar", json={"mensaje": "paciente con dolor precordial"}
    ).json()
    assert r["accion"] == "registrar_caso"
    assert r["motor"] == "heuristica"
    assert "latenciaMs" in r
    assert r["argumentos"]["dictado"]


def test_endpoint_sin_mensaje_no_revienta():
    r = client.post("/v1/interpretar", json={})
    assert r.status_code == 200
    assert r.json()["accion"] == NO_ENTENDIDO


def test_endpoint_acepta_contexto():
    r = client.post(
        "/v1/interpretar",
        json={"mensaje": "ya llegué", "contexto": "Caso abierto, sede asignada."},
    )
    assert r.status_code == 200
