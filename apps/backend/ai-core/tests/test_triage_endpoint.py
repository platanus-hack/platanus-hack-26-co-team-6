"""POST /v1/triage — el contrato de cable.

Los nombres camelCase de aquí NO son cosmética: `apps/frontend/lib/types.ts`
es ley compartida por los cuatro carriles. Si un campo cambia de nombre acá,
el matching y el frontend dejan de leer el caso.
"""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.schemas import ExtraccionClinica

client = TestClient(app)

DICTADO = (
    "Paciente masculino de 54 años, dolor precordial opresivo de 40 minutos, "
    "supradesnivel del ST. Hemodinámicamente inestable."
)


@pytest.fixture(autouse=True)
def sin_api_key(monkeypatch):
    """Por defecto los tests corren la rama determinista, sin red."""
    monkeypatch.setattr(settings, "anthropic_api_key", "")


def test_devuelve_el_contrato_en_camelcase():
    caso = client.post("/v1/triage", json={"texto": DICTADO}).json()["caso"]

    # Estos nombres son los de types.ts. No los "arregles" a snake_case.
    for campo in (
        "dxCie10", "dxDescripcion", "serviciosRequeridos", "complejidadRequerida",
        "signosAlarma", "requiereMedicoABordo", "textoCrudo", "tipoMovil", "creadoEn",
    ):
        assert campo in caso, f"falta {campo}: se rompió el contrato con el frontend"

    assert "servicios_requeridos" not in caso


def test_motor_dice_de_donde_salio_la_extraccion():
    # Sin este campo, `confianza == 0.35` era la única pista de que estabas
    # viendo la heurística creyendo que veías al LLM.
    r = client.post("/v1/triage", json={"texto": DICTADO}).json()
    assert r["motor"] == "heuristica"
    assert r["caso"]["confianza"] == 0.35
    assert isinstance(r["latenciaMs"], int)


def test_dictado_corto_es_400():
    r = client.post("/v1/triage", json={"texto": "dolor"})
    assert r.status_code == 400
    assert "corto" in r.json()["detail"].lower()


def test_espacios_no_cuentan_como_dictado():
    assert client.post("/v1/triage", json={"texto": "   dolor   "}).status_code == 400


def test_falta_texto_es_422():
    assert client.post("/v1/triage", json={}).status_code == 422


def test_medico_a_bordo_obliga_movil_tam():
    caso = client.post("/v1/triage", json={"texto": DICTADO}).json()["caso"]
    assert caso["requiereMedicoABordo"] is True
    assert caso["tipoMovil"] == "TAM"


def test_movil_explicito_del_cliente_manda():
    caso = client.post(
        "/v1/triage", json={"texto": DICTADO, "tipoMovil": "TAB"}
    ).json()["caso"]
    assert caso["tipoMovil"] == "TAB"


def test_origen_por_defecto_es_el_del_demo():
    caso = client.post("/v1/triage", json={"texto": DICTADO}).json()["caso"]
    assert caso["origen"] == {"lat": 4.5981, "lng": -74.0758}


def test_origen_del_cliente_se_respeta():
    caso = client.post(
        "/v1/triage",
        json={"texto": DICTADO, "origen": {"lat": 4.65, "lng": -74.05}},
    ).json()["caso"]
    assert caso["origen"] == {"lat": 4.65, "lng": -74.05}


def test_texto_crudo_se_conserva_para_auditoria():
    caso = client.post("/v1/triage", json={"texto": DICTADO}).json()["caso"]
    assert caso["textoCrudo"] == DICTADO


# ── La garantía central: el endpoint nunca cae por culpa del LLM ─────


def test_si_claude_revienta_responde_igual_con_la_heuristica(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-falsa")

    async def explota(texto):
        raise RuntimeError("503 del proveedor")

    monkeypatch.setattr("app.triage.extraer_con_claude", explota)

    r = client.post("/v1/triage", json={"texto": DICTADO})
    assert r.status_code == 200
    assert r.json()["motor"] == "heuristica"


def test_con_api_key_usa_claude_y_lo_reporta(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-falsa")

    async def falso(texto):
        return ExtraccionClinica(
            resumen="IAM con supra ST",
            triage=2,
            dx_cie10="I21.1",
            dx_descripcion="Infarto agudo de miocardio",
            servicios_requeridos=[743, 110],
            complejidad_requerida="alta",
            edad=54,
            sexo="M",
            signos_alarma=["Supradesnivel del ST"],
            requiere_medico_a_bordo=True,
            confianza=0.92,
        )

    monkeypatch.setattr("app.triage.extraer_con_claude", falso)

    r = client.post("/v1/triage", json={"texto": DICTADO}).json()
    assert r["motor"] == "claude"
    assert r["caso"]["serviciosRequeridos"] == [743, 110]
    assert r["caso"]["confianza"] == 0.92
