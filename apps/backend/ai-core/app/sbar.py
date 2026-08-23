"""Caso estructurado → la entrega SBAR que lee el médico receptor.

S — Situación · B — Background (antecedente) · A — Análisis · R — Recomendación

Es el formato con el que los clínicos se entregan pacientes, y es lo que el
hospital lee ANTES de que llegue la camilla.

POR QUÉ ESTO SÍ ES IA Y EL RUTEO NO
  El ruteo es una tabla: filtro duro más aritmética en minutos. Convertir un
  dictado desordenado en cuatro líneas que un médico lee en cinco segundos
  es exactamente lo que un LLM hace bien y una plantilla hace mal.

EL RESPALDO NO ES UN ADORNO
  Sin API key se arma desde los campos ya estructurados del caso. Sale peor
  redactado y sigue siendo correcto — y lo dice (`motor: "plantilla"`). Un
  SBAR feo pero cierto sirve; uno bonito e inventado no.

CUATRO LÍNEAS. Un médico de urgencias lo lee en una pantalla, a dos metros,
mientras hace otra cosa. El límite no es estético: es el punto entero.
"""

import logging
import time

from anthropic import AsyncAnthropic

from .config import settings
from .prompts import prompt_sbar, version_prompt
from .schemas import Caso, Sbar
from .servicios_reps import ETIQUETA_TRIAGE, nombres_servicios

log = logging.getLogger(__name__)

#: Tope por línea. No es capricho: pasado esto deja de leerse de un vistazo.
#: Se recorta en el borde, no a la mitad de una palabra.
MAX_LINEA = 160


async def generar(caso: Caso) -> tuple[Sbar, str, str | None]:
    """Devuelve (sbar, motor, version_prompt). Nunca lanza.

    Un fallo aquí no puede dejar al médico receptor sin entrega: se cae a la
    plantilla, que siempre puede armarse porque el caso ya está estructurado.
    """
    if not settings.anthropic_api_key:
        return _plantilla(caso), "plantilla", None

    try:
        sbar = await _con_claude(caso)
        return _recortar(sbar), "claude", version_prompt("sbar")
    except Exception:
        log.exception("[pulso] el SBAR falló, usando plantilla")
        return _plantilla(caso), "plantilla", None


async def _con_claude(caso: Caso) -> Sbar:
    cliente = AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=20.0)

    # Se le pasa el caso YA ESTRUCTURADO, no el dictado crudo. El dictado no
    # sale del servidor, y además el trabajo de extraerlo ya se hizo: repetirlo
    # invitaría al modelo a re-interpretar y a discrepar consigo mismo.
    res = await cliente.messages.parse(
        model=settings.modelo_triage,
        max_tokens=1024,
        system=prompt_sbar(),
        messages=[{"role": "user", "content": _describir(caso)}],
        output_format=Sbar,
        output_config={"effort": settings.esfuerzo_triage},
    )
    if res.parsed_output is None:
        raise ValueError("Claude no devolvió un SBAR parseable")
    return res.parsed_output


def _describir(caso: Caso) -> str:
    """El caso, en campos. No el dictado."""
    edad = f"{caso.edad} años" if caso.edad is not None else "edad no referida"
    sexo = {"M": "masculino", "F": "femenino"}.get(caso.sexo, "sexo no referido")
    lineas = [
        f"Paciente: {edad}, {sexo}",
        f"Resumen: {caso.resumen}",
        f"Triage: {ETIQUETA_TRIAGE.get(caso.triage, caso.triage)}",
        f"Diagnóstico probable: {caso.dx_descripcion}"
        + (f" ({caso.dx_cie10})" if caso.dx_cie10 else " (sin CIE-10)"),
        f"Servicios requeridos: {nombres_servicios(caso.servicios_requeridos) or 'ninguno'}",
        f"Móvil: {caso.tipo_movil}"
        + (", requiere médico a bordo" if caso.requiere_medico_a_bordo else ""),
    ]
    if caso.signos_alarma:
        lineas.append(f"Signos de alarma: {', '.join(caso.signos_alarma)}")
    if caso.confianza < 0.5:
        # Que el modelo lo sepa es lo que le permite decirlo en A en vez de
        # fabricar una certeza.
        lineas.append(
            f"⚠️ Confianza de la extracción: {caso.confianza:.2f} — dictado incompleto"
        )
    return "\n".join(lineas)


# ─────────────────────────────────────────────────────────────────
# Respaldo sin LLM
# ─────────────────────────────────────────────────────────────────


def _plantilla(caso: Caso) -> Sbar:
    """Desde los campos ya estructurados. Peor redactado, igual de correcto."""
    edad = f"{caso.edad}" if caso.edad is not None else "edad ?"
    sexo = {"M": "Masculino", "F": "Femenino"}.get(caso.sexo, "Sexo no referido")

    alarma = f" · {', '.join(caso.signos_alarma[:2])}" if caso.signos_alarma else ""
    situacion = f"{sexo} {edad}, {caso.resumen}{alarma}"

    # B es el campo donde más fácil se inventa. Sin antecedentes en el caso,
    # se dice que no los hay — no se rellena con lo que suene plausible.
    antecedente = "Sin antecedentes referidos en el reporte prehospitalario"

    dx = caso.dx_descripcion + (f" ({caso.dx_cie10})" if caso.dx_cie10 else "")
    duda = ", extracción de baja confianza" if caso.confianza < 0.5 else ""
    analisis = f"{dx} · {ETIQUETA_TRIAGE.get(caso.triage, caso.triage)}{duda}"

    servicios = nombres_servicios(caso.servicios_requeridos)
    movil = " · llega en TAM" if caso.tipo_movil == "TAM" else ""
    recomendacion = (
        f"Tener listo: {servicios}{movil}" if servicios
        else f"Recepción en urgencias{movil}"
    )

    return _recortar(
        Sbar(
            situacion=situacion,
            antecedente=antecedente,
            analisis=analisis,
            recomendacion=recomendacion,
        )
    )


def _recortar(s: Sbar) -> Sbar:
    """Una línea por letra, y que quepa.

    El modelo a veces devuelve un párrafo aunque el prompt pida una línea.
    Aplanar y recortar aquí es más barato que reintentar, y garantiza el
    contrato pase lo que pase del otro lado.
    """
    return Sbar(**{k: _linea(v) for k, v in s.model_dump().items()})


def _linea(texto: str) -> str:
    plano = " ".join((texto or "").split())
    if len(plano) <= MAX_LINEA:
        return plano
    # Cortar en el último espacio antes del tope: partir una palabra a la
    # mitad se lee como un error, no como un resumen.
    corte = plano[: MAX_LINEA - 1]
    return corte[: corte.rfind(" ")].rstrip(" ,;·") + "…" if " " in corte else corte + "…"
