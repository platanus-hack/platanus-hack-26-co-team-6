"""`POST /despacho` — el punto de entrada que faltaba.

Aquí ENTRA una emergencia y sale una ambulancia en camino. Sin esto, todo el
flujo saliente estaba construido y nadie podía dispararlo.

QUIÉN LO LLAMA
  Hoy: el tablero del CRUE, o un `curl` para probar. Mañana, cuando exista la
  integración, el 123. La forma del cuerpo es la misma en los tres casos, que
  es lo que permite cambiar de origen sin tocar nada más.

⚠️ PROTEGIDO. Cada llamada manda un WhatsApp real y pone una ambulancia en
   movimiento. Va detrás de `SECRETO_ENDPOINT`, igual que la telefonía.
"""

import logging
from typing import Any

from fastapi import APIRouter, Header, HTTPException

from ..clientes import core
from ..logistica import asignar
from ..turno import Lugar, todos

log = logging.getLogger(__name__)

router = APIRouter(prefix="/despacho", tags=["despacho"])


def _autorizar(secreto: str | None) -> None:
    from ..config import settings

    if settings.secreto_endpoint and secreto != settings.secreto_endpoint:
        raise HTTPException(status_code=401, detail="Secreto inválido")


@router.get("/turnos")
def turnos(x_secreto: str | None = Header(None, alias="X-Secreto")) -> dict[str, Any]:
    """Qué ambulancia va en qué punto. Es lo que pinta el mapa del CRUE.

    También es la forma de verificar el despliegue sin mandarle un WhatsApp a
    nadie: si aquí aparecen los turnos, el canal está vivo.
    """
    _autorizar(x_secreto)
    ts = todos()
    return {
        "turnos": [t.resumen() for t in ts],
        "total": len(ts),
        # Un turno abierto significa que ESA unidad tiene la ventana de 24 h
        # de WhatsApp abierta. Sin turnos, ningún despacho saliente va a
        # llegar, y conviene verlo antes de intentarlo.
        "conVentanaAbierta": len(ts),
    }


@router.post("")
async def despachar_emergencia(
    cuerpo: dict[str, Any],
    x_secreto: str | None = Header(None, alias="X-Secreto"),
) -> dict[str, Any]:
    """Entra una emergencia, sale una ambulancia.

    ```json
    { "unidadId": "AMB-014",
      "lat": 4.628, "lng": -74.155,
      "direccion": "Calle 80 #68-15",     // opcional: se geocodifica si falta
      "detalle": "Apto 302",              // opcional
      "descripcion": "Masculino 54, dolor precordial" }
    ```

    `unidadId` es opcional: sin él se elige **la unidad libre más cercana**
    entre las que tienen turno abierto.
    """
    _autorizar(x_secreto)

    lat, lng = cuerpo.get("lat"), cuerpo.get("lng")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        raise HTTPException(status_code=400, detail="Faltan `lat` y `lng`")

    unidad = (cuerpo.get("unidadId") or "").strip().upper() or _mas_cercana(lat, lng)
    if not unidad:
        # No es un error del que llama: es que no hay a quién mandar. Decirlo
        # así permite que el CRUE escale en vez de reintentar.
        raise HTTPException(
            status_code=409,
            detail=(
                "No hay ninguna unidad con turno abierto. Un paramédico tiene "
                "que declararse por WhatsApp («soy la AMB-014») para que PULSO "
                "pueda escribirle."
            ),
        )

    direccion = (cuerpo.get("direccion") or "").strip() or await _direccion(lat, lng)

    lugar = Lugar(
        lat=float(lat),
        lng=float(lng),
        direccion=direccion,
        detalle=(cuerpo.get("detalle") or "").strip() or None,
    )
    descripcion = (cuerpo.get("descripcion") or "").strip()

    if not await asignar(unidad, lugar, descripcion, cuerpo.get("casoId")):
        raise HTTPException(
            status_code=409,
            detail=f"{unidad} no puede aceptar una asignación ahora mismo.",
        )

    return {
        "unidadId": unidad,
        "direccion": direccion,
        # Si es null, el paramédico va a recibir coordenadas. Feo pero honesto:
        # inventar una dirección manda la ambulancia a otro sitio.
        "geocodificada": bool(direccion) and not cuerpo.get("direccion"),
    }


def _mas_cercana(lat: float, lng: float) -> str | None:
    """La unidad libre más cercana, entre las que tienen turno abierto.

    Sólo se consideran las que están en `libre` o `cubriendo`: no se saca a
    nadie de un traslado con paciente a bordo.
    """
    from ..turno import Estado

    disponibles = [
        t for t in todos()
        if t.estado in (Estado.LIBRE, Estado.CUBRIENDO)
    ]
    if not disponibles:
        return None

    def lejos(t) -> float:
        p = t.d if t.estado == Estado.CUBRIENDO else t.a
        if p.lat is None or p.lng is None:
            # Sin posición conocida, al final de la cola: mandar a la ciega
            # cuando hay alguien ubicado es peor que esperar.
            return float("inf")
        return (p.lat - lat) ** 2 + (p.lng - lng) ** 2

    return min(disponibles, key=lejos).unidad_id


async def _direccion(lat: float, lng: float) -> str | None:
    """Coordenadas → dirección legible. None si Mapbox no la reconoce."""
    try:
        r = await core.direccion({"lat": lat, "lng": lng})
        return r.get("direccion")
    except Exception:
        log.warning("[despacho] sin geocodificación para %s,%s", lat, lng)
        return None
