"""Endpoints de telefonía. Twilio los alcanza desde internet.

  POST /telefonia/llamar     dispara una llamada saliente (protegido)
  WS   /telefonia/twilio     el audio de la llamada, en los dos sentidos

⚠️ EL PUENTE DE AUDIO ESTÁ SIN IMPLEMENTAR. Acepta el WebSocket y cierra
   limpio. Conectarlo a un agente de voz (ElevenLabs Agents o la Voice Agent
   de Deepgram) es la decisión de proveedor que sigue pendiente, y montar los
   dos sería trabajo perdido.
"""

import logging

from fastapi import APIRouter, Header, HTTPException, WebSocket, WebSocketDisconnect

from ..config import settings
from . import llamadas

log = logging.getLogger(__name__)

router = APIRouter(prefix="/telefonia", tags=["telefonia"])


def _autorizado(secreto: str | None) -> bool:
    """Sin secreto configurado, abierto (dev). Con secreto, obligatorio."""
    if not settings.secreto_endpoint:
        return True
    return secreto == settings.secreto_endpoint


@router.post("/llamar")
def llamar(
    cuerpo: dict,
    x_secreto: str | None = Header(None, alias="X-Secreto"),
) -> dict[str, str]:
    """Marca a un número. Protegido: cada llamada cuesta dinero real."""
    if not _autorizado(x_secreto):
        raise HTTPException(status_code=401, detail="Secreto inválido")

    a = (cuerpo or {}).get("a", "").strip()
    if not a.startswith("+"):
        raise HTTPException(status_code=400, detail="`a` debe ir en E.164, con +")

    try:
        return {"sid": llamadas.llamar(a)}
    except llamadas.TwilioNoConfigurado as e:
        raise HTTPException(status_code=503, detail=str(e)) from None
    except Exception as e:
        log.exception("[voz] falló la llamada")
        raise HTTPException(status_code=502, detail=f"Twilio: {e}") from None


@router.websocket("/twilio")
async def audio(ws: WebSocket) -> None:
    await ws.accept()
    log.info("[voz] Twilio conectó el stream de audio")
    try:
        while True:
            await ws.receive_text()
            # PENDIENTE: puentear con el agente de voz. Hoy se drena el audio
            # para no dejar el socket colgado.
    except WebSocketDisconnect:
        log.info("[voz] Twilio cerró el stream")
