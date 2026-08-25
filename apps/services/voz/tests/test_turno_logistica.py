"""El turno completo A→B→C→D con botones.

El flujo es SALIENTE: PULSO le dice a la ambulancia a dónde ir. Eso invierte
el flujo original —donde el paramédico escribía primero— y trae consigo el
muro de la ventana de 24 h de WhatsApp.
"""

import pytest

from app import logistica as L
from app import turno
from app.config import settings
from app.turno import Estado, Lugar, Punto, abrir, de_unidad

TEL = "573001234567"
UNIDAD = "AMB-014"

HOSPITAL = Lugar(
    lat=4.604, lng=-74.086,
    direccion="CL 10 18 75", nombre="Hospital de San José", eta_min=12.0,
)

INCIDENTE = Lugar(
    lat=4.628, lng=-74.155,
    direccion="Calle 80 #68-15",
    detalle="Apto 302, portería a la izquierda",
)


@pytest.fixture(autouse=True)
def limpio(monkeypatch):
    turno.reiniciar()
    monkeypatch.setattr(settings, "whatsapp_token", "")


def capturar(monkeypatch):
    enviados: list[tuple[str, list]] = []

    async def texto(a, t):
        enviados.append((t, []))
        return {"enviado": True}

    async def botones(a, t, bs):
        enviados.append((t, [b[0] for b in bs]))
        return {"enviado": True}

    async def ubic(a, lat, lng, nombre, direccion=""):
        return {"enviado": True}

    async def sin_ruta(o, d):
        return {}

    monkeypatch.setattr(L.whatsapp, "enviar_texto", texto)
    monkeypatch.setattr(L.whatsapp, "enviar_botones", botones)
    monkeypatch.setattr(L.whatsapp, "enviar_ubicacion", ubic)
    monkeypatch.setattr(L.core, "ruta", sin_ruta)
    return enviados


# ── La ventana de 24 h ───────────────────────────────────────────


async def test_sin_turno_abierto_no_se_puede_despachar(monkeypatch):
    """Es el muro del flujo saliente.

    Sin que el paramédico haya escrito, no hay ventana de 24 h y el mensaje
    exigiría una plantilla aprobada por Meta. Mejor devolver False que
    intentar y fallar en silencio.
    """
    capturar(monkeypatch)
    assert await L.asignar("AMB-999", INCIDENTE, "IAM") is False


async def test_con_turno_abierto_sí_despacha(monkeypatch):
    enviados = capturar(monkeypatch)
    abrir(UNIDAD, TEL)

    assert await L.asignar(UNIDAD, INCIDENTE, "Dolor precordial, 54 años") is True
    texto, botones = enviados[0]
    assert "AMB-014" in texto
    assert "Calle 80 #68-15" in texto
    assert "Dolor precordial" in texto
    assert botones == [L.BOTON_VOY]


async def test_el_despacho_lleva_la_direccion_no_las_coordenadas(monkeypatch):
    # Un paramédico al volante no teclea "4.628, -74.155".
    enviados = capturar(monkeypatch)
    abrir(UNIDAD, TEL)
    await L.asignar(UNIDAD, INCIDENTE, "x")
    assert "4.628" not in enviados[0][0]


async def test_sin_direccion_cae_a_coordenadas(monkeypatch):
    # Peor, pero es lo único que hay. Callarlo dejaría al paramédico sin
    # destino.
    enviados = capturar(monkeypatch)
    abrir(UNIDAD, TEL)
    await L.asignar(UNIDAD, Lugar(lat=4.6, lng=-74.08), "x")
    assert "4.6" in enviados[0][0]


# ── La cadena de botones ─────────────────────────────────────────


async def test_el_ciclo_completo_de_seis_botones(monkeypatch):
    enviados = capturar(monkeypatch)
    abrir(UNIDAD, TEL)
    await L.asignar(UNIDAD, INCIDENTE, "IAM")

    for boton, estado, punto in [
        (L.BOTON_VOY, Estado.EN_RUTA_A_B, Punto.B),
        (L.BOTON_EN_ESCENA, Estado.EN_ESCENA, Punto.B),
        (L.BOTON_A_BORDO, Estado.CON_PACIENTE, Punto.B),
    ]:
        assert await L.confirmar(UNIDAD, boton) is not None, boton
        assert de_unidad(UNIDAD).estado is estado, boton
        assert de_unidad(UNIDAD).punto is punto, boton

    # De B a C NO se pasa con un botón: lo dispara el motor al elegir
    # hospital. El paramédico no escoge el destino.
    assert await L.asignar_hospital(UNIDAD, HOSPITAL) is True
    assert de_unidad(UNIDAD).estado is Estado.EN_RUTA_A_C
    assert de_unidad(UNIDAD).punto is Punto.C

    for boton, estado, punto in [
        (L.BOTON_ENTREGADO, Estado.EN_PUERTA, Punto.C),
        (L.BOTON_SALI, Estado.LIBRE, Punto.A),
        (L.BOTON_EN_ZONA, Estado.CUBRIENDO, Punto.D),
    ]:
        assert await L.confirmar(UNIDAD, boton) is not None, boton
        assert de_unidad(UNIDAD).estado is estado, boton
        assert de_unidad(UNIDAD).punto is punto, boton


