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
#: Ids de mensaje ya procesados. WhatsApp reintenta los webhooks: sin esto un
#: solo reporte dispara dos traslados.
_vistos: set[str] = set()
_MAX_VISTOS = 2000


def obtener(telefono: str) -> Sesion:
    if telefono not in _sesiones:
        _sesiones[telefono] = Sesion(telefono=telefono)
    return _sesiones[telefono]


def guardar(sesion: Sesion) -> None:
    sesion.actualizada_en = datetime.now(timezone.utc).isoformat()
    _sesiones[sesion.telefono] = sesion


def ya_procesado(id_externo: str) -> bool:
    """True si este mensaje ya se atendió. Idempotencia del webhook."""
    if not id_externo:
        return False
    if id_externo in _vistos:
        return True
    if len(_vistos) >= _MAX_VISTOS:
        _vistos.clear()  # cota simple; el demo no necesita LRU
    _vistos.add(id_externo)
    return False


def reiniciar() -> None:
    """Sólo para tests y para dejar limpio antes del pitch."""
    _sesiones.clear()
    _vistos.clear()
