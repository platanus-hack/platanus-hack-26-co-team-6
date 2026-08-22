"""El filtro duro. Si esto falla, el ranking sale vacio o admite sedes inviables."""

import pytest

from app.servicios_reps import (
    HEMODINAMIA,
    UCI_ADULTOS,
    URGENCIAS,
    SERVICIOS_SELECCIONABLES,
    complejidad_suficiente,
    es_hora_dorada,
    movil_compatible,
    nombre_servicio,
    nombres_servicios,
    servicios_faltantes,
)


def test_urgencias_es_obligatorio_aunque_nadie_lo_pida():
    # Una sede sin urgencias habilitadas no puede recibir un traslado,
    # asi tenga todo lo demas.
    faltantes = servicios_faltantes([HEMODINAMIA, UCI_ADULTOS], [HEMODINAMIA])
    assert faltantes == [URGENCIAS]


def test_sede_completa_no_tiene_faltantes():
    assert servicios_faltantes([URGENCIAS, HEMODINAMIA, UCI_ADULTOS], [HEMODINAMIA, UCI_ADULTOS]) == []


def test_reporta_todos_los_faltantes_sin_duplicar():
    faltantes = servicios_faltantes([URGENCIAS], [HEMODINAMIA, HEMODINAMIA, UCI_ADULTOS])
    assert faltantes == [HEMODINAMIA, UCI_ADULTOS]


def test_urgencias_pedido_explicitamente_no_se_duplica():
    assert servicios_faltantes([], [URGENCIAS]) == [URGENCIAS]


@pytest.mark.parametrize(
    ("sede", "requerida", "esperado"),
    [
        ("alta", "alta", True),
        ("alta", "baja", True),
        ("media", "alta", False),
        ("baja", "media", False),
        ("media", "media", True),
    ],
)
def test_complejidad_suficiente(sede, requerida, esperado):
    assert complejidad_suficiente(sede, requerida) is esperado


def test_tab_no_puede_llevar_paciente_que_requiere_medico():
    assert movil_compatible("TAB", requiere_medico_a_bordo=True) is False
    assert movil_compatible("TAM", requiere_medico_a_bordo=True) is True
    assert movil_compatible("TAB", requiere_medico_a_bordo=False) is True


def test_todo_servicio_seleccionable_tiene_nombre():
    # Si un codigo entra al catalogo del LLM sin nombre, la UI muestra
    # "Servicio 999" y el motivo de descarte queda ilegible.
    sin_nombre = [c for c in SERVICIOS_SELECCIONABLES if nombre_servicio(c).startswith("Servicio ")]
    assert sin_nombre == []


def test_nombres_servicios_arma_el_motivo_de_descarte():
    assert nombres_servicios([HEMODINAMIA, UCI_ADULTOS]) == (
        "Hemodinamia e intervencionismo + Cuidado intensivo adultos"
    )


def test_hora_dorada_es_triage_1_y_2():
    assert [t for t in (1, 2, 3, 4, 5) if es_hora_dorada(t)] == [1, 2]


def test_408_es_radioterapia_no_hemodinamia():
    # El README original traia este codigo mal. Que no vuelva.
    assert nombre_servicio(408) == "Radioterapia"
    assert HEMODINAMIA == 743
