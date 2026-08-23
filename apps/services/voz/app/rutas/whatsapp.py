"""Los endpoints que Meta llama. Este es el que hay que exponer en Render.

  GET  /webhooks/whatsapp   verificación (Meta lo llama una vez al registrar)
  POST /webhooks/whatsapp   los mensajes

⚠️ El POST responde 200 SIEMPRE, incluso si algo falló adentro. No es
   descuido: Meta reintenta ante un error y, si insiste, desactiva el webhook.
   Un 500 aquí no te avisa de un bug — te deja sin canal a mitad del demo.

TAREA 0.3 · EL PRESUPUESTO DE 3 SEGUNDOS
   Meta espera 2xx en ~3 s. Un triaje con Claude tarda 4-8 s. Hacerlo dentro
   del request es la receta para que Meta lo dé por fallido, lo reintente, y
   cada reintento cree otro caso.

   Por eso el trabajo va a una tarea de fondo y el request solo reclama y
   encola. Y por eso el paramédico recibe DOS mensajes: un acuse inmediato
   ("copiado") y después el destino. No es un mensaje de más — es la
   diferencia entre saber que llegó y mirar un chat mudo con un paciente al
   lado.
"""

import logging
import time

from fastapi import APIRouter, BackgroundTasks, Query, Request, Response

from ..canales import whatsapp
from ..canales.modelos import MensajeEntrante
from ..clientes import ai_core
from ..config import settings
from ..despachador import despachar
from ..sesiones import obtener
from ..webhooks_recibidos import anotar_resultado, reclamar
from .. import metricas

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
    t0 = time.perf_counter()
    proveedor = settings.whatsapp_proveedor

    def responder(cuerpo: dict[str, str]) -> dict[str, str]:
        metricas.observar(
            "pulso_webhook_latencia_ms",
            (time.perf_counter() - t0) * 1000,
            proveedor=proveedor,
        )
        return cuerpo

    try:
        payload = await request.json()
    except Exception:
        log.warning("[voz] webhook con cuerpo ilegible")
        return responder({"status": "ignorado"})

    try:
        mensajes = whatsapp.normalizar(payload)
    except Exception:
        log.exception("[voz] no pude normalizar el webhook")
        return responder({"status": "ignorado"})

    duplicados = 0
    for m in mensajes:
        acuse = await reclamar("whatsapp", m.id_externo)
        if acuse.duplicado:
            duplicados += 1
            continue
        tareas.add_task(procesar, m)

    return responder({
        "status": "ok",
        "mensajes": str(len(mensajes)),
        "duplicados": str(duplicados),
    })


async def procesar(m: MensajeEntrante) -> None:
    """Un mensaje entrante, de punta a punta. Nunca lanza.

    Al terminar deja constancia de QUÉ pasó en `webhook_recibido.resultado`.
    Sin eso, un reintento de Meta recibe un 200 mudo y no hay forma de saber
    después si el mensaje original llegó a despachar algo o murió a mitad.
    """
    try:
        if m.tipo == "audio" and m.id_media:
            # El acuse va ANTES de bajar el audio: descargar el media de Meta
            # son dos saltos autenticados y la transcripción otro más. Sin
            # esto el paramédico manda una nota de voz y mira un chat mudo
            # durante seis segundos, con un paciente al lado.
            await _acusar(m, "🎙️ Nota recibida, transcribiendo…")
            audio, mime = await whatsapp.bajar_media(m.id_media)
            decision = await ai_core.interpretar(
                audio=audio, audio_mime=mime, contexto=_contexto(m.de)
            )
            # Devolverle lo que se oyó no es cortesía: es la única forma de
            # que un paramédico cace una transcripción mala ANTES de que
            # salga la ambulancia. La app muestra el dictado en pantalla;
            # por WhatsApp esta es la pantalla.
            await _eco_transcripcion(m, decision)
        elif m.tipo == "texto":
            await _acusar(m, "Copiado, procesando…")
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


async def _acusar(m: MensajeEntrante, texto: str) -> None:
    """Acuse inmediato. Nunca tumba el procesamiento.

    Es el segundo mensaje del par que exige la tarea 0.3: primero "llegó",
    después el destino. Si el acuse falla, el trabajo sigue — perder el
    acuse es molesto; perder el traslado es otra cosa.
    """
    try:
        await whatsapp.enviar_texto(m.de, texto)
        metricas.contar("pulso_acuse_enviado_total", tipo=m.tipo)
    except Exception:
        log.warning("[voz] no pude acusar recibo de %s", m.id_externo)


async def _eco_transcripcion(m: MensajeEntrante, decision: dict) -> None:
    """Le repite al paramédico lo que el STT entendió.

    ⚠️ Solo cuando la acción es un caso nuevo. Repetirle "ya llegué" no
    aporta nada y llena el chat de ruido justo cuando menos se necesita.
    """
    t = decision.get("transcripcion") or {}
    texto = (t.get("texto") or "").strip()
    if not texto or decision.get("accion") != "registrar_caso":
        return
    await _acusar(m, f"Entendí: «{texto}»")


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
