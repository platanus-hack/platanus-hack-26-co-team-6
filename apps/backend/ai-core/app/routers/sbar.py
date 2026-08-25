"""POST /v1/sbar — la entrega que lee el médico receptor.

Separado de `/v1/triage` a propósito: son dos preguntas distintas y con
tiempos distintos. El triaje corre cuando entra el dictado y decide a dónde
va; el SBAR se puede generar después, mientras la ambulancia rueda, y sirve
aunque el destino cambie.
"""

import time

from fastapi import APIRouter

from ..sbar import generar
from ..schemas import SbarRequest, SbarResponse

router = APIRouter(prefix="/v1", tags=["sbar"])


@router.post("/sbar", response_model=SbarResponse, response_model_by_alias=True)
async def sbar(cuerpo: SbarRequest) -> SbarResponse:
    t0 = time.perf_counter()
    entrega, motor, version = await generar(cuerpo.caso)
    return SbarResponse(
        sbar=entrega,
        motor=motor,
        latencia_ms=round((time.perf_counter() - t0) * 1000),
        version_prompt=version,
    )
