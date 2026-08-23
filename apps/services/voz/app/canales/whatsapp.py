"""WhatsApp: entrada y salida. Meta Cloud API o Kapso, detras de la misma cara.

ENTRADA
  Meta manda un webhook con una estructura anidada
  (entry -> changes -> value -> messages). Un mismo POST puede traer varios
  mensajes, y puede traer SOLO estados de entrega sin ningun mensaje: eso es
  normal y no es un error.

  Las notas de voz no vienen con el audio: vienen con un `media_id` que hay
  que canjear en DOS pasos (Graph v25.0), y la URL del paso 1 vive 5 minutos.

SALIDA
  Texto plano, y `location` — que NO es un enlace sino una tarjeta de mapa con
  boton de navegar que abre Google Maps o Waze. Para un paramedico manejando,
  la diferencia entre una tarjeta y un link es real.

LA VENTANA DE 24 HORAS
  Mandar un mensaje iniciado por el negocio exige una plantilla aprobada por
  Meta (24-48h de tramite). Pero responder DENTRO de las 24h siguientes a un
  mensaje del usuario no la necesita. En este flujo el paramedico escribe
  primero, asi que la ventana se abre sola y las respuestas fluyen libres.
  Eso es una ventaja del diseno, no un parche.
"""

import hashlib
import hmac
import logging
from typing import Any

import httpx
from fastapi import HTTPException, Request

from .. import metricas
from ..config import settings
from .modelos import MensajeEntrante

log = logging.getLogger(__name__)

GRAPH = "https://graph.facebook.com/v25.0"

#: Meta manda "sha256=<hexdigest>". Ver verificar_firma_meta().
FIRMA_CABECERA = "X-Hub-Signature-256"


class WhatsAppCaido(RuntimeError):
    pass


# ─────────────────────────────────────────────────────────────────
# Entrada
# ─────────────────────────────────────────────────────────────────


def verificar_webhook(modo: str | None, token: str | None, reto: str | None) -> str:
    """Handshake de verificacion de Meta (GET). Devuelve el reto a repetir.

    Meta lo llama UNA vez al registrar el webhook. Si el token no coincide hay
    que responder 403 — repetir el reto igual dejaria que cualquiera registre
    su propio endpoint contra este numero.
    """
    if modo != "subscribe" or not token or token != settings.whatsapp_verify_token:
        raise PermissionError("Token de verificación inválido")
    return reto or ""


def _firma_valida(crudo: bytes, cabecera: str | None, secreto: str) -> bool:
    """Compara en tiempo constante. Nunca `==`: timing attack sobre el HMAC.

    El HMAC se calcula sobre `crudo` tal cual llega — nunca sobre un JSON
    re-serializado, que puede diferir del original en espacios, orden de
    claves o escape de unicode.
    """
    if not cabecera or not cabecera.startswith("sha256="):
        return False
    esperado = hmac.new(secreto.encode(), crudo, hashlib.sha256).hexdigest()
    recibido = cabecera.removeprefix("sha256=")
    return hmac.compare_digest(esperado, recibido)


async def verificar_firma_meta(request: Request) -> None:
    """Dependencia de FastAPI para `POST /webhooks/whatsapp`.

    No devuelve nada: pasa, o lanza `HTTPException(401)` antes de que el
    cuerpo de `recibir()` corra (tarea 0.3, fuera de alcance de esta ola).

        Sin secreto:  desarrollo  -> advierte fuerte y pasa (regla 2 de AGENTS.md)
                      produccion  -> 401, la excepcion a la regla 2 es esta
        Con secreto:  firma ausente o distinta -> 401 en CUALQUIER entorno

    Todo 401 de esta funcion incrementa
    `pulso_webhook_firma_invalida_total{proveedor="whatsapp"}`.
    """
    crudo = await request.body()
    cabecera = request.headers.get(FIRMA_CABECERA)
    secreto = settings.whatsapp_app_secret

    if not secreto:
        if settings.es_produccion:
            metricas.contar("pulso_webhook_firma_invalida_total", proveedor="whatsapp")
            log.error(
                "[voz] webhook de WhatsApp sin WHATSAPP_APP_SECRET en produccion "
                "(entorno=%s): rechazado",
                settings.entorno,
            )
            raise HTTPException(status_code=401, detail="Firma no verificable")
        log.error(
            "[voz] WHATSAPP_APP_SECRET no configurado (entorno=%s): aceptando SIN "
            "verificar firma. Esto es inseguro en produccion.",
            settings.entorno,
        )
        return

    if not _firma_valida(crudo, cabecera, secreto):
        metricas.contar("pulso_webhook_firma_invalida_total", proveedor="whatsapp")
        log.error(
            "[voz] firma de WhatsApp invalida o ausente (entorno=%s)", settings.entorno
        )
        raise HTTPException(status_code=401, detail="Firma invalida")


def normalizar(payload: dict[str, Any]) -> list[MensajeEntrante]:
    """Webhook crudo → lista de mensajes. Vacía es un resultado válido.

    Un POST sin mensajes (solo estados de entrega, o un `field` que no es
    `messages`) es normal: Meta manda muchos. Devolver lista vacía y responder
    200 es lo correcto — si respondes error, Meta reintenta y luego desactiva
    el webhook.
    """
    mensajes: list[MensajeEntrante] = []

    for entrada in payload.get("entry", []) or []:
        for cambio in entrada.get("changes", []) or []:
            valor = cambio.get("value") or {}
            contactos = {
                c.get("wa_id"): (c.get("profile") or {}).get("name")
                for c in valor.get("contacts", []) or []
            }
            for m in valor.get("messages", []) or []:
                mensajes.append(_de_meta(m, contactos))

    return mensajes


