"""POST /v1/interpretar — mensaje suelto → una acción decidida.

Es el cerebro del canal de WhatsApp. Recibe lo que escribió (o dictó) el
paramédico y devuelve QUÉ hacer, con los argumentos ya validados en JSON.

No ejecuta nada: ai-core no tiene estado. Quien ejecuta es `core` o el
servicio de voz, que sí saben de qué caso y de qué teléfono se trata.
"""

from fastapi import APIRouter

from ..agente import interpretar
from ..schemas import InterpretarRequest, InterpretarResponse, Transcripcion
from .transcribir import _transcribir_o_error, decodificar

router = APIRouter(prefix="/v1", tags=["agente"])


@router.post(
    "/interpretar",
    response_model=InterpretarResponse,
    response_model_by_alias=True,
)
async def interpretar_mensaje(cuerpo: InterpretarRequest) -> InterpretarResponse:
    mensaje = cuerpo.mensaje.strip()
    transcripcion: Transcripcion | None = None

    # Nota de voz → texto → decisión, en un solo salto. Si vienen los dos,
    # gana el texto: quien ya transcribió no debe pagar el STT otra vez.
    if not mensaje and cuerpo.audio_base64:
        transcripcion = await _transcribir_o_error(
            decodificar(cuerpo.audio_base64), cuerpo.audio_mime
        )
        mensaje = transcripcion.texto.strip()

    decision = await interpretar(mensaje, cuerpo.contexto)

    return InterpretarResponse(
        accion=decision.accion,
        argumentos=decision.argumentos,
        motor=decision.motor,
        latencia_ms=decision.latencia_ms,
        transcripcion=transcripcion,
    )
