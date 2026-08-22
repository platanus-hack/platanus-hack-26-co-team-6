"""Verificacion de una extraccion contra lo que espera un dictado del corpus.

Devuelve la lista de fallas (vacia = paso). Se usa igual desde pytest y desde
el runner contra la API real, para que nunca haya dos definiciones de "bien".
"""

from app.schemas import ExtraccionClinica
from app.servicios_reps import SERVICIOS_SELECCIONABLES, URGENCIAS, nombre_servicio

from .corpus import Dictado


def verificar(d: Dictado, e: ExtraccionClinica) -> list[str]:
    fallas: list[str] = []

    if d.triage_esperado is not None and e.triage != d.triage_esperado:
        fallas.append(f"triage {e.triage}, esperaba {d.triage_esperado}")

    # "maximo" en gravedad = numero menor o igual. Regla 5 del prompt.
    if d.triage_maximo is not None and e.triage > d.triage_maximo:
        fallas.append(f"triage {e.triage}, esperaba {d.triage_maximo} o más grave")

    for cod in d.servicios_deben_incluir:
        if cod not in e.servicios_requeridos:
            fallas.append(f"falta servicio {cod} ({nombre_servicio(cod)})")

    for cod in d.servicios_no_deben_incluir:
        if cod in e.servicios_requeridos:
            fallas.append(f"sobre-pide {cod} ({nombre_servicio(cod)})")

    # Invariantes que aplican a TODO dictado, los pida o no.
    fuera = [c for c in e.servicios_requeridos if c not in SERVICIOS_SELECCIONABLES]
    if fuera:
        fallas.append(f"códigos fuera del catálogo: {fuera}")

    if URGENCIAS in e.servicios_requeridos:
        fallas.append("incluye 1102 (urgencias); el sistema ya lo agrega (regla 2)")

    if len(e.signos_alarma) > 4:
        fallas.append(f"{len(e.signos_alarma)} signos de alarma, máximo 4")

    if d.requiere_medico_a_bordo is not None and e.requiere_medico_a_bordo != d.requiere_medico_a_bordo:
        fallas.append(
            f"requiereMedicoABordo={e.requiere_medico_a_bordo}, "
            f"esperaba {d.requiere_medico_a_bordo}"
        )

    if d.confianza_maxima is not None and e.confianza > d.confianza_maxima:
        fallas.append(f"confianza {e.confianza}, esperaba ≤ {d.confianza_maxima}")

    if d.confianza_minima is not None and e.confianza < d.confianza_minima:
        fallas.append(f"confianza {e.confianza}, esperaba ≥ {d.confianza_minima}")

    if d.cie10_debe_ser_nulo and e.dx_cie10 is not None:
        fallas.append(f"inventó CIE-10 '{e.dx_cie10}' con un dictado insuficiente")

    if d.edad_debe_ser_nula and e.edad is not None:
        fallas.append(f"inventó edad {e.edad}; el dictado no la da")

    if d.edad_esperada is not None and e.edad != d.edad_esperada:
        fallas.append(f"edad {e.edad}, esperaba {d.edad_esperada}")

    if d.sexo_esperado is not None and e.sexo != d.sexo_esperado:
        fallas.append(f"sexo {e.sexo}, esperaba {d.sexo_esperado}")

    return fallas
