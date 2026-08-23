"""El ciclo A→B→C→D que orquesta el agente de WhatsApp.

  A  dónde está la ambulancia    → declarar_unidad · reportar_posicion · ubicación
  B  dónde está el paciente      → registrar_caso
  C  el hospital que la recibe   → lo elige el motor
  D  la zona que debe cubrir     → pedir_zona_cobertura

Los mensajes NO llegan en ese orden y no importa: cada uno se clasifica solo.
"""

import pytest

from app import despachador
from app.config import settings
from app.despachador import _ACCIONES, actualizar_posicion, despachar
from app.sesiones import obtener, reiniciar
from app.zonas import zonas

TEL = "573001234567"


@pytest.fixture(autouse=True)
def limpio(monkeypatch):
    reiniciar()
    monkeypatch.setattr(settings, "whatsapp_token", "")


def capturar(monkeypatch):
    """Intercepta lo que se le manda al paramédico."""
    enviados: list[str] = []
    ubicaciones: list[tuple] = []

    async def texto(a, t):
        enviados.append(t)
        return {"enviado": True}

    async def ubic(a, lat, lng, nombre, direccion=""):
        ubicaciones.append((lat, lng, nombre))
        return {"enviado": True}

    monkeypatch.setattr(despachador.whatsapp, "enviar_texto", texto)
    monkeypatch.setattr(despachador.whatsapp, "enviar_ubicacion", ubic)
    return enviados, ubicaciones


# ── Las nueve acciones existen ───────────────────────────────────


def test_el_despachador_cubre_todas_las_herramientas():
    # Si el agente elige una acción que el despachador no conoce, el mensaje
    # del paramédico se pierde. Este test es la costura entre los dos.
    from app.clientes import ai_core  # noqa: F401  (mismo paquete que el agente)

    esperadas = {
        "registrar_caso", "confirmar_llegada", "reportar_demora",
        "pedir_ubicacion", "consultar_estado", "no_entendido",
        "declarar_unidad", "reportar_posicion", "pedir_zona_cobertura",
    }
    assert esperadas == set(_ACCIONES)


# ── A · la unidad ────────────────────────────────────────────────


async def test_declarar_unidad_la_recuerda(monkeypatch):
    enviados, _ = capturar(monkeypatch)
    await despachar(TEL, "declarar_unidad", {"unidad_id": "amb-014"})

    assert obtener(TEL).unidad_id == "AMB-014"  # normalizada
    assert "AMB-014" in enviados[0]


async def test_declarar_unidad_vacia_pregunta(monkeypatch):
    enviados, _ = capturar(monkeypatch)
    await despachar(TEL, "declarar_unidad", {"unidad_id": "  "})
    assert "unidad" in enviados[0].lower()


async def test_la_posicion_en_palabras_pide_el_botón(monkeypatch):
    # "la 80 con 68" no es una coordenada. Pedir el botón de ubicación es más
    # honesto que fingir que se geocodificó.
    enviados, _ = capturar(monkeypatch)
    await despachar(TEL, "reportar_posicion", {"referencia": "calle 80 con 68"})
    assert "ubicación" in enviados[0].lower()


async def test_la_ubicacion_de_whatsapp_va_a_core(monkeypatch):
    reportado = []

    async def falso(mid, lat, lng, disponible=True):
        reportado.append((mid, lat, lng))
        return {}

    monkeypatch.setattr(despachador.core, "reportar_movil", falso)
    capturar(monkeypatch)

    await despachar(TEL, "declarar_unidad", {"unidad_id": "AMB-014"})
    await actualizar_posicion(TEL, 4.65, -74.10)

    assert reportado == [("AMB-014", 4.65, -74.10)]
    assert obtener(TEL).lat == 4.65


async def test_sin_unidad_declarada_no_reporta_a_core(monkeypatch):
    # Reportar una posición sin saber de qué móvil es no sirve de nada.
    llamado = []
    monkeypatch.setattr(
        despachador.core, "reportar_movil",
        lambda *a, **k: llamado.append(1) or _nada(),
    )
    await actualizar_posicion(TEL, 4.65, -74.10)
    assert llamado == []
    assert obtener(TEL).lat == 4.65  # igual se guarda en la sesión


