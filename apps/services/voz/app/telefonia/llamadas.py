"""Llamadas salientes por Twilio.

El flujo, y por que necesita una URL publica:
  1. Le pedimos a Twilio que llame, con TwiML en linea.
  2. El TwiML le dice a Twilio que abra un WebSocket de vuelta HACIA NOSOTROS.
  3. Twilio marca.
  4. Cuando contestan, el audio va y viene por ese WebSocket.

El paso 2 es la razon de `URL_PUBLICA`: sin una URL alcanzable desde internet,
Twilio no tiene a donde conectarse y la llamada no suena. En local, un tunel
(`ngrok http 8090`). En Render, la URL del servicio.

`TWILIO_PHONE_NUMBER` acepta un Verified Caller ID — no hace falta comprar un
numero para que funcione el `from`.
"""

import logging

from ..config import settings

log = logging.getLogger(__name__)


class TwilioNoConfigurado(RuntimeError):
    pass


def configurado() -> bool:
    return all(
        [
            settings.twilio_account_sid,
            settings.twilio_auth_token,
            settings.twilio_phone_number,
            settings.url_publica,
        ]
    )


def _host_publico() -> str:
    """La URL pública sin esquema. El TwiML necesita el host pelado para wss://."""
    return (
        settings.url_publica.replace("https://", "")
        .replace("http://", "")
        .rstrip("/")
    )


def twiml_stream() -> str:
    host = _host_publico()
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response><Connect>"
        f'<Stream url="wss://{host}/telefonia/twilio" />'
        "</Connect></Response>"
    )


def llamar(a: str) -> str:
    """Marca a un número E.164 (+57...). Devuelve el call SID.

    Lanza en vez de degradar: una llamada que "falló en silencio" es peor que
    una que no se intentó, porque nadie va a revisar el log a las 3 a.m.
    """
    if not configurado():
        faltan = [
            n
            for n, v in [
                ("TWILIO_ACCOUNT_SID", settings.twilio_account_sid),
                ("TWILIO_AUTH_TOKEN", settings.twilio_auth_token),
                ("TWILIO_PHONE_NUMBER", settings.twilio_phone_number),
                ("URL_PUBLICA", settings.url_publica),
            ]
            if not v
        ]
        raise TwilioNoConfigurado(f"Falta configurar: {', '.join(faltan)}")

    from twilio.rest import Client

    cliente = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    llamada = cliente.calls.create(
        to=a, from_=settings.twilio_phone_number, twiml=twiml_stream()
    )
    log.info("[voz] llamada %s → %s", llamada.sid, a)
    return llamada.sid
