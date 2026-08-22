"""Los endpoints que Meta llama. Este es el que hay que exponer en Render.

  GET  /webhooks/whatsapp   verificación (Meta lo llama una vez al registrar)
  POST /webhooks/whatsapp   los mensajes

⚠️ El POST responde 200 SIEMPRE, incluso si algo falló adentro. No es
   descuido: Meta reintenta ante un error y, si insiste, desactiva el webhook.
   Un 500 aquí no te avisa de un bug — te deja sin canal a mitad del demo.
"""

import json
import logging

from fastapi import (
    APIRouter,
    BackgroundTasks,
    HTTPException,
    Query,
    Request,
    Response,
)

from ..canales import whatsapp
from ..canales import firma as firma_webhook
from ..canales.firma import FirmaInvalida
from ..canales.modelos import MensajeEntrante
from ..clientes import ai_core
from ..despachador import despachar
from ..sesiones import obtener, ya_procesado

log = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["whatsapp"])


@router.get("/whatsapp")
def verificar_registro(
    modo: str | None = Query(None, alias="hub.mode"),
    token: str | None = Query(None, alias="hub.verify_token"),
    reto: str | None = Query(None, alias="hub.challenge"),
) -> Response:
    try:
        return Response(content=whatsapp.verificar_webhook(modo, token, reto),
                        media_type="text/plain")
    except PermissionError:
        # 403 y no 200: repetir el reto con un token malo dejaría que
        # cualquiera registre su endpoint contra este número.
        log.warning("[voz] verificación de webhook rechazada")
        return Response(status_code=403)


@router.post("/whatsapp")
async def recibir(request: Request, tareas: BackgroundTasks) -> dict[str, str]:
    """Acusa recibo YA y procesa aparte.

    Meta espera una respuesta rápida. Un triaje con LLM tarda segundos, y
    hacerlo dentro del request es la forma más fácil de que Meta lo dé por
    fallido y lo reintente — duplicando el traslado.
    """
    crudo = await request.body()

    # La firma se verifica sobre el cuerpo CRUDO, antes de parsear. Sobre el
    # JSON re-serializado no cuadraría: cualquier diferencia de espacios o de
    # orden de claves cambia el hash.
    try:
        firma_webhook.verificar(crudo, request.headers)
    except FirmaInvalida as e:
        # 403 y no 200: aquí sí queremos que el emisor se entere. Un webhook
        # legítimo nunca falla la firma; si falla, no es legítimo.
        log.warning("[voz] webhook rechazado: %s", e)
        raise HTTPException(status_code=403, detail="Firma inválida") from None

    try:
        payload = json.loads(crudo)
    except Exception:
        log.warning("[voz] webhook con cuerpo ilegible")
        return {"status": "ignorado"}

    try:
        mensajes = whatsapp.normalizar(payload)
    except Exception:
        log.exception("[voz] no pude normalizar el webhook")
        return {"status": "ignorado"}

    for m in mensajes:
        if ya_procesado(m.id_externo):
            log.info("[voz] mensaje repetido %s, ignorado", m.id_externo)
            continue
        tareas.add_task(procesar, m)

    return {"status": "ok", "mensajes": str(len(mensajes))}


async def procesar(m: MensajeEntrante) -> None:
    """Un mensaje entrante, de punta a punta. Nunca lanza."""
    try:
        if m.tipo == "audio" and m.id_media:
            audio, mime = await whatsapp.bajar_media(m.id_media)
            decision = await ai_core.interpretar(
                audio=audio, audio_mime=mime, contexto=_contexto(m.de)
            )
        elif m.tipo == "texto":
            decision = await ai_core.interpretar(
                mensaje=m.texto, contexto=_contexto(m.de)
            )
        elif m.tipo == "ubicacion":
            # Todavía no se usa la ubicación del paramédico como origen del
            # ruteo. Cuando se use, entra por aquí.
            await whatsapp.enviar_texto(m.de, "Ubicación recibida.")
            return
        else:
            await whatsapp.enviar_texto(
                m.de, "Solo entiendo texto y notas de voz por ahora."
            )
            return

        await despachar(m.de, decision["accion"], decision.get("argumentos") or {})

    except Exception:
        log.exception("[voz] falló el procesamiento de %s", m.id_externo)
        try:
            await whatsapp.enviar_texto(
                m.de,
                "No pude procesar tu mensaje. Reporta por radio al CRUE mientras lo revisamos.",
            )
        except Exception:
            log.exception("[voz] tampoco pude avisar del fallo")


def _contexto(telefono: str) -> str | None:
    """Lo que ya sabemos de este paramédico, en una línea para el modelo.

    Sin esto el modelo no puede distinguir un "ya llegué" a la escena de un
    "ya llegué" al hospital.
    """
    s = obtener(telefono)
    if not s.caso_id:
        return "No tiene un caso abierto en este momento."
    return f"Tiene un caso abierto, con destino asignado: {s.sede_nombre}."