async def test_entregar_y_quedar_libre_son_momentos_distintos(monkeypatch):
    """Entre entregar el paciente y salir del hospital está el papeleo, la
    camilla y la limpieza. Contarla disponible al entregar la pone a cubrir
    una zona a la que no puede llegar."""
    enviados = capturar(monkeypatch)
    abrir(UNIDAD, TEL)
    await L.asignar(UNIDAD, INCIDENTE, "x")
    for b in (L.BOTON_VOY, L.BOTON_EN_ESCENA, L.BOTON_A_BORDO):
        await L.confirmar(UNIDAD, b)
    await L.asignar_hospital(UNIDAD, HOSPITAL)
    await L.confirmar(UNIDAD, L.BOTON_ENTREGADO)

    assert de_unidad(UNIDAD).estado is Estado.EN_PUERTA
    # El botón que se ofrece es "Ya salí", no "quedé libre".
    assert enviados[-1][1] == [L.BOTON_SALI]


async def test_el_detalle_se_repite_al_llegar_a_la_escena(monkeypatch):
    """«Apto 302» no sirve cuando le asignan el caso: sirve cuando está
    frente al edificio buscando el apartamento."""
    enviados = capturar(monkeypatch)
    abrir(UNIDAD, TEL)
    await L.asignar(UNIDAD, INCIDENTE, "x")
    await L.confirmar(UNIDAD, L.BOTON_VOY)
    await L.confirmar(UNIDAD, L.BOTON_EN_ESCENA)

    assert any("Apto 302" in t for t, _ in enviados[1:])


async def test_con_paciente_a_bordo_pide_el_reporte(monkeypatch):
    # Es donde el flujo saliente se cruza con el que ya existía: de aquí en
    # adelante el paramédico dicta y el motor elige hospital.
    enviados = capturar(monkeypatch)
    abrir(UNIDAD, TEL)
    await L.asignar(UNIDAD, INCIDENTE, "x")
    await L.confirmar(UNIDAD, L.BOTON_VOY)
    await L.confirmar(UNIDAD, L.BOTON_EN_ESCENA)
    await L.confirmar(UNIDAD, L.BOTON_A_BORDO)

    assert any("reporte" in t.lower() for t, _ in enviados)


async def test_al_quedar_libre_propone_zona_sin_que_pregunte(monkeypatch):
    """Es el trigger que faltaba: el punto D no se pide, se ofrece."""
    enviados = capturar(monkeypatch)

    async def cobertura(zs, us, locks=None):
        return {"asignaciones": [{
            "unidadId": UNIDAD, "zonaId": zs[0]["id"],
            "zonaNombre": "KENNEDY", "etaMin": 9.0,
        }]}

    from app.clientes import ai_core
    monkeypatch.setattr(ai_core, "cobertura", cobertura)

    abrir(UNIDAD, TEL)
    await L.asignar(UNIDAD, INCIDENTE, "x")
    for b in (L.BOTON_VOY, L.BOTON_EN_ESCENA, L.BOTON_A_BORDO):
        await L.confirmar(UNIDAD, b)
    await L.asignar_hospital(UNIDAD, HOSPITAL)
    await L.confirmar(UNIDAD, L.BOTON_ENTREGADO)
    await L.confirmar(UNIDAD, L.BOTON_SALI)

    assert any("KENNEDY" in t for t, _ in enviados)
    assert de_unidad(UNIDAD).d.nombre == "KENNEDY"


async def test_si_el_reparto_falla_igual_queda_libre(monkeypatch):
    capturar(monkeypatch)

    async def revienta(*a, **k):
        raise RuntimeError("ai-core caído")

    from app.clientes import ai_core
    monkeypatch.setattr(ai_core, "cobertura", revienta)

    abrir(UNIDAD, TEL)
    await L.asignar(UNIDAD, INCIDENTE, "x")
    for b in (L.BOTON_VOY, L.BOTON_EN_ESCENA, L.BOTON_A_BORDO):
        await L.confirmar(UNIDAD, b)
    await L.asignar_hospital(UNIDAD, HOSPITAL)
    await L.confirmar(UNIDAD, L.BOTON_ENTREGADO)
    assert await L.confirmar(UNIDAD, L.BOTON_SALI) is not None
    assert de_unidad(UNIDAD).estado is Estado.LIBRE


