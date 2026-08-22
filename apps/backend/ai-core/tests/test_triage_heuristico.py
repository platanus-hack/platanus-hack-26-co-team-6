"""La heurística es la red de seguridad, no el producto.

Estos tests fijan lo que garantiza (nunca revienta, siempre marca 0.35) y
documentan lo que NO resuelve — esos casos son el trabajo del LLM y viven
en `evals/corpus.py`.
"""

import pytest

from app.servicios_reps import SERVICIOS_SELECCIONABLES, URGENCIAS
from app.triage_heuristico import extraccion_heuristica
from evals.corpus import CORPUS


@pytest.mark.parametrize("d", CORPUS, ids=lambda d: d.etiqueta)
def test_nunca_revienta_y_respeta_el_catalogo(d):
    # Sea cual sea el dictado, la heurística tiene que devolver algo válido:
    # es lo único que corre si no hay API key en medio del pitch.
    e = extraccion_heuristica(d.texto)
    assert 1 <= e.triage <= 5
    assert all(c in SERVICIOS_SELECCIONABLES for c in e.servicios_requeridos)
    assert URGENCIAS not in e.servicios_requeridos
    assert e.servicios_requeridos, "un ranking sin servicios exigidos no filtra nada"


def test_confianza_siempre_035_es_la_senal_de_que_no_hubo_llm():
    for d in CORPUS:
        assert extraccion_heuristica(d.texto).confianza == 0.35


def test_dictado_vacio_no_revienta():
    e = extraccion_heuristica("")
    assert e.triage == 3
    assert e.servicios_requeridos == [110]


def test_lee_edad_sin_tilde():
    # Las transcripciones de voz se comen la eñe constantemente.
    assert extraccion_heuristica("hombre de 61 anos con dolor").edad == 61
    assert extraccion_heuristica("hombre de 61 años con dolor").edad == 61


def test_politrauma_pisa_el_triage_de_los_demas():
    # trauma se evalúa de último a propósito: un politrauma manda.
    e = extraccion_heuristica("Paciente con infarto y politrauma por atropellamiento")
    assert e.triage == 1
    assert e.dx_descripcion == "Politraumatismo"


def test_pediatrico_pide_uci_pediatrica():
    e = extraccion_heuristica("Menor de 9 años, atropellamiento, trauma craneoencefálico")
    assert 109 in e.servicios_requeridos


def test_inestable_obliga_medico_a_bordo():
    assert extraccion_heuristica("Paciente en shock, hipotenso").requiere_medico_a_bordo
