"""El reparto C→D: quién va a cubrir qué zona cuando queda libre.

Las cifras de demanda son las REALES: salen de las 9.206 llamadas del 123 en
`data/derivados/demanda_localidad.json`. Kennedy concentra el 15%.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.cobertura import calcular, dist_km, repartir_cupos
from app.schemas import CoberturaRequest, Coordenada, Lock, Unidad, Zona

AHORA = datetime(2026, 8, 22, 20, 0, tzinfo=timezone.utc)
ISO = AHORA.isoformat()


def zona(zid, nombre, demanda, lat=4.6, lng=-74.08):
    return Zona(
        id=zid,
        nombre=nombre,
        demanda_relativa=demanda,
        centroide=Coordenada(lat=lat, lng=lng),
    )


def unidad(uid, lat=4.6, lng=-74.08, estado="libre", latido_hace_min=0):
    return Unidad(
        id=uid,
        estado=estado,
        posicion=Coordenada(lat=lat, lng=lng),
        ultimo_latido_en=(AHORA - timedelta(minutes=latido_hace_min)).isoformat(),
    )


#: Las cuatro localidades de mayor demanda, con sus fracciones reales.
KENNEDY = zona("8", "KENNEDY", 0.1497, 4.628, -74.155)
SUBA = zona("11", "SUBA", 0.1012, 4.744, -74.083)
ENGATIVA = zona("10", "ENGATIVA", 0.1003, 4.706, -74.117)
SUMAPAZ = zona("20", "SUMAPAZ", 0.0008, 4.100, -74.300)


def pedir(**kw):
    base = dict(zonas=[KENNEDY, SUBA, ENGATIVA], unidades=[], ahora=ISO)
    base.update(kw)
    return calcular(CoberturaRequest(**base))


# ── Reparto de cupos ─────────────────────────────────────────────


def test_sin_unidades_nadie_tiene_cupo():
    r = pedir(unidades=[])
    assert all(z.cupo == 0 for z in r.zonas)
    assert r.unidades_disponibles == 0


def test_el_cupo_sigue_la_demanda_real():
    # Kennedy pesa 15% de la ciudad; Sumapaz, 0.08%. Con 10 unidades, Kennedy
    # debe llevarse más que las otras tres.
    r = calcular(
        CoberturaRequest(
            zonas=[KENNEDY, SUBA, ENGATIVA, SUMAPAZ],
            unidades=[unidad(f"AMB-{i:03d}") for i in range(10)],
            ahora=ISO,
        )
    )
    cupos = {z.nombre: z.cupo for z in r.zonas}
    assert cupos["KENNEDY"] > cupos["SUBA"]
    assert cupos["KENNEDY"] > cupos["SUMAPAZ"]
    assert sum(cupos.values()) == 10  # no se pierde ninguna


def test_una_zona_con_demanda_no_se_queda_en_cero_si_alcanza():
    # Dejar una localidad entera sin cobertura es una decisión política; este
    # código no la toma solo.
    r = calcular(
        CoberturaRequest(
            zonas=[KENNEDY, SUMAPAZ],
            unidades=[unidad("A"), unidad("B")],
            ahora=ISO,
        )
    )
    assert all(z.cupo >= 1 for z in r.zonas)


def test_el_reparto_no_inventa_ni_pierde_unidades():
    for n in (1, 3, 7, 19, 50):
        cupos = repartir_cupos([KENNEDY, SUBA, ENGATIVA, SUMAPAZ], n)
        assert sum(cupos.values()) == n, n


# ── Asignación ───────────────────────────────────────────────────


def test_manda_la_unidad_mas_cercana():
    lejos = unidad("LEJOS", lat=4.744, lng=-74.083)  # en Suba
    cerca = unidad("CERCA", lat=4.630, lng=-74.150)  # junto a Kennedy
    r = calcular(
        CoberturaRequest(zonas=[KENNEDY], unidades=[lejos, cerca], ahora=ISO)
    )
    a = next(a for a in r.asignaciones if a.zona_nombre == "KENNEDY")
    assert a.unidad_id == "CERCA"
    assert a.eta_min > 0


def test_la_zona_de_mas_demanda_se_cubre_primero():
    r = calcular(
        CoberturaRequest(zonas=[SUMAPAZ, KENNEDY], unidades=[unidad("A")], ahora=ISO)
    )
    assert r.asignaciones[0].zona_nombre == "KENNEDY"


def test_la_asignacion_explica_por_que():
    # El CRUE tiene que poder leer el motivo sin abrir el código.
    r = pedir(unidades=[unidad("A")])
    assert "demanda" in r.asignaciones[0].motivo


def test_una_unidad_no_se_asigna_dos_veces():
    r = calcular(
        CoberturaRequest(
            zonas=[KENNEDY, SUBA, ENGATIVA], unidades=[unidad("A")], ahora=ISO
        )
    )
    assert len(r.asignaciones) == 1
    assert len({a.unidad_id for a in r.asignaciones}) == 1


def test_las_zonas_sin_una_sola_unidad_se_reportan():
    # El número honesto, y no depende de suponer el tamaño de la flota.
    r = calcular(
        CoberturaRequest(
            zonas=[KENNEDY, SUBA, ENGATIVA], unidades=[unidad("A")], ahora=ISO
        )
    )
    assert len(r.descubiertas) == 2  # una unidad no alcanza para tres zonas


def test_sin_flota_objetivo_no_se_inventa_deficit():
    # El cupo reparte lo que HAY, así que medir déficit contra él siempre
    # daría cero. Un tablero que siempre dice verde es peor que no tenerlo.
    r = calcular(
        CoberturaRequest(zonas=[KENNEDY, SUBA], unidades=[unidad("A")], ahora=ISO)
    )
    assert r.con_deficit == []


def test_con_flota_objetivo_el_deficit_es_real():
    # "La ciudad necesita 20 unidades y tiene 1" es la frase que el CRUE
    # necesita, y sólo se puede decir contra un objetivo declarado.
    r = calcular(
        CoberturaRequest(
            zonas=[KENNEDY, SUBA],
            unidades=[unidad("A")],
            flota_objetivo=20,
            ahora=ISO,
        )
    )
    assert r.con_deficit
    assert sum(z.deficit for z in r.zonas) > 0
    kennedy = next(z for z in r.zonas if z.nombre == "KENNEDY")
    assert kennedy.requeridas > kennedy.cupo


# ── El problema del checkout ─────────────────────────────────────


def test_una_unidad_fuera_de_servicio_no_cuenta():
    r = pedir(unidades=[unidad("A", estado="fuera_servicio")])
    assert r.unidades_disponibles == 0
    assert r.asignaciones == []


def test_sin_latido_reciente_sale_del_pool_sola():
    # Terminó turno, se fue a almorzar, o no quiere responder. Desde aquí las
    # tres son iguales, y tratarlas igual es lo que hace esto robusto.
    r = pedir(unidades=[unidad("A", latido_hace_min=30)], latido_maximo_min=5)
    assert r.unidades_disponibles == 0


def test_con_latido_fresco_sí_cuenta():
    r = pedir(unidades=[unidad("A", latido_hace_min=2)], latido_maximo_min=5)
    assert r.unidades_disponibles == 1


def test_sin_telemetria_se_confia_en_el_estado_declarado():
    # Es el modo en que arranca cualquier flota antes de tener tracking.
    u = Unidad(id="A", estado="libre", posicion=Coordenada(lat=4.6, lng=-74.08))
    r = pedir(unidades=[u])
    assert r.unidades_disponibles == 1


def test_en_puerta_cuenta_como_disponible():
    # Está a minutos de quedar libre: es exactamente el caso C→D.
    r = pedir(unidades=[unidad("A", estado="en_puerta")])
    assert r.unidades_disponibles == 1


def test_en_traslado_no_cuenta():
    # No se saca a una ambulancia de un trayecto con paciente a bordo.
    r = pedir(unidades=[unidad("A", estado="en_traslado")])
    assert r.unidades_disponibles == 0


# ── Locks ────────────────────────────────────────────────────────


def test_un_lock_vigente_se_respeta():
    lk = Lock(
        zona_id="8",
        unidad_id="A",
        expira_en=(AHORA + timedelta(minutes=10)).isoformat(),
    )
    r = calcular(
        CoberturaRequest(zonas=[KENNEDY], unidades=[unidad("A")], locks=[lk], ahora=ISO)
    )
    assert r.liberadas == []
    assert "A" in next(z for z in r.zonas if z.id == "8").cubierta_por
    assert r.asignaciones == []  # ya estaba cubierta, no se re-asigna


def test_un_lock_vencido_devuelve_la_zona_al_pool():
    # Sin TTL, una unidad que se desconecta camino a D deja esa zona
    # reservada y descubierta para siempre: el peor de los dos mundos.
    lk = Lock(
        zona_id="8",
        unidad_id="A",
        expira_en=(AHORA - timedelta(minutes=1)).isoformat(),
    )
    r = calcular(
        CoberturaRequest(zonas=[KENNEDY], unidades=[unidad("B")], locks=[lk], ahora=ISO)
    )
    assert len(r.liberadas) == 1
    assert r.asignaciones[0].unidad_id == "B"


def test_si_la_unidad_del_lock_hace_checkout_se_libera():
    lk = Lock(
        zona_id="8",
        unidad_id="A",
        expira_en=(AHORA + timedelta(minutes=10)).isoformat(),
    )
    r = calcular(
        CoberturaRequest(
            zonas=[KENNEDY],
            unidades=[unidad("A", estado="fuera_servicio"), unidad("B")],
            locks=[lk],
            ahora=ISO,
        )
    )
    assert len(r.liberadas) == 1
    assert r.asignaciones[0].unidad_id == "B"


def test_un_lock_a_una_zona_que_ya_no_existe_se_libera():
    lk = Lock(zona_id="fantasma", unidad_id="A", expira_en=(AHORA + timedelta(minutes=10)).isoformat())
    r = calcular(
        CoberturaRequest(zonas=[KENNEDY], unidades=[unidad("A")], locks=[lk], ahora=ISO)
    )
    assert len(r.liberadas) == 1


def test_las_asignaciones_traen_vencimiento():
    r = pedir(unidades=[unidad("A")], ttl_lock_min=20)
    exp = datetime.fromisoformat(r.asignaciones[0].expira_en)
    assert exp == AHORA + timedelta(minutes=20)


# ── Reproducibilidad y bordes ────────────────────────────────────


def test_el_mismo_request_da_el_mismo_reparto():
    args = dict(unidades=[unidad("A"), unidad("B")])
    assert [a.model_dump() for a in pedir(**args).asignaciones] == [
        a.model_dump() for a in pedir(**args).asignaciones
    ]


def test_sin_zonas_no_revienta():
    r = calcular(CoberturaRequest(zonas=[], unidades=[unidad("A")], ahora=ISO))
    assert r.zonas == [] and r.asignaciones == []


def test_mas_unidades_que_zonas_no_deja_a_nadie_colgado():
    r = calcular(
        CoberturaRequest(
            zonas=[KENNEDY],
            unidades=[unidad(f"A{i}") for i in range(5)],
            ahora=ISO,
        )
    )
    assert next(z for z in r.zonas).cupo == 5


def test_haversine_es_plausible_en_bogota():
    # Plaza de Bolívar → Kennedy son ~12 km en línea recta.
    km = dist_km(4.5981, -74.0758, 4.628, -74.155)
    assert 8 < km < 12
