"""Tarea 0.3 · el webhook responde en menos de 3 s.

Meta espera 2xx en ~3 segundos. Un triaje con Claude tarda 4-8. Si el trabajo
ocurre dentro del request, Meta lo da por fallido, lo reintenta, y **cada
reintento crea otro caso**. Eso ya estaba pasando y nadie lo había notado
porque no había métrica.
"""

import asyncio
import json
import time

import pytest
from fastapi.testclient import TestClient

from app import metricas
from app.config import settings
from app.main import app
from app.rutas import whatsapp as ruta
from app.sesiones import reiniciar as reiniciar_sesiones

client = TestClient(app)


@pytest.fixture(autouse=True)
def entorno(monkeypatch):
    reiniciar_sesiones()
    metricas.reiniciar()
    monkeypatch.setattr(settings, "whatsapp_token", "")
    monkeypatch.setattr(settings, "whatsapp_proveedor", "kapso")


def payload(id_msg="w-lento-1", tipo="texto"):
    m = {"from": "573001234567", "id": id_msg}
    if tipo == "texto":
        m |= {"type": "text", "text": {"body": "Masculino 54, dolor precordial, supra ST"}}
    else:
        m |= {"type": "audio", "audio": {"id": "MEDIA-1", "mime_type": "audio/ogg"}}
    return {"entry": [{"changes": [{"value": {"messages": [m]}}]}]}


# ── El presupuesto ───────────────────────────────────────────────


def test_un_triaje_lento_no_retrasa_el_200(monkeypatch):
    """El corazón de la tarea: 8 segundos de trabajo, 200 inmediato."""
    lento = {"corrio": False}

    async def procesar_lento(m):
        await asyncio.sleep(8)
        lento["corrio"] = True

    monkeypatch.setattr(ruta, "procesar", procesar_lento)

    t0 = time.perf_counter()
    r = client.post("/webhooks/whatsapp", json=payload())
    transcurrido = time.perf_counter() - t0

    assert r.status_code == 200
    # TestClient corre las BackgroundTasks al cerrar la respuesta, así que
    # aquí no se puede medir el request aislado. Lo que SÍ se puede medir, y
    # es lo que importa, es lo que el propio servicio registró.
    latencia = metricas.percentil("pulso_webhook_latencia_ms", 99, proveedor="kapso")
    assert latencia is not None, "no se instrumentó la latencia"
    assert latencia < 1000, f"el webhook tardó {latencia:.0f} ms en responder"


def test_la_latencia_se_registra_con_el_proveedor():
    client.post("/webhooks/whatsapp", json=payload("w-metrica"))
    expuesto = metricas.exponer()
    assert 'pulso_webhook_latencia_ms_bucket{proveedor="kapso",le="1000"}' in expuesto
    assert "pulso_webhook_latencia_ms_count" in expuesto


def test_tambien_se_mide_cuando_el_cuerpo_es_basura():
    # Un cuerpo ilegible sale por otra rama del código; si esa no mide,
    # el p99 miente por omisión.
    client.post(
        "/webhooks/whatsapp",
        content=b"no es json",
        headers={"Content-Type": "application/json"},
    )
    assert metricas.percentil("pulso_webhook_latencia_ms", 50, proveedor="kapso") is not None


def test_el_histograma_es_acumulativo():
    for v in (10, 200, 5000):
        metricas.observar("pulso_webhook_latencia_ms", v, proveedor="kapso")
    lineas = metricas.exponer().splitlines()
    def bucket(le):
        return int(next(l for l in lineas if f'le="{le}"' in l).split()[-1])
    # Cada bucket cuenta TODO lo que cae por debajo, no solo su tramo.
    assert bucket(25) == 1 and bucket(250) == 2 and bucket(10000) == 3


# ── El acuse: el paramédico no se queda mudo ─────────────────────


def test_el_texto_recibe_acuse_inmediato(monkeypatch):
    enviados = []

    async def falso(a, t):
        enviados.append(t)
        return {"enviado": True}

    monkeypatch.setattr(ruta.whatsapp, "enviar_texto", falso)

    async def sin_ia(**kw):
        return {"accion": "no_entendido", "argumentos": {"motivo": "x"}}

    monkeypatch.setattr(ruta.ai_core, "interpretar", sin_ia)

    client.post("/webhooks/whatsapp", json=payload("w-acuse"))

    assert enviados, "el paramédico no recibió nada"
    assert "Copiado" in enviados[0]


