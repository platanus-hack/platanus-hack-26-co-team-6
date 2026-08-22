"""POST /v1/transcribir — audio → texto.

Vive aparte del triaje porque son dos preguntas distintas: "¿qué dijo?" y
"¿qué significa?". Separarlas deja depurar la primera sin pagar la segunda —
y cuando una extracción salga rara en un ensayo, lo primero que hay que
descartar es que el STT haya oído mal.
"""

import base64
import binascii

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..schemas import TranscribirRequest, Transcripcion
from ..transcripcion import (
    FalloTranscripcion,
    SinProveedorSTT,
    proveedor_activo,
    transcribir,
)

router = APIRouter(prefix="/v1", tags=["transcripcion"])


def decodificar(audio_base64: str) -> bytes:
    try:
        return base64.b64decode(audio_base64, validate=True)
    except (binascii.Error, ValueError) as e:
        raise HTTPException(
            status_code=400, detail=f"audioBase64 no es base64 válido: {e}"
        ) from None


async def _transcribir_o_error(audio: bytes, mime: str) -> Transcripcion:
    try:
        t = await transcribir(audio, mime)
    except SinProveedorSTT as e:
        # 503 y no 500: no es un bug, es una credencial que falta. A diferencia
        # del triaje, aquí NO hay heurística a la que caer — sin proveedor no
        # hay texto. Mejor decirlo que fingir que funcionó.
        raise HTTPException(status_code=503, detail=str(e)) from None
    except FalloTranscripcion as e:
        raise HTTPException(status_code=502, detail=str(e)) from None

    return Transcripcion(
        texto=t.texto,
        proveedor=t.proveedor,
        latencia_ms=t.latencia_ms,
        idioma=t.idioma,
    )


@router.post("/transcribir", response_model=Transcripcion, response_model_by_alias=True)
async def transcribir_base64(cuerpo: TranscribirRequest) -> Transcripcion:
    """Lo que llama `core` después de bajar el media de WhatsApp."""
    return await _transcribir_o_error(
        decodificar(cuerpo.audio_base64), cuerpo.audio_mime
    )


@router.post(
    "/transcribir/archivo",
    response_model=Transcripcion,
    response_model_by_alias=True,
)
async def transcribir_archivo(archivo: UploadFile = File(...)) -> Transcripcion:
    """Subida directa. Existe para poder probar con `curl -F` sin armar base64."""
    return await _transcribir_o_error(
        await archivo.read(), archivo.content_type or "audio/ogg"
    )


@router.get("/stt")
def estado_stt() -> dict[str, object]:
    """Qué proveedor correría ahora mismo. Míralo antes de culpar al parser."""
    quien = proveedor_activo()
    return {"disponible": quien is not None, "proveedor": quien}
