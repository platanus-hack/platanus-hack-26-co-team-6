"""POST /v1/triage — el parser clinico de PULSO.

Dos entradas, misma salida:
  · `texto`       — el dictado ya transcrito (la PWA usa Web Speech API)
  · `audioBase64` — audio crudo; se transcribe aqui mismo (WhatsApp)

El camino de audio hace STT + extraccion en UNA llamada a proposito: cada
salto de red se paga en el numero del pitch, y WhatsApp ya trae los suyos.
"""

import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from ..schemas import ORIGEN_DEMO, Caso, TriageRequest, TriageResponse, Transcripcion
from ..triage import extraer
from .transcribir import _transcribir_o_error, decodificar

router = APIRouter(prefix="/v1", tags=["triage"])

LARGO_MINIMO_DICTADO = 10


@router.post("/triage", response_model=TriageResponse, response_model_by_alias=True)
async def triage(cuerpo: TriageRequest) -> TriageResponse:
    t0 = time.perf_counter()

    texto = cuerpo.texto.strip()
    transcripcion: Transcripcion | None = None

    # "No mandaste nada" y "mandaste poco" son errores distintos y se depuran
    # distinto. Antes esto era un 422 de Pydantic por campo faltante; ahora que
    # `texto` es opcional (existe el camino de audio) hay que decirlo aquí.
    if not texto and not cuerpo.audio_base64:
        raise HTTPException(
            status_code=400,
            detail="Manda `texto` con el dictado, o `audioBase64` con la nota de voz.",
        )

    # Si no vino texto pero sí audio, transcribimos primero. Si vinieron los
    # dos, manda el texto: quien ya transcribió sabe algo que nosotros no.
    if not texto and cuerpo.audio_base64:
        transcripcion = await _transcribir_o_error(
            decodificar(cuerpo.audio_base64), cuerpo.audio_mime
        )
        texto = transcripcion.texto.strip()

    if len(texto) < LARGO_MINIMO_DICTADO:
        # El mensaje distingue los dos casos: "el audio salió vacío" y "no
        # mandaste nada" se depuran de formas muy distintas.
        detalle = (
            f"El audio transcribió sólo {len(texto)} caracteres. "
            "Revisa la nota de voz."
            if transcripcion is not None
            else f"Dictado demasiado corto. Mínimo {LARGO_MINIMO_DICTADO} caracteres."
        )
        raise HTTPException(status_code=400, detail=detalle)

    extraccion, motor = await extraer(texto)

    caso = Caso(
        **extraccion.model_dump(),
        id=str(uuid.uuid4()),
        texto_crudo=texto,
        origen=cuerpo.origen or ORIGEN_DEMO,
        # Si el paciente requiere medico a bordo, el movil tiene que ser TAM.
        tipo_movil=cuerpo.tipo_movil
        or ("TAM" if extraccion.requiere_medico_a_bordo else "TAB"),
        creado_en=datetime.now(timezone.utc).isoformat(),
    )

    return TriageResponse(
        caso=caso,
        latencia_ms=round((time.perf_counter() - t0) * 1000),
        motor=motor,
        transcripcion=transcripcion,
    )
