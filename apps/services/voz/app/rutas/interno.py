"""Endpoints que llama `core`, no el mundo.

Cierran el bucle en el sentido core → paramédico:
  · core avisa que el hospital respondió  → mensaje de WhatsApp
  · core avisa que un traslado se demora  → llamada de seguimiento

Van protegidos por `SECRETO_ENDPOINT` porque están en el mismo servicio
público que los webhooks: cualquiera puede alcanzarlos, y `/seguimiento`
gasta dinero real.
"""

import logging

from fastapi import APIRouter, Header, HTTPException

from ..canales import whatsapp
from ..config import settings
from ..telefonia import llamadas

log = logging.getLogger(__name__)

router = APIRouter(prefix="/interno", tags=["interno"])


def _autorizar(secreto: str | None) -> None:
    if settings.secreto_endpoint and secreto != settings.secreto_endpoint:
        raise HTTPException(status_code=401, detail="Secreto inválido")


@router.post("/notificar")
async def notificar(
    cuerpo: dict, x_secreto: str | None = Header(None, alias="X-Secreto")
) -> dict[str, object]:
    """core → paramédico. El aviso de que el hospital respondió.

    Sin esto, el jefe de urgencias acepta y el paramédico nunca se entera.
    """
    _autorizar(x_secreto)

    telefono = (cuerpo.get("telefono") or "").strip()
    texto = (cuerpo.get("texto") or "").strip()
    if not telefono or not texto:
        raise HTTPException(status_code=400, detail="Faltan `telefono` o `texto`")

    r = await whatsapp.enviar_texto(telefono, texto)

    u = cuerpo.get("ubicacion")
    if u and u.get("lat") is not None and u.get("lng") is not None:
        await whatsapp.enviar_ubicacion(
            telefono,
            float(u["lat"]),
            float(u["lng"]),
            u.get("nombre") or "Sede",
            u.get("direccion") or "",
        )

    return {"enviado": bool(r.get("enviado"))}


@router.post("/seguimiento")
async def seguimiento(
    cuerpo: dict, x_secreto: str | None = Header(None, alias="X-Secreto")
) -> dict[str, object]:
    """core → llamada de seguimiento por demora.

    Intenta llamar; si Twilio no está configurado, degrada a WhatsApp en vez
    de perder el aviso. Una demora que nadie ve es exactamente el problema
    que veníamos a resolver.
    """
    _autorizar(x_secreto)

    telefono = (cuerpo.get("telefono") or "").strip()
    motivo = (cuerpo.get("motivo") or "").strip()
    if not telefono:
        raise HTTPException(status_code=400, detail="Falta `telefono`")

    if llamadas.configurado():
        try:
            numero = telefono if telefono.startswith("+") else f"+{telefono}"
            return {"via": "llamada", "sid": llamadas.llamar(numero)}
        except Exception as e:
            log.warning("[voz] la llamada falló, degradando a WhatsApp: %s", e)

    await whatsapp.enviar_texto(
        telefono,
        f"¿Todo bien? {motivo} Si necesitas apoyo, repórtalo al CRUE por radio.",
    )
    return {"via": "whatsapp"}