# ── Transiciones inválidas ───────────────────────────────────────


async def test_un_boton_fuera_de_orden_no_corrompe_el_turno(monkeypatch):
    capturar(monkeypatch)
    abrir(UNIDAD, TEL)
    await L.asignar(UNIDAD, INCIDENTE, "x")

    # "Ya salí del hospital" sin haber recogido al paciente.
    assert await L.confirmar(UNIDAD, L.BOTON_SALI) is None
    assert de_unidad(UNIDAD).estado is Estado.ASIGNADA


async def test_con_paciente_a_bordo_no_se_vuelve_a_libre(monkeypatch):
    """Si el traslado se cancela, alguien tiene que decir explícitamente qué
    pasó con la persona. No se puede soltar el estado y ya."""
    capturar(monkeypatch)
    abrir(UNIDAD, TEL)
    await L.asignar(UNIDAD, INCIDENTE, "x")
    await L.confirmar(UNIDAD, L.BOTON_VOY)
    await L.confirmar(UNIDAD, L.BOTON_EN_ESCENA)
    await L.confirmar(UNIDAD, L.BOTON_A_BORDO)

    assert de_unidad(UNIDAD).mover(Estado.LIBRE) is False
    assert de_unidad(UNIDAD).estado is Estado.CON_PACIENTE


async def test_un_boton_de_una_unidad_sin_turno_se_ignora(monkeypatch):
    capturar(monkeypatch)
    assert await L.confirmar("AMB-FANTASMA", L.BOTON_VOY) is None


async def test_declararse_dos_veces_no_borra_el_traslado(monkeypatch):
    capturar(monkeypatch)
    abrir(UNIDAD, TEL)
    await L.asignar(UNIDAD, INCIDENTE, "x")
    await L.confirmar(UNIDAD, L.BOTON_VOY)

    abrir(UNIDAD, TEL)  # se vuelve a declarar
    assert de_unidad(UNIDAD).estado is Estado.EN_RUTA_A_B


# ── Lo que el mapa consume ───────────────────────────────────────


async def test_el_resumen_trae_los_puntos_definidos(monkeypatch):
    capturar(monkeypatch)
    t = abrir(UNIDAD, TEL)
    t.a = Lugar(lat=4.61, lng=-74.08, direccion="Base")
    await L.asignar(UNIDAD, INCIDENTE, "x")

    r = t.resumen()
    assert set(r["puntos"]) == {"A", "B"}
    assert r["puntos"]["B"]["direccion"] == "Calle 80 #68-15"
    assert r["punto"] == "A"  # asignada, todavía no salió


async def test_los_botones_no_repiten_id():
    # Un id reusado en dos transiciones distintas manda el turno al estado
    # equivocado, y el paramédico no tiene forma de notarlo.
    ids = [getattr(L, k) for k in dir(L) if k.startswith("BOTON_")]
    assert len(ids) == len(set(ids))


async def test_un_boton_viejo_del_historial_no_suelta_la_unidad(monkeypatch):
    """En WhatsApp los botones viejos SIGUEN TOCABLES en el chat.

    Un paramédico puede subir en el historial y tocar «Ya salí» de hace dos
    traslados. Sin exigir el estado de origen, ese toque cancela la asignación
    en curso —porque `asignada → libre` sí es una transición válida— y nadie
    entiende por qué la unidad se soltó sola.
    """
    capturar(monkeypatch)
    abrir(UNIDAD, TEL)
    await L.asignar(UNIDAD, INCIDENTE, "x")

    assert await L.confirmar(UNIDAD, L.BOTON_SALI) is None
    assert await L.confirmar(UNIDAD, L.BOTON_EN_ZONA) is None
    assert await L.confirmar(UNIDAD, L.BOTON_ENTREGADO) is None
    assert de_unidad(UNIDAD).estado is Estado.ASIGNADA


def test_cada_boton_declara_su_estado_de_origen():
    # Sin origen, un botón sólo comprueba que la transición sea legal — y
    # varias lo son desde estados donde ese botón no tiene sentido.
    from app.logistica import DE_BOTON

    assert len(DE_BOTON) == 6
    assert all(isinstance(v, tuple) and len(v) == 2 for v in DE_BOTON.values())
