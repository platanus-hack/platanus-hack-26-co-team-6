"""POST /v1/score — el contrato de cable del ranking."""

from fastapi.testclient import TestClient

from app.main import app
from factories import caso, eta, sede

client = TestClient(app)
AHORA = "2026-08-25T20:00:00"


def _cuerpo(**extra):
    base = {
        "caso": caso().model_dump(by_alias=True),
        "sedes": [
            sede("A").model_dump(by_alias=True),
            sede("B", servicios=[1102]).model_dump(by_alias=True),
        ],
        "etas": [
            eta("A", 12).model_dump(by_alias=True),
            eta("B", 3).model_dump(by_alias=True),
        ],
        "ahora": AHORA,
    }
    base.update(extra)
    return base


def test_devuelve_el_contrato_en_camelcase():
    r = client.post("/v1/score", json=_cuerpo()).json()

    assert set(r) >= {"candidatos", "evaluadas", "compatibles", "latenciaMs"}
    c = r["candidatos"][0]
    for campo in ("etaMin", "distKm", "pAceptacion", "motivoDescarte", "serviciosFaltantes"):
        assert campo in c, f"falta {campo}: se rompió el contrato con el frontend"
    for campo in ("ruta", "riesgoRechazo", "espera", "bono"):
        assert campo in c["desglose"]


def test_cuenta_evaluadas_y_compatibles():
    r = client.post("/v1/score", json=_cuerpo()).json()
    assert r["evaluadas"] == 2
    assert r["compatibles"] == 1  # B no tiene 743 ni 110


def test_la_mas_cercana_sin_el_servicio_queda_descartada():
    r = client.post("/v1/score", json=_cuerpo()).json()
    b = next(c for c in r["candidatos"] if c["sede"]["codigo"] == "B")
    assert b["rank"] == 0
    assert b["motivoDescarte"]


def test_las_senales_llegan_y_mueven_el_score():
    limpio = client.post("/v1/score", json=_cuerpo()).json()["candidatos"][0]["score"]
    con_rechazo = client.post(
        "/v1/score",
        json=_cuerpo(senales={"A": {"rechazados": 2, "rechazosRecientes": 2}}),
    ).json()["candidatos"][0]["score"]
    assert con_rechazo > limpio


def test_senales_en_camelcase_se_leen_bien():
    r = client.post(
        "/v1/score",
        json=_cuerpo(senales={"A": {"latenciasRespuestaMin": [0.5, 0.6, 0.4]}}),
    ).json()
    a = next(c for c in r["candidatos"] if c["sede"]["codigo"] == "A")
    sin_senales = client.post("/v1/score", json=_cuerpo()).json()
    a0 = next(c for c in sin_senales["candidatos"] if c["sede"]["codigo"] == "A")
    # Contesta rápido → rebotarla cuesta menos → mejor score.
    assert a["score"] < a0["score"]


def test_ahora_hace_el_score_reproducible():
    a = client.post("/v1/score", json=_cuerpo()).json()["candidatos"][0]["score"]
    b = client.post("/v1/score", json=_cuerpo()).json()["candidatos"][0]["score"]
    assert a == b


def test_ahora_invalido_es_400():
    r = client.post("/v1/score", json=_cuerpo(ahora="ayer por la tarde"))
    assert r.status_code == 400


def test_sin_ahora_tambien_funciona():
    cuerpo = _cuerpo()
    del cuerpo["ahora"]
    assert client.post("/v1/score", json=cuerpo).status_code == 200


def test_sede_sin_eta_se_ignora_sin_reventar():
    cuerpo = _cuerpo(etas=[eta("A", 12).model_dump(by_alias=True)])
    r = client.post("/v1/score", json=cuerpo).json()
    assert [c["sede"]["codigo"] for c in r["candidatos"]] == ["A"]


def test_sin_sedes_devuelve_ranking_vacio_no_error():
    r = client.post("/v1/score", json=_cuerpo(sedes=[], etas=[]))
    assert r.status_code == 200
    assert r.json()["candidatos"] == []
