"""POST /v1/cobertura — el reparto de zonas C→D.

Función pura: entra la foto de la flota, sale la propuesta. `core` guarda los
locks; ai-core no tiene estado.

⚠️ La salida es una PROPUESTA. PULSO reposiciona unidades libres y le muestra
   al CRUE dónde quedan los huecos; el despacho a una emergencia sigue siendo
   función del CRUE (Res. 1220/2010).
"""

from fastapi import APIRouter

from ..cobertura import calcular
from ..schemas import CoberturaRequest, CoberturaResponse

router = APIRouter(prefix="/v1", tags=["cobertura"])


@router.post(
    "/cobertura", response_model=CoberturaResponse, response_model_by_alias=True
)
async def cobertura(cuerpo: CoberturaRequest) -> CoberturaResponse:
    return calcular(cuerpo)