def _de_meta(m: dict[str, Any], contactos: dict[str, Any]) -> MensajeEntrante:
    de = m.get("from", "")
    base = {
        "de": de,
        "id_externo": m.get("id", ""),
        "nombre_contacto": contactos.get(de),
        "crudo": m,
    }
    tipo = m.get("type")

    if tipo == "text":
        return MensajeEntrante(
            **base, tipo="texto", texto=(m.get("text") or {}).get("body", "")
        )

    if tipo in ("audio", "voice"):
        media = m.get(tipo) or {}
        return MensajeEntrante(
            **base,
            tipo="audio",
            id_media=media.get("id"),
            # Meta manda "audio/ogg; codecs=opus". httpx y los proveedores de
            # STT prefieren el tipo pelado.
            mime_media=(media.get("mime_type") or "audio/ogg").split(";")[0].strip(),
        )

    if tipo == "location":
        u = m.get("location") or {}
        return MensajeEntrante(
            **base, tipo="ubicacion", lat=u.get("latitude"), lng=u.get("longitude")
        )

    # Botones e interactivos traen el texto en otro lado. Rescatarlo es más
    # útil que descartar el mensaje.
    if tipo == "interactive":
        i = m.get("interactive") or {}
        cuerpo = (i.get("button_reply") or i.get("list_reply") or {}).get("title", "")
        return MensajeEntrante(**base, tipo="texto", texto=cuerpo)

    if tipo == "button":
        return MensajeEntrante(
            **base, tipo="texto", texto=(m.get("button") or {}).get("text", "")
        )

    return MensajeEntrante(**base, tipo="otro")


async def bajar_media(id_media: str) -> tuple[bytes, str]:
    """Canjea un media_id por sus bytes. Dos pasos, ambos autenticados.

    La URL del paso 1 vive 5 minutos y el paso 2 falla sin el token — es el
    error más común: la gente asume que la URL es pública.
    """
    if not settings.whatsapp_token:
        raise WhatsAppCaido("No hay WHATSAPP_TOKEN para bajar el audio")

    cabeceras = {"Authorization": f"Bearer {settings.whatsapp_token}"}

    async with httpx.AsyncClient(timeout=30.0) as c:
        meta = await c.get(f"{GRAPH}/{id_media}", headers=cabeceras)
        if meta.status_code >= 400:
            raise WhatsAppCaido(f"Media {id_media}: {meta.status_code} {meta.text[:200]}")

        datos = meta.json()
        url = datos.get("url")
        if not url:
            raise WhatsAppCaido(f"Media {id_media} no trajo url")

        binario = await c.get(url, headers=cabeceras)
        if binario.status_code >= 400:
            raise WhatsAppCaido(f"Descarga de media: {binario.status_code}")

    mime = (datos.get("mime_type") or "audio/ogg").split(";")[0].strip()
    return binario.content, mime


# ─────────────────────────────────────────────────────────────────
# Salida
# ─────────────────────────────────────────────────────────────────


async def enviar_texto(a: str, texto: str) -> dict[str, Any]:
    return await _enviar({"type": "text", "text": {"body": texto}}, a)


async def enviar_ubicacion(
    a: str, lat: float, lng: float, nombre: str, direccion: str = ""
) -> dict[str, Any]:
    """Tarjeta de mapa nativa, no un enlace.

    En el celular sale con botón de navegar que abre Google Maps o Waze.
    Para alguien manejando una ambulancia, eso es la diferencia entre un
    toque y copiar coordenadas a mano.
    """
    return await _enviar(
        {
            "type": "location",
            "location": {
                "latitude": lat,
                "longitude": lng,
                "name": nombre,
                "address": direccion or nombre,
            },
        },
        a,
    )


async def _enviar(contenido: dict[str, Any], a: str) -> dict[str, Any]:
    cuerpo = {"messaging_product": "whatsapp", "to": a, **contenido}

    if not settings.whatsapp_token or not settings.whatsapp_phone_number_id:
        # Sin credenciales, loguear y seguir. El flujo entero no se puede
        # caer porque falte un token: es el patrón de todo PULSO.
        log.warning("[voz] WhatsApp sin credenciales; mensaje NO enviado: %s", cuerpo)
        return {"enviado": False, "motivo": "sin credenciales"}

    url = f"{GRAPH}/{settings.whatsapp_phone_number_id}/messages"
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            res = await c.post(
                url,
                json=cuerpo,
                headers={"Authorization": f"Bearer {settings.whatsapp_token}"},
            )
    except httpx.HTTPError as e:
        log.warning("[voz] WhatsApp inalcanzable: %s", e)
        return {"enviado": False, "motivo": str(e)}

    if res.status_code >= 400:
        log.warning("[voz] WhatsApp %s: %s", res.status_code, res.text[:300])
        return {"enviado": False, "motivo": res.text[:300]}

    return {"enviado": True, "respuesta": res.json()}
