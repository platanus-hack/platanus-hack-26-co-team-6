"""La forma comun de un mensaje entrante, sea de Meta o de Kapso.

Todo lo que entra se normaliza aqui antes de tocar la logica. Cambiar de
proveedor de WhatsApp no debe tocar nada mas alla de `whatsapp.py`.
"""

from dataclasses import dataclass, field
from typing import Any, Literal

TipoMensaje = Literal["texto", "audio", "ubicacion", "otro"]


@dataclass(frozen=True)
class MensajeEntrante:
    #: Telefono del paramedico en E.164 sin '+', como lo manda WhatsApp.
    de: str
    tipo: TipoMensaje
    #: Id del proveedor. Sirve para idempotencia: WhatsApp reintenta webhooks
    #: y sin esto un solo reporte se procesa dos veces.
    id_externo: str
    texto: str = ""
    #: Solo para tipo == "audio". Hay que bajarlo del proveedor.
    id_media: str | None = None
    mime_media: str | None = None
    #: Solo para tipo == "ubicacion".
    lat: float | None = None
    lng: float | None = None
    nombre_contacto: str | None = None
    crudo: dict[str, Any] = field(default_factory=dict, repr=False)
