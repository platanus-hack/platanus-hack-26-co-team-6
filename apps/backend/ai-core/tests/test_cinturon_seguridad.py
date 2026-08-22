"""El cinturón de seguridad sobre la salida de Claude.

Un código REPS alucinado no da error: simplemente ninguna sede lo tiene y el
ranking sale VACÍO. Es el fallo más caro del sistema y el más silencioso.
"""

from types import SimpleNamespace

import pytest

from app.schemas import ExtraccionClinica
from app.triage import extraer_con_claude


def _claude_que_responde(extraccion: ExtraccionClinica, monkeypatch):
    """Sustituye el cliente Anthropic por uno que devuelve `extraccion`."""

    async def parse(**kwargs):
        parse.kwargs = kwargs
        return SimpleNamespace(parsed_output=extraccion)

    monkeypatch.setattr(
        "app.triage._cliente",
        lambda: SimpleNamespace(messages=SimpleNamespace(parse=parse)),
    )
    return parse


def _base(**overrides) -> ExtraccionClinica:
    datos = dict(
        resumen="x",
        triage=2,
        dx_cie10=None,
        dx_descripcion="x",
        servicios_requeridos=[],
        complejidad_requerida="alta",
        edad=None,
        sexo="desconocido",
        signos_alarma=[],
        requiere_medico_a_bordo=False,
        confianza=0.9,
    )
    datos.update(overrides)
    return ExtraccionClinica(**datos)


@pytest.mark.asyncio
async def test_descarta_codigos_fuera_del_catalogo(monkeypatch):
    # 999 no existe; 408 (radioterapia) existe en el REPS pero no es
    # seleccionable para un traslado de urgencias.
    _claude_que_responde(_base(servicios_requeridos=[743, 999, 110, 408]), monkeypatch)

    e = await extraer_con_claude("dictado cualquiera")

    assert e.servicios_requeridos == [743, 110]


@pytest.mark.asyncio
async def test_recorta_signos_de_alarma_a_cuatro(monkeypatch):
    _claude_que_responde(_base(signos_alarma=list("abcdef")), monkeypatch)

    e = await extraer_con_claude("dictado cualquiera")

    assert e.signos_alarma == ["a", "b", "c", "d"]


@pytest.mark.asyncio
async def test_sin_salida_parseable_lanza(monkeypatch):
    async def parse(**kwargs):
        return SimpleNamespace(parsed_output=None)

    monkeypatch.setattr(
        "app.triage._cliente",
        lambda: SimpleNamespace(messages=SimpleNamespace(parse=parse)),
    )

    with pytest.raises(ValueError):
        await extraer_con_claude("dictado cualquiera")


@pytest.mark.asyncio
async def test_manda_el_modelo_y_el_esfuerzo_configurados(monkeypatch):
    # `effort` es la decisión de latencia del pitch: si se pierde en un
    # refactor, la latencia se dispara sin que nadie lo note.
    parse = _claude_que_responde(_base(), monkeypatch)

    await extraer_con_claude("dictado cualquiera")

    assert parse.kwargs["model"] == "claude-opus-5"
    assert parse.kwargs["output_config"] == {"effort": "low"}
    assert parse.kwargs["output_format"] is ExtraccionClinica


@pytest.mark.asyncio
async def test_el_catalogo_permitido_viaja_en_el_prompt(monkeypatch):
    parse = _claude_que_responde(_base(), monkeypatch)

    await extraer_con_claude("dictado cualquiera")

    system = parse.kwargs["system"]
    assert "743 = Hemodinamia e intervencionismo" in system
    assert "108 = Cuidado intensivo neonatal" in system
    # 408 es radioterapia: no debe ofrecerse como opción.
    assert "408 =" not in system