async def test_si_core_no_responde_la_sesion_igual_guarda(monkeypatch):
    async def revienta(*a, **k):
        raise RuntimeError("core caído")

    monkeypatch.setattr(despachador.core, "reportar_movil", revienta)
    capturar(monkeypatch)
    await despachar(TEL, "declarar_unidad", {"unidad_id": "AMB-014"})

    await actualizar_posicion(TEL, 4.65, -74.10)  # no lanza
    assert obtener(TEL).lat == 4.65


# ── D · la zona de cobertura ─────────────────────────────────────


async def test_pedir_zona_sin_unidad_pide_la_unidad(monkeypatch):
    enviados, _ = capturar(monkeypatch)
    await despachar(TEL, "pedir_zona_cobertura", {})
    assert "unidad" in enviados[0].lower()


async def test_asigna_zona_y_manda_su_ubicacion(monkeypatch):
    enviados, ubicaciones = capturar(monkeypatch)

    async def flota():
        return {"moviles": []}

    async def cobertura(zs, us, locks=None):
        return {
            "asignaciones": [{
                "unidadId": "AMB-014", "zonaId": "8", "zonaNombre": "KENNEDY",
                "etaMin": 12.4, "distKm": 5.0,
                "expiraEn": "2026-08-23T21:00:00Z",
                "motivo": "KENNEDY concentra 15.0% de la demanda.",
            }],
            "descubiertas": [], "zonas": [],
        }

    monkeypatch.setattr(despachador.core, "moviles", flota)
    monkeypatch.setattr(despachador.ai_core, "cobertura", cobertura)

    await despachar(TEL, "declarar_unidad", {"unidad_id": "AMB-014"})
    await despachar(TEL, "pedir_zona_cobertura", {})

    assert any("KENNEDY" in t for t in enviados)
    assert ubicaciones and ubicaciones[-1][2].startswith("Zona")
    assert obtener(TEL).zona_nombre == "KENNEDY"


async def test_si_no_le_toca_zona_lo_dice_sin_inventar(monkeypatch):
    enviados, _ = capturar(monkeypatch)

    monkeypatch.setattr(despachador.core, "moviles", lambda: _dict({"moviles": []}))
    monkeypatch.setattr(
        despachador.ai_core, "cobertura",
        lambda z, u, locks=None: _dict({"asignaciones": [], "descubiertas": ["7", "19"]}),
    )

    await despachar(TEL, "declarar_unidad", {"unidad_id": "AMB-014"})
    await despachar(TEL, "pedir_zona_cobertura", {})

    assert any("quédate donde estás" in t for t in enviados)
    assert any("2 zonas sin unidad" in t for t in enviados)


async def test_si_core_no_da_la_flota_reparte_igual(monkeypatch):
    # Un reparto para una unidad es peor que uno para toda la flota, y es
    # mucho mejor que dejar al paramédico sin respuesta.
    enviados, _ = capturar(monkeypatch)
    vistas = {}

    async def sin_flota():
        raise RuntimeError("core caído")

    async def cobertura(zs, us, locks=None):
        vistas["unidades"] = us
        return {"asignaciones": [], "descubiertas": []}

    monkeypatch.setattr(despachador.core, "moviles", sin_flota)
    monkeypatch.setattr(despachador.ai_core, "cobertura", cobertura)

    await despachar(TEL, "declarar_unidad", {"unidad_id": "AMB-014"})
    await despachar(TEL, "pedir_zona_cobertura", {})

    assert len(vistas["unidades"]) == 1
    assert vistas["unidades"][0]["id"] == "AMB-014"


# ── Las zonas reales ─────────────────────────────────────────────


def test_las_19_localidades_tienen_centroide():
    # Una localidad sin centroide desaparece del reparto y nadie la cubre,
    # en silencio. Es como se descubrió que el CSV del 123 tiene codificación
    # mixta y "USAQUÉN" llegaba de dos formas.
    assert len(zonas()) == 19


def test_la_demanda_suma_uno():
    total = sum(z["demandaRelativa"] for z in zonas())
    assert 0.98 < total < 1.02


def test_kennedy_es_la_de_mas_demanda():
    top = max(zonas(), key=lambda z: z["demandaRelativa"])
    assert top["nombre"] == "KENNEDY"
    assert top["demandaRelativa"] > 0.14


def _dict(v):
    async def _c():
        return v
    return _c()


def _nada():
    async def _c():
        return None
    return _c()
