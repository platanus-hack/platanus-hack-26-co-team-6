"""POST /v1/score — filtro duro + ranking en minutos.

Es el paso 3 de `/api/match`: los pasos 1 (sedes en el radio, PostGIS) y 2
(ETA con tráfico, Mapbox) son del carril de Zaid y NO viven aquí. ai-core
recibe las sedes y los ETAs ya calculados y devuelve el ranking.

Sin estado a propósito: la historia de cada sede llega en `senales`. Así el
motor es una función pura y el mismo request siempre da el mismo ranking.
"""

import time
from datetime import datetime

from fastapi import APIRouter, HTTPException

from ..schemas import ScoreRequest, ScoreResponse
from ..scoring import rankear
from ..servicios_reps import servicios_faltantes

router = APIRouter(prefix="/v1", tags=["score"])


@router.post("/score", response_model=ScoreResponse, response_model_by_alias=True)
async def score(cuerpo: ScoreRequest) -> ScoreResponse:
    t0 = time.perf_counter()

    if cuerpo.ahora:
        try:
            fecha = datetime.fromisoformat(cuerpo.ahora)
        except ValueError:
            raise HTTPException(
                status_code=400, detail=f"`ahora` no es ISO 8601: {cuerpo.ahora!r}"
            ) from None
    else:
        fecha = datetime.now()

    candidatos = rankear(
        caso=cuerpo.caso,
        sedes=cuerpo.sedes,
        etas=cuerpo.etas,
        senales=cuerpo.senales,
        fecha=fecha,
        limite=cuerpo.limite,
        incluir_descartadas=cuerpo.incluir_descartadas,
    )

    compatibles = sum(
        1
        for s in cuerpo.sedes
        if not servicios_faltantes(s.servicios, cuerpo.caso.servicios_requeridos)
    )

    return ScoreResponse(
        candidatos=candidatos,
        evaluadas=len(cuerpo.sedes),
        compatibles=compatibles,
        latencia_ms=round((time.perf_counter() - t0) * 1000),
    )
