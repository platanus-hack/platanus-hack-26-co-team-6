"""Tarea 0.5 · un solo prompt clínico.

El prompt existía DOS VECES, idéntico carácter por carácter, en Python y en
TypeScript. La única garantía de que siguieran iguales era acordarse.

Estos tests son la red, y el `golden` es el mismo que verifica el test de
TypeScript: si los dos pasan, los dos motores leen exactamente lo mismo — sin
tener que levantar los dos runtimes en un job cruzado que nadie mira.
"""

import hashlib
import pathlib

from app.prompts import CATALOGO, PLANTILLA, catalogo, prompt_triage, version_prompt
from app.servicios_reps import NOMBRE_SERVICIO, SERVICIOS_SELECCIONABLES

GOLDEN = PLANTILLA.parent / "triage.rendered.txt"


def test_el_render_coincide_con_el_golden():
    assert prompt_triage() == GOLDEN.read_text(encoding="utf-8")


def test_no_lleva_comentarios_al_modelo():
    # La cabecera es para quien edita el archivo. Mandársela al modelo sería
    # gastar tokens en instrucciones sobre el archivo, no sobre el caso.
    assert not any(l.startswith("#") for l in prompt_triage().splitlines())


def test_interpola_el_catalogo():
    assert "{{CATALOGO_SERVICIOS}}" not in prompt_triage()
    assert "743 = Hemodinamia e intervencionismo" in prompt_triage()


def test_respeta_el_orden_de_seleccionables():
    # Cambiar el orden cambia el prompt y con él la salida del modelo.
    p = prompt_triage()
    assert p.index("1102 = Urgencias") < p.index("110 = Cuidado")


def test_no_ofrece_codigos_fuera_del_catalogo():
    # 408 es radioterapia: existe en el REPS y no va en un traslado urgente.
    assert "408 =" not in prompt_triage()


def test_todo_seleccionable_aparece_en_el_prompt():
    p = prompt_triage()
    faltan = [c for c in SERVICIOS_SELECCIONABLES if f"  {c} = " not in p]
    assert faltan == [], f"códigos que el modelo no puede elegir: {faltan}"


# ── El catálogo también era doble ────────────────────────────────


def test_el_json_y_el_modulo_de_python_dicen_lo_mismo():
    # Mientras `servicios_reps.py` conserve su propia copia, este test es la
    # red. El día que lea del JSON, se vuelve trivial y se puede borrar.
    cat = catalogo()
    assert cat["seleccionables"] == SERVICIOS_SELECCIONABLES
    assert {int(k): v for k, v in cat["servicios"].items()} == NOMBRE_SERVICIO


def test_todo_seleccionable_tiene_nombre_en_el_json():
    cat = catalogo()
    sin_nombre = [c for c in cat["seleccionables"] if str(c) not in cat["servicios"]]
    assert sin_nombre == []


# ── Versión ──────────────────────────────────────────────────────


def test_la_version_se_deriva_del_contenido():
    esperada = hashlib.sha256(prompt_triage().encode("utf-8")).hexdigest()[:12]
    assert version_prompt() == esperada
    assert len(version_prompt()) == 12


def test_los_archivos_canonicos_existen():
    # Si faltan, el servicio revienta al arrancar. Mejor decirlo aquí.
    assert PLANTILLA.exists(), PLANTILLA
    assert CATALOGO.exists(), CATALOGO
    assert GOLDEN.exists(), f"corre: python3 scripts/prompts/render.py"


# ── El prompt de SBAR (4.2) sigue las mismas reglas ──────────────


def test_el_sbar_tambien_tiene_golden():
    from app.prompts import prompt

    golden = PLANTILLA.parent / "sbar.rendered.txt"
    assert golden.exists(), "corre: python3 scripts/prompts/render.py"
    assert prompt("sbar") == golden.read_text(encoding="utf-8")


def test_el_sbar_no_lleva_comentarios_al_modelo():
    from app.prompts import prompt

    assert not any(l.startswith("#") for l in prompt("sbar").splitlines())


def test_los_dos_prompts_tienen_versiones_distintas():
    from app.prompts import version_prompt

    assert version_prompt("triage") != version_prompt("sbar")


def test_agregar_el_sbar_no_movio_la_version_del_triaje():
    # Si esto falla, el prompt clínico cambió sin querer y los evals dejan de
    # ser comparables con los de antes.
    from app.prompts import version_prompt

    assert version_prompt("triage") == "b6b3e3556c87"
