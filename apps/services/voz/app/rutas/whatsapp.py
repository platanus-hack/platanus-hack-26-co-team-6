"""Los endpoints que Meta llama. Este es el que hay que exponer en Render.

  GET  /webhooks/whatsapp   verificación (Meta lo llama una vez al registrar)
  POST /webhooks/whatsapp   los mensajes

⚠️ El POST responde 200 SIEMPRE, incluso si algo falló adentro. No es
   descuido: Meta reintenta ante un error y, si insiste, desactiva el webhook.
   Un 500 aquí no te avisa de un bug — te deja sin canal a mitad del demo.
"""

import logging

from fastapi import APIRouter, BackgroundTasks, Query, Request, Response

from ..canales import whatsapp
from ..canales.modelos import MensajeEntrante
from ..clientes import ai_core
from ..despachador import despachar
from ..sesiones import obtener
from ..webhooks_recibidos import anotar_resultado, reclamar

log = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["whatsapp"])


@router.get("/whatsapp")
def verificar(
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

    Cada mensaje se RECLAMA antes de encolarlo. El reclamo es un insert con
    llave primaria: quien lo gana procesa, quien choca es un reintento de
    Meta y no vuelve a tocar core. Ver `webhooks_recibidos`.
    """
    try:
        payload = await request.json()
    except Exception:
        log.warning("[voz] webhook con cuerpo ilegible")
        return {"status": "ignorado"}

    try:
        mensajes = whatsapp.normalizar(payload)
    except Exception:
        log.exception("[voz] no pude normalizar el webhook")
        return {"status": "ignorado"}

    duplicados = 0
    for m in mensajes:
        acuse = await reclamar("whatsapp", m.id_externo)
        if acuse.duplicado:
            duplicados += 1
            continue
        tareas.add_task(procesar, m)

    return {
        "status": "ok",
        "mensajes": str(len(mensajes)),
        "duplicados": str(duplicados),
    }


async def procesar(m: MensajeEntrante) -> None:
    """Un mensaje entrante, de punta a punta. Nunca lanza.

    Al terminar deja constancia de QUÉ pasó en `webhook_recibido.resultado`.
    Sin eso, un reintento de Meta recibe un 200 mudo y no hay forma de saber
    después si el mensaje original llegó a despachar algo o murió a mitad.
    """
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
            await _anotar(m, {"estado": "procesado", "accion": "ubicacion"})
            return
        else:
            await whatsapp.enviar_texto(
                m.de, "Solo entiendo texto y notas de voz por ahora."
            )
            await _anotar(m, {"estado": "ignorado", "accion": "tipo_no_soportado"})
            return

        await despachar(m.de, decision["accion"], decision.get("argumentos") or {})
        await _anotar(m, {"estado": "procesado", "accion": decision["accion"]})

    except Exception:
        log.exception("[voz] falló el procesamiento de %s", m.id_externo)
        await _anotar(m, {"estado": "fallo"})
        try:
            await whatsapp.enviar_texto(
                m.de,
                "No pude procesar tu mensaje. Reporta por radio al CRUE mientras lo revisamos.",
            )
        except Exception:
            log.exception("[voz] tampoco pude avisar del fallo")


async def _anotar(m: MensajeEntrante, resultado: dict[str, str]) -> None:
    """El acuse nunca puede tumbar el procesamiento del mensaje.

    ⚠️ SIN PII: `resultado` no lleva el dictado ni las coordenadas del
       paciente. Es la misma lista blanca de `despojar()` en core, aplicada
       aquí a mano porque este servicio no tiene ese guardián.
    """
    try:
        await anotar_resultado("whatsapp", m.id_externo, resultado)
    except Exception:
        log.warning("[voz] no pude anotar el resultado de %s", m.id_externo)


def _contexto(telefono: str) -> str | None:
    """Lo que ya sabemos de este paramédico, en una línea para el modelo.

    Sin esto el modelo no puede distinguir un "ya llegué" a la escena de un
    "ya llegué" al hospital.
    """
    s = obtener(telefono)
    if not s.caso_id:
        return "No tiene un caso abierto en este momento."
    return f"Tiene un caso abierto, con destino asignado: {s.sede_nombre}."
