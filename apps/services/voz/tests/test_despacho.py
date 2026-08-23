"""`POST /despacho` — el punto de entrada de una emergencia.

Sin esto, todo el flujo saliente estaba construido y nadie podía dispararlo.
"""

import pytest
from fastapi.testclient import TestClient

from app import logistica as L
from app import turno
from app.config import settings
from app.main import app
from app.turno import Estado, Lugar, abrir, de_unidad

client = TestClient(app)


@pytest.fixture(autouse=True)
def limpio(monkeypatch):
    turno.reiniciar()
    monkeypatch.setattr(settings, "whatsapp_token", "")
    monkeypatch.setattr(settings, "secreto_endpoint", "")

    async def nada(*a, **k):
        return {"enviado": True}

    async def sin_ruta(o, d):
        return {}

    async def dir_falsa(c):
        return {"direccion": "Calle 80 #68-15, Bogotá"}

    monkeypatch.setattr(L.whatsapp, "enviar_texto", nada)
    monkeypatch.setattr(L.whatsapp, "enviar_botones", nada)
    monkeypatch.setattr(L.whatsapp, "enviar_ubicacion", nada)
    monkeypatch.setattr(L.core, "ruta", sin_ruta)
    monkeypatch.setattr("app.rutas.despacho.core.direccion", dir_falsa)


EMERGENCIA = {
    "lat": 4.628, "lng": -74.155,
    "descripcion": "Masculino 54, dolor precordial",
}


def test_sin_unidades_con_turno_es_409_y_dice_por_que():
    """No es un error del que llama: es que no hay a quién mandar.

    Decirlo así permite que el CRUE escale en vez de reintentar.
    """
    r = client.post("/despacho", json=EMERGENCIA)
    assert r.status_code == 409
    assert "declararse" in r.json()["detail"]


def test_despacha_a_la_unidad_indicada():
    abrir("AMB-014", "573001")
    r = client.post("/despacho", json={**EMERGENCIA, "unidadId": "amb-014"})
    assert r.status_code == 200
    assert r.json()["unidadId"] == "AMB-014"
    assert de_unidad("AMB-014").estado is Estado.ASIGNADA


def test_sin_unidad_elige_la_mas_cercana():
    lejos = abrir("AMB-LEJOS", "573001")
    lejos.a = Lugar(lat=4.74, lng=-74.08)   # Suba
    cerca = abrir("AMB-CERCA", "573002")
    cerca.a = Lugar(lat=4.63, lng=-74.15)   # junto a la emergencia

    r = client.post("/despacho", json=EMERGENCIA)
    assert r.json()["unidadId"] == "AMB-CERCA"


def test_no_saca_a_nadie_de_un_traslado():
    """Con paciente a bordo, la unidad no está disponible. Punto."""
    ocupada = abrir("AMB-014", "573001")
    ocupada.estado = Estado.CON_PACIENTE
    assert client.post("/despacho", json=EMERGENCIA).status_code == 409


def test_una_unidad_cubriendo_zona_sí_se_puede_reasignar():
    # Está esperando, no atendiendo: una emergencia manda sobre la cobertura.
    t = abrir("AMB-014", "573001")
    t.estado = Estado.CUBRIENDO
    t.d = Lugar(lat=4.63, lng=-74.15)
    assert client.post("/despacho", json=EMERGENCIA).status_code == 200


def test_geocodifica_si_no_le_dan_direccion():
    abrir("AMB-014", "573001")
    r = client.post("/despacho", json={**EMERGENCIA, "unidadId": "AMB-014"}).json()
    assert "Calle 80" in r["direccion"]
    assert r["geocodificada"] is True


def test_la_direccion_dada_le_gana_a_la_geocodificada():
    # Quien despacha suele saber más que Mapbox: «portería norte del conjunto»
    # no sale de un geocodificador.
    abrir("AMB-014", "573001")
    r = client.post("/despacho", json={
        **EMERGENCIA, "unidadId": "AMB-014",
        "direccion": "Portería norte, conjunto Los Cerezos",
    }).json()
    assert r["direccion"].startswith("Portería norte")
    assert r["geocodificada"] is False


def test_si_la_geocodificacion_falla_no_bloquea(monkeypatch):
    # Sin dirección el paramédico recibe coordenadas. Feo, pero llega.
    async def revienta(c):
        raise RuntimeError("Mapbox caído")

    monkeypatch.setattr("app.rutas.despacho.core.direccion", revienta)
    abrir("AMB-014", "573001")
    r = client.post("/despacho", json={**EMERGENCIA, "unidadId": "AMB-014"})
    assert r.status_code == 200
    assert r.json()["direccion"] is None


def test_faltan_coordenadas_es_400():
    assert client.post("/despacho", json={"descripcion": "x"}).status_code == 400


def test_queda_protegido_por_secreto(monkeypatch):
    # Cada llamada manda un WhatsApp real y pone una ambulancia en movimiento.
    monkeypatch.setattr(settings, "secreto_endpoint", "abc")
    assert client.post("/despacho", json=EMERGENCIA).status_code == 401
    abrir("AMB-014", "573001")
    r = client.post("/despacho", json={**EMERGENCIA, "unidadId": "AMB-014"},
                    headers={"X-Secreto": "abc"})
    assert r.status_code == 200


# ── GET /despacho/turnos — verificar el despliegue sin molestar a nadie ──


def test_turnos_vacio_avisa_que_no_hay_ventana():
    r = client.get("/despacho/turnos").json()
    assert r["total"] == 0
    assert r["conVentanaAbierta"] == 0


def test_turnos_muestra_el_punto_de_cada_unidad():
    abrir("AMB-014", "573001")
    client.post("/despacho", json={**EMERGENCIA, "unidadId": "AMB-014"})
    r = client.get("/despacho/turnos").json()
    assert r["total"] == 1
    t = r["turnos"][0]
    assert t["unidadId"] == "AMB-014"
    assert t["estado"] == "asignada"
    assert t["punto"] == "A"
    assert "B" in t["puntos"]