def test_el_audio_acusa_antes_de_bajar_el_media(monkeypatch):
    """El orden importa: bajar el media son dos saltos autenticados.

    Si el acuse fuera después, el paramédico manda una nota de voz y mira un
    chat mudo durante segundos, con un paciente al lado.
    """
    orden = []

    async def falso(a, t):
        orden.append(("mensaje", t))
        return {"enviado": True}

    async def bajar(mid):
        orden.append(("bajar_media", mid))
        return b"audio", "audio/ogg"

    async def interpretar(**kw):
        return {
            "accion": "registrar_caso",
            "argumentos": {"dictado": "Masculino 54 con dolor precordial"},
            "transcripcion": {"texto": "Masculino 54 con dolor precordial",
                              "proveedor": "elevenlabs"},
        }

    async def despachar_falso(tel, accion, args):
        return "ok"

    monkeypatch.setattr(ruta.whatsapp, "enviar_texto", falso)
    monkeypatch.setattr(ruta.whatsapp, "bajar_media", bajar)
    monkeypatch.setattr(ruta.ai_core, "interpretar", interpretar)
    monkeypatch.setattr(ruta, "despachar", despachar_falso)

    client.post("/webhooks/whatsapp", json=payload("w-audio", tipo="audio"))

    tipos = [t for t, _ in orden]
    assert tipos[0] == "mensaje", "bajó el media antes de acusar recibo"
    assert "transcribiendo" in orden[0][1].lower()
    assert "bajar_media" in tipos


def test_el_audio_devuelve_lo_que_entendio(monkeypatch):
    """Es la única forma de que cace una transcripción mala ANTES de salir."""
    enviados = []

    async def falso(a, t):
        enviados.append(t)
        return {"enviado": True}

    async def interpretar(**kw):
        return {
            "accion": "registrar_caso",
            "argumentos": {"dictado": "Femenina 68 con hemiparesia derecha"},
            "transcripcion": {"texto": "Femenina 68 con hemiparesia derecha"},
        }

    monkeypatch.setattr(ruta.whatsapp, "enviar_texto", falso)
    monkeypatch.setattr(ruta.whatsapp, "bajar_media",
                        lambda mid: _corutina((b"a", "audio/ogg")))
    monkeypatch.setattr(ruta.ai_core, "interpretar", interpretar)
    monkeypatch.setattr(ruta, "despachar", lambda *a: _corutina("ok"))

    client.post("/webhooks/whatsapp", json=payload("w-eco", tipo="audio"))

    assert any("Entendí" in t and "hemiparesia" in t for t in enviados)


def test_no_hace_eco_si_no_es_un_caso_nuevo(monkeypatch):
    """Repetirle 'ya llegué' llena el chat de ruido cuando menos conviene."""
    enviados = []

    async def falso(a, t):
        enviados.append(t)
        return {"enviado": True}

    async def interpretar(**kw):
        return {
            "accion": "confirmar_llegada",
            "argumentos": {"donde": "hospital"},
            "transcripcion": {"texto": "ya llegamos"},
        }

    monkeypatch.setattr(ruta.whatsapp, "enviar_texto", falso)
    monkeypatch.setattr(ruta.whatsapp, "bajar_media",
                        lambda mid: _corutina((b"a", "audio/ogg")))
    monkeypatch.setattr(ruta.ai_core, "interpretar", interpretar)
    monkeypatch.setattr(ruta, "despachar", lambda *a: _corutina("ok"))

    client.post("/webhooks/whatsapp", json=payload("w-sin-eco", tipo="audio"))

    assert not any("Entendí" in t for t in enviados)


def test_un_acuse_que_falla_no_tumba_el_traslado(monkeypatch):
    """Perder el acuse es molesto; perder el traslado es otra cosa."""
    despachado = []

    async def revienta(a, t):
        raise RuntimeError("WhatsApp caído")

    async def interpretar(**kw):
        return {"accion": "registrar_caso", "argumentos": {"dictado": "x" * 20}}

    async def despachar_falso(tel, accion, args):
        despachado.append(accion)
        return "ok"

    monkeypatch.setattr(ruta.whatsapp, "enviar_texto", revienta)
    monkeypatch.setattr(ruta.ai_core, "interpretar", interpretar)
    monkeypatch.setattr(ruta, "despachar", despachar_falso)

    r = client.post("/webhooks/whatsapp", json=payload("w-acuse-roto"))
    assert r.status_code == 200
    assert despachado == ["registrar_caso"]


def _corutina(valor):
    async def _c():
        return valor
    return _c()
