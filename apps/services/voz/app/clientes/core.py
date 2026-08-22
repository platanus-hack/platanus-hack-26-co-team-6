"""Cliente de core (NestJS). El que tiene el estado y la base de datos.

Este servicio no guarda nada: no sabe qué caso es de quién. Todo lo que huela
a estado vive en core, y se le pregunta.
"""

import logging
from typing import Any

import httpx

from ..config import settings

log = logging.getLogger(__name__)


class CoreCaido(RuntimeError):
    """core no respondió o devolvió algo inesperado."""


async def _pedir(metodo: str, ruta: str, **kw: Any) -> dict[str, Any]:
    url = f"{settings.core_base_url.rstrip('/')}{ruta}"
    try:
        async with httpx.AsyncClient(timeout=settings.timeout_core_s) as c:
            res = await c.request(metodo, url, **kw)
    except httpx.HTTPError as e:
        raise CoreCaido(f"core {ruta} inalcanzable: {e}") from e

    if res.status_code >= 400:
        raise CoreCaido(f"core {ruta} devolvió {res.status_code}: {res.text[:200]}")

    try:
        return res.json()
    except ValueError as e:
        raise CoreCaido(f"core {ruta} no devolvió JSON") from e


async def match(caso: dict[str, Any], limite: int = 5) -> dict[str, Any]:
    """Caso → ranking de sedes. core hace PostGIS + Mapbox + scoring."""
    return await _pedir("POST", "/match", json={"caso": caso, "limite": limite})


async def dispatch(caso_id: str, sede_codigo: str, canal: str = "whatsapp") -> dict[str, Any]:
    """Dispara el handshake con la sede."""
    return await _pedir(
        "POST",
        "/dispatch",
        json={"casoId": caso_id, "sedeCodigo": sede_codigo, "canal": canal},
    )


async def estado(caso_id: str) -> dict[str, Any]:
    """Estado vivo de un caso: handshakes, sede aceptada, etc."""
    return await _pedir("GET", "/estado", params={"casoId": caso_id})
