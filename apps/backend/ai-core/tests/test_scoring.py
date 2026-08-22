"""El motor. Si algo de aquí se rompe, el ranking miente en el escenario."""

from datetime import datetime

import pytest

from app.schemas import SenalesSede
from app.scoring import (
    ESPERA_PUERTA_MAX,
    ESPERA_RESPUESTA_PRIOR,
    FUERZA_PRIOR,
    PENALIZACION_REBOTE,
    SOBRECOSTO_REBOTE,
    calcular_desglose,
    explicar_ganador,
    p_aceptacion,
    penalizacion_rebote,
    rankear,
    sumar_desglose,
)

from factories import caso, eta, sede

# Martes 20:00 — hora pico de urgencias. Fijo para que el score no dependa
# de cuándo corran los tests.
AHORA = datetime(2026, 8, 25, 20, 0)


# ── Invariante 1 · el filtro de servicios es DURO, no ponderado ──────


def test_sede_sin_el_servicio_nunca_entra_al_ranking_asi_este_al_lado():
    sin_hemodinamia = sede("CERCA", servicios=[1102, 110], nombre="Clínica Al Lado")
    con_hemodinamia = sede("LEJOS", servicios=[1102, 743, 110])

    candidatos = rankear(
        caso(),
        [sin_hemodinamia, con_hemodinamia],
        [eta("CERCA", 2), eta("LEJOS", 40)],
        fecha=AHORA,
    )

    ganador = next(c for c in candidatos if c.rank == 1)
    assert ganador.sede.codigo == "LEJOS"

    descartada = next(c for c in candidatos if c.sede.codigo == "CERCA")
    assert descartada.rank == 0
    assert descartada.motivo_descarte == "No tiene Hemodinamia e intervencionismo"


def test_urgencias_es_obligatorio_aunque_el_caso_no_lo_pida():
    sin_urgencias = sede("X", servicios=[743, 110])
    candidatos = rankear(caso(), [sin_urgencias], [eta("X", 5)], fecha=AHORA)
    assert candidatos[0].rank == 0
    assert "Urgencias" in candidatos[0].motivo_descarte


def test_complejidad_insuficiente_descarta():
    baja = sede("B", complejidad="baja")
    c = rankear(caso(), [baja], [eta("B", 5)], fecha=AHORA)[0]
    assert c.rank == 0
    assert "Complejidad baja" in c.motivo_descarte


def test_tab_con_paciente_que_requiere_medico_descarta_todo():
    c = rankear(
        caso(tipo_movil="TAB", requiere_medico_a_bordo=True),
        [sede("A")],
        [eta("A", 5)],
        fecha=AHORA,
    )[0]
    assert c.rank == 0
    assert "TAM" in c.motivo_descarte


def test_las_descartadas_se_devuelven_para_pintarlas_en_gris():
    # Ver la clínica más cercana tachada ES el producto. Si el motor no las
    # devuelve, el momento más fuerte del demo desaparece.
    candidatos = rankear(
        caso(),
        [sede("A"), sede("B", servicios=[1102])],
        [eta("A", 10), eta("B", 3)],
        fecha=AHORA,
    )
    assert any(c.rank == 0 and c.motivo_descarte for c in candidatos)


def test_incluir_descartadas_false_solo_devuelve_viables():
    candidatos = rankear(
        caso(),
        [sede("A"), sede("B", servicios=[1102])],
        [eta("A", 10), eta("B", 3)],
        fecha=AHORA,
        incluir_descartadas=False,
    )
    assert all(c.rank >= 1 for c in candidatos)


# ── Invariante 2 · todo el score está en minutos ─────────────────────


def test_el_desglose_suma_exactamente_el_score():
    c = rankear(caso(), [sede("A")], [eta("A", 12)], fecha=AHORA)[0]
    assert c.score == pytest.approx(sumar_desglose(c.desglose))


def test_la_ruta_del_desglose_es_el_eta_tal_cual():
    c = rankear(caso(), [sede("A")], [eta("A", 12.5)], fecha=AHORA)[0]
    assert c.desglose.ruta == 12.5


def test_el_bono_por_camas_libres_resta():
    vacia = sede("A", camas=200, ocupadas=0)
    d = calcular_desglose(vacia, SenalesSede(), 10, AHORA)
    assert d.bono < 0


# ── La penalización de rebote, ahora por sede ────────────────────────


def test_sin_handshakes_el_rebote_es_exactamente_la_constante_del_pitch():
    # 22 minutos es el número que sale en el pitch. Que un refactor no lo
    # mueva en silencio.
    assert PENALIZACION_REBOTE == 22
    assert ESPERA_RESPUESTA_PRIOR + SOBRECOSTO_REBOTE == 22
    assert penalizacion_rebote(SenalesSede()) == pytest.approx(22)


