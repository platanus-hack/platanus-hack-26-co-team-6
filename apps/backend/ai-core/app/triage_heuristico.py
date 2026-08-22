"""Extractor clinico de emergencia, por palabras clave.

No pretende ser bueno. Existe para que el servicio nunca devuelva error por
falta de credencial: sin ANTHROPIC_API_KEY, o si Claude revienta, esto
responde. Devuelve siempre `confianza: 0.35` — ese numero es la senal de
"esto NO salio del LLM".

Puerto 1:1 de `apps/frontend/lib/triage-heuristico.ts`, incluido el orden de
evaluacion: trauma se evalua de ultimo y por eso pisa el triage de cardiaco
y neuro. Es intencional (un politrauma manda sobre el resto), no un bug.
"""

import re

from .schemas import ExtraccionClinica

_CARDIACO = re.compile(r"supra ?st|supradesnivel|precordial|infarto|iam|sca")
_NEURO = re.compile(r"acv|hemipare|afasia|glasgow|cefalea súbita|convuls|tec|craneoencef")
_TRAUMA = re.compile(r"trauma|atropell|herida|fractura|deformidad|politrauma|arma")
_PEDIATRICO = re.compile(r"menor|niñ|pediátric|lactante|meses de edad")
_INESTABLE = re.compile(
    r"inestable|hipoten|shock|taquicárd|palidez|diafor|vía aérea|intubad"
)
# Acepta "54 anos" ademas de "54 años": las transcripciones de voz y los
# teclados sin tilde se comen la enie constantemente.
_EDAD = re.compile(r"(\d{1,3})\s*a[nñ]os")
_MASCULINO = re.compile(r"masculino|hombre|varón")
_FEMENINO = re.compile(r"femenina|femenino|mujer")


def extraccion_heuristica(texto: str) -> ExtraccionClinica:
    t = texto.lower()
    servicios: list[int] = []
    dx_cie10: str | None = None
    dx_descripcion = "Cuadro clínico no clasificado"
    triage = 3

    cardiaco = bool(_CARDIACO.search(t))
    neuro = bool(_NEURO.search(t))
    trauma = bool(_TRAUMA.search(t))
    pediatrico = bool(_PEDIATRICO.search(t))
    inestable = bool(_INESTABLE.search(t))

    if cardiaco:
        servicios += [743, 110]
        dx_cie10 = "I21.9"
        dx_descripcion = "Síndrome coronario agudo"
        triage = 2
    if neuro:
        servicios += [245, 110, 744]
        dx_cie10 = "I63.9"
        dx_descripcion = "Evento cerebrovascular"
        triage = 2
    if trauma:
        servicios += [203, 109 if pediatrico else 110]
        dx_cie10 = "T07"
        dx_descripcion = "Politraumatismo"
        triage = 1
    if not servicios:
        servicios.append(110)
    if inestable:
        triage = min(triage, 2)

    m_edad = _EDAD.search(t)
    edad = int(m_edad.group(1)) if m_edad else (8 if pediatrico else None)

    if _MASCULINO.search(t):
        sexo = "M"
    elif _FEMENINO.search(t):
        sexo = "F"
    else:
        sexo = "desconocido"

    return ExtraccionClinica(
        resumen=texto[:140],
        triage=triage,
        dx_cie10=dx_cie10,
        dx_descripcion=dx_descripcion,
        servicios_requeridos=list(dict.fromkeys(servicios)),
        complejidad_requerida="alta",
        edad=edad,
        sexo=sexo,
        signos_alarma=["Inestabilidad hemodinámica"] if inestable else [],
        requiere_medico_a_bordo=inestable or triage == 1,
        confianza=0.35,
    )
