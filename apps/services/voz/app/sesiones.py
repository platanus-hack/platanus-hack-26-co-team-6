"""Quien esta hablando y sobre que caso.

WhatsApp solo trae un numero de telefono. Para responder "donde queda" hay que
saber cual es SU caso, y eso no viene en el mensaje.

⚠️ ESTADO EN MEMORIA, con la misma limitacion que el `AlmacenService` de core:
   se pierde al reiniciar y no se comparte entre instancias. En Render con una
   sola instancia alcanza para el demo. Con dos instancias, un paramedico
   puede escribir a una y recibir de la otra, y el "donde queda" responde
   vacio.

   El arreglo de verdad es que core lo guarde en Supabase junto al caso
   (`caso.telefono_reporta`). Mientras tanto, esto y un aviso honesto.

La idempotencia del webhook YA NO vive aquí: se mudó a `webhooks_recibidos`,
que la guarda en Postgres. Estaba junto a las sesiones por cercanía, pero son
dos problemas distintos — la sesión se puede perder al reiniciar sin que muera
nadie; un mensaje deduplicado dos veces despacha dos ambulancias.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class Sesion:
    telefono: str
    caso_id: str | None = None
    sede_codigo: str | None = None
    sede_nombre: str | None = None
    sede_lat: float | None = None
    sede_lng: float | None = None
    sede_direccion: str | None = None
    actualizada_en: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


_sesiones: dict[str, Sesion] = {}


def obtener(telefono: str) -> Sesion:
    if telefono not in _sesiones:
        _sesiones[telefono] = Sesion(telefono=telefono)
    return _sesiones[telefono]


def guardar(sesion: Sesion) -> None:
    sesion.actualizada_en = datetime.now(timezone.utc).isoformat()
    _sesiones[sesion.telefono] = sesion


def reiniciar() -> None:
    """Sólo para tests y para dejar limpio antes del pitch."""
    _sesiones.clear()