def test_una_sede_que_contesta_rapido_cuesta_menos_rebotar():
    rapida = SenalesSede(latencias_respuesta_min=[0.5, 0.7, 0.6])
    lenta = SenalesSede(latencias_respuesta_min=[9, 8, 10])
    assert penalizacion_rebote(rapida) < 22 < penalizacion_rebote(lenta)


def test_la_penalizacion_nunca_baja_del_sobrecosto_fijo():
    # Aunque una sede conteste instantáneamente, descargar al paciente y
    # re-rutear sigue costando. Sin este piso el motor subestimaría el rebote.
    instantanea = SenalesSede(latencias_respuesta_min=[0.0] * 50)
    assert penalizacion_rebote(instantanea) > SOBRECOSTO_REBOTE


def test_con_pocos_datos_manda_el_prior():
    una_sola = SenalesSede(latencias_respuesta_min=[20.0])
    # Una sola observación rarísima no debe mover el número hasta 38 min.
    assert 22 < penalizacion_rebote(una_sola) < 27


# ── Invariante 3 · el aprendizaje se tiene que VER ───────────────────


def test_un_rechazo_baja_la_probabilidad_de_aceptacion():
    s = sede("A")
    antes = p_aceptacion(s, SenalesSede())
    despues = p_aceptacion(s, SenalesSede(rechazados=1))
    assert despues < antes


def test_un_rechazo_sube_el_score_lo_suficiente_para_notarse():
    # Si un rechazo no mueve la aguja en pantalla, la tesis del producto no
    # se ve en el demo. El umbral es el mínimo que un jurado alcanza a leer.
    s = sede("A")
    limpio = rankear(caso(), [s], [eta("A", 10)], fecha=AHORA)[0]
    rechazo = rankear(
        caso(),
        [s],
        [eta("A", 10)],
        senales={"A": SenalesSede(rechazados=1, rechazos_recientes=1)},
        fecha=AHORA,
    )[0]
    assert rechazo.score - limpio.score >= 1.0
    assert rechazo.congestion > limpio.congestion


def test_la_sede_rechazada_pierde_el_primer_puesto():
    a, b = sede("A"), sede("B")
    empate = rankear(caso(), [a, b], [eta("A", 10), eta("B", 10)], fecha=AHORA)
    assert empate[0].sede.codigo == "A"  # empate → orden estable

    tras_rechazo = rankear(
        caso(),
        [a, b],
        [eta("A", 10), eta("B", 10)],
        senales={"A": SenalesSede(rechazados=2, rechazos_recientes=2)},
        fecha=AHORA,
    )
    assert tras_rechazo[0].sede.codigo == "B"


def test_la_espera_en_puerta_esta_acotada_por_su_maximo():
    c = rankear(
        caso(),
        [sede("A", camas=10, ocupadas=10)],
        [eta("A", 10)],
        senales={"A": SenalesSede(rechazos_recientes=9)},
        fecha=AHORA,
    )[0]
    assert 0 <= c.desglose.espera <= ESPERA_PUERTA_MAX


def test_fuerza_prior_documentada():
    # Si esto sube, el aprendizaje se vuelve invisible en el demo.
    assert FUERZA_PRIOR == 10


# ── Reproducibilidad ─────────────────────────────────────────────────


def test_el_mismo_request_da_el_mismo_score():
    args = (caso(), [sede("A")], [eta("A", 10)])
    a = rankear(*args, fecha=AHORA)[0].score
    b = rankear(*args, fecha=AHORA)[0].score
    assert a == b


def test_la_hora_cambia_la_congestion():
    madrugada = datetime(2026, 8, 25, 3, 0)
    pico = datetime(2026, 8, 25, 20, 0)
    c_madrugada = rankear(caso(), [sede("A")], [eta("A", 10)], fecha=madrugada)[0]
    c_pico = rankear(caso(), [sede("A")], [eta("A", 10)], fecha=pico)[0]
    assert c_pico.congestion > c_madrugada.congestion


# ── La explicación del ganador ───────────────────────────────────────


def test_explica_cuando_el_segundo_esta_mas_cerca_pero_pierde():
    candidatos = rankear(
        caso(),
        [sede("LEJOS", naturaleza="Privada"), sede("CERCA", naturaleza="Pública", camas=50, ocupadas=48)],
        [eta("LEJOS", 12), eta("CERCA", 8)],
        senales={"CERCA": SenalesSede(rechazados=4, rechazos_recientes=4)},
        fecha=AHORA,
    )
    viables = [c for c in candidatos if c.rank >= 1]
    texto = explicar_ganador(viables[0], viables[1])
    assert "más cerca" in texto and "min efectivos" in texto


def test_explica_con_un_solo_candidato():
    c = rankear(caso(), [sede("A")], [eta("A", 10)], fecha=AHORA)[0]
    assert "probabilidad de aceptación" in explicar_ganador(c)
