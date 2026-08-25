"""Tarea 4.2 · el generador de SBAR.

Es lo PRIMERO que un clínico va a juzgar. Un SBAR que suena a resumen de LLM
—"El paciente presenta un cuadro compatible con…"— pierde credibilidad al
instante, y con ella se lleva la del resto del sistema, que sí es verdad.
"""

import pytest

from app.config import settings
from app.sbar import MAX_LINEA, _linea, _plantilla, generar
from app.schemas import Caso, Coordenada, Sbar

from factories import caso

#: Aperturas de relleno. Un clínico las detecta y deja de leer.
RELLENO = (
    "el paciente presenta",
    "se trata de",
    "nos encontramos ante",
    "el paciente es un",
    "cuadro compatible con",
)


@pytest.fixture(autouse=True)
def sin_llm(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")


def sin_relleno(texto: str) -> bool:
    return not any(texto.lower().startswith(r) for r in RELLENO)


# ── El contrato: cuatro líneas ───────────────────────────────────


async def test_son_cuatro_lineas_y_ninguna_vacia():
    s, _, _ = await generar(caso())
    campos = s.model_dump()
    assert set(campos) == {"situacion", "antecedente", "analisis", "recomendacion"}
    assert all(v.strip() for v in campos.values())


async def test_ninguna_linea_lleva_salto_de_linea():
    # "Una línea" es literal: se lee en una pantalla a dos metros.
    s, _, _ = await generar(caso())
    assert all("\n" not in v for v in s.model_dump().values())


async def test_ninguna_linea_se_pasa_del_tope():
    s, _, _ = await generar(caso())
    for k, v in s.model_dump().items():
        assert len(v) <= MAX_LINEA, f"{k}: {len(v)} caracteres"


def test_el_recorte_no_parte_palabras():
    largo = "palabra " * 60
    r = _linea(largo)
    assert len(r) <= MAX_LINEA
    assert r.endswith("…")
    assert not r.rstrip("…").endswith("palabr")  # cortada a la mitad


def test_el_recorte_aplana_parrafos():
    # El modelo a veces devuelve un párrafo aunque el prompt pida una línea.
    assert "\n" not in _linea("una\nlínea\ncon saltos")


# ── El respaldo sin LLM ──────────────────────────────────────────


async def test_sin_api_key_usa_la_plantilla_y_lo_dice():
    _, motor, version = await generar(caso())
    assert motor == "plantilla"
    # Sin LLM no hay versión de prompt que reportar: inventarla sería mentir
    # en el campo que existe justo para auditar.
    assert version is None


async def test_la_plantilla_no_inventa_antecedentes():
    """B es donde más fácil se inventa. Una diabetes que nadie mencionó es la
    forma más rápida de perder la confianza de un médico."""
    s, _, _ = await generar(caso())
    assert "sin antecedentes referidos" in s.antecedente.lower()


async def test_la_plantilla_no_suena_a_llm():
    s, _, _ = await generar(caso())
    for k, v in s.model_dump().items():
        assert sin_relleno(v), f"{k} empieza con relleno: {v[:40]}"


async def test_la_plantilla_nombra_los_servicios_del_caso():
    s, _, _ = await generar(caso(servicios_requeridos=[743, 110]))
    assert "Hemodinamia" in s.recomendacion
    assert "Cuidado intensivo adultos" in s.recomendacion


async def test_avisa_que_llega_en_tam():
    # Cambia la recepción: el receptor prepara distinto si viene médico.
    s, _, _ = await generar(caso(tipo_movil="TAM"))
    assert "TAM" in s.recomendacion


async def test_marca_la_confianza_baja_en_el_analisis():
    """Mejor 'posible SCA, dictado incompleto' que una certeza fabricada."""
    c = caso()
    flojo = Caso(**{**c.model_dump(), "confianza": 0.35})
    s = _plantilla(flojo)
    assert "confianza" in s.analisis.lower()


async def test_sin_confianza_baja_no_mete_la_advertencia():
    s, _, _ = await generar(caso())
    assert "confianza" not in s.analisis.lower()


# ── Lo que NO debe salir ─────────────────────────────────────────


async def test_no_repite_el_dictado_crudo():
    """Es una síntesis, y el dictado literal no sale del servidor."""
    c = caso()
    crudo = "SECRETO CLINICO QUE NO DEBE SALIR del dictado literal del paramédico"
    con_dictado = Caso(**{**c.model_dump(), "texto_crudo": crudo})
    s = _plantilla(con_dictado)
    assert "SECRETO CLINICO" not in " ".join(s.model_dump().values())


async def test_no_filtra_las_coordenadas_del_paciente():
    c = caso()
    ubicado = Caso(**{**c.model_dump(), "origen": Coordenada(lat=4.65432, lng=-74.12345)})
    s = _plantilla(ubicado)
    junto = " ".join(s.model_dump().values())
    assert "4.65432" not in junto and "74.12345" not in junto


# ── Bordes ───────────────────────────────────────────────────────


async def test_sin_edad_ni_sexo_no_los_inventa():
    c = caso()
    anonimo = Caso(**{**c.model_dump(), "edad": None, "sexo": "desconocido"})
    s = _plantilla(anonimo)
    assert "edad ?" in s.situacion
    assert "no referido" in s.situacion.lower()


async def test_sin_servicios_igual_recomienda_algo():
    s, _, _ = await generar(caso(servicios_requeridos=[]))
    assert s.recomendacion.strip()
    assert "urgencias" in s.recomendacion.lower()


async def test_si_claude_revienta_cae_a_la_plantilla(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-falsa")

    async def explota(c):
        raise RuntimeError("503 del proveedor")

    monkeypatch.setattr("app.sbar._con_claude", explota)

    s, motor, _ = await generar(caso())
    assert motor == "plantilla"
    assert s.situacion


# ── Todo el corpus produce algo legible ──────────────────────────


async def test_los_casos_del_corpus_producen_sbar_legible():
    """Los mismos dictados con los que se evalúa el parser."""
    from app.triage_heuristico import extraccion_heuristica

    from evals.corpus import CORPUS

    base = caso().model_dump()
    for d in CORPUS:
        e = extraccion_heuristica(d.texto)
        c = Caso(**{**base, **e.model_dump()})
        s = _plantilla(c)
        for k, v in s.model_dump().items():
            assert v.strip(), f"{d.etiqueta} → {k} vacío"
            assert len(v) <= MAX_LINEA, f"{d.etiqueta} → {k} muy largo"
            assert sin_relleno(v), f"{d.etiqueta} → {k} suena a LLM"
