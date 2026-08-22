"""POST /v1/triage — el parser clinico de PULSO."""

import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from ..schemas import ORIGEN_DEMO, Caso, TriageRequest, TriageResponse
from ..triage import extraer

router = APIRouter(prefix="/v1", tags=["triage"])

LARGO_MINIMO_DICTADO = 10


@router.post("/triage", response_model=TriageResponse, response_model_by_alias=True)
async def triage(cuerpo: TriageRequest) -> TriageResponse:
    t0 = time.perf_counter()

    texto = cuerpo.texto.strip()
    if len(texto) < LARGO_MINIMO_DICTADO:
        raise HTTPException(
            status_code=400,
            detail=f"Dictado demasiado corto. Mínimo {LARGO_MINIMO_DICTADO} caracteres.",
        )

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
    )
