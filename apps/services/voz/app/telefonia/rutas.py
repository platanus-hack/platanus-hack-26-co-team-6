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
from twilio.request_validator import RequestValidator

from .. import metricas
from ..config import settings
from . import llamadas

log = logging.getLogger(__name__)

router = APIRouter(prefix="/telefonia", tags=["telefonia"])

#: La ruta que Twilio firma. Constante para que _urls_candidatas() y el TwiML
#: de llamadas.py no puedan divergir en silencio.
RUTA_STREAM = "/telefonia/twilio"


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


def _urls_candidatas(query: str) -> list[str]:
    """Las 4 URLs que Twilio pudo haber firmado para este handshake.

    {wss, https} x {sin barra, con barra}, siempre desde `settings.url_publica`
    — NUNCA desde `ws.url`: detrás del proxy de Render el esquema y el host
    que ve la app son internos y jamás coincidirían con lo que Twilio firmó.
    El query sí es seguro de tomar de `ws.url`: sobrevive al proxy.
    """
    host = settings.url_publica.replace("https://", "").replace("http://", "").rstrip("/")
    sufijo = f"?{query}" if query else ""
    return [
        f"{esquema}://{host}{RUTA_STREAM}{barra}{sufijo}"
        for esquema in ("wss", "https")
        for barra in ("", "/")
    ]


def _firma_twilio_valida(firma: str | None, query: str) -> bool:
    """Acepta si CUALQUIERA de las 4 URLs candidatas valida. `validate()` de
    twilio-python ya compara en tiempo constante por dentro."""
    if not firma:
        return False
    validador = RequestValidator(settings.twilio_auth_token)
    return any(validador.validate(url, {}, firma) for url in _urls_candidatas(query))


@router.websocket("/twilio")
async def audio(ws: WebSocket) -> None:
    firma = ws.headers.get("x-twilio-signature")
    query = ws.url.query

    if not settings.twilio_auth_token:
        if settings.es_produccion:
            metricas.contar("pulso_webhook_firma_invalida_total", proveedor="twilio")
            log.error(
                "[voz] Twilio sin TWILIO_AUTH_TOKEN en produccion (entorno=%s): "
                "rechazado",
                settings.entorno,
            )
            await ws.close(code=1008)
            return
        log.error(
            "[voz] TWILIO_AUTH_TOKEN no configurado (entorno=%s): aceptando SIN "
            "verificar firma. Esto es inseguro en produccion.",
            settings.entorno,
        )
    elif not _firma_twilio_valida(firma, query):
        metricas.contar("pulso_webhook_firma_invalida_total", proveedor="twilio")
        log.error(
            "[voz] firma de Twilio invalida o ausente (entorno=%s)", settings.entorno
        )
        await ws.close(code=1008)
        return

    await ws.accept()
    log.info("[voz] Twilio conectó el stream de audio")
    try:
        while True:
            await ws.receive_text()
            # PENDIENTE: puentear con el agente de voz. Hoy se drena el audio
            # para no dejar el socket colgado.
    except WebSocketDisconnect:
        log.info("[voz] Twilio cerró el stream")
