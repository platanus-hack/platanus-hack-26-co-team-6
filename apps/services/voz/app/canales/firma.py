"""Verificación de la firma de los webhooks entrantes.

`POST /webhooks/whatsapp` es un endpoint PÚBLICO: está en internet para que
Meta o Kapso lo alcancen, lo que significa que cualquiera puede alcanzarlo.
Sin verificar la firma, un tercero puede inventar una emergencia y hacer que
PULSO despache una ambulancia.

Los dos proveedores firman el cuerpo crudo con HMAC-SHA256, con cabeceras
distintas:

  Kapso  X-Webhook-Signature: <hex>
  Meta   X-Hub-Signature-256: sha256=<hex>

Se compara en tiempo constante. Un `==` normal filtra, por el tiempo que tarda
en fallar, cuántos bytes del prefijo acertaste — que es como se rompe un HMAC
sin conocer el secreto.
"""

import hashlib
import hmac
import logging

from ..config import settings

log = logging.getLogger(__name__)

CABECERA_KAPSO = "x-webhook-signature"
CABECERA_META = "x-hub-signature-256"


class FirmaInvalida(Exception):
    """El cuerpo no viene del proveedor, o llegó alterado."""


def _hmac(cuerpo: bytes, secreto: str) -> str:
    return hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest()


def verificar(cuerpo: bytes, cabeceras) -> None:
    """Lanza `FirmaInvalida` si no cuadra. No devuelve nada si está bien.

    Sin secreto configurado no verifica y lo dice en el log — para que
    "arranca sin configurar" no se convierta en "quedó abierto y nadie lo
    notó".
    """
    secreto = settings.whatsapp_webhook_secret
    if not secreto:
        log.warning(
            "[voz] webhook SIN verificar: WHATSAPP_WEBHOOK_SECRET está vacío. "
            "Cualquiera puede inventar una emergencia."
        )
        return

    recibida = cabeceras.get(CABECERA_KAPSO) or cabeceras.get(CABECERA_META)
    if not recibida:
        raise FirmaInvalida("Falta la cabecera de firma")

    # Meta la manda como "sha256=<hex>"; Kapso, el hex pelado.
    recibida = recibida.split("=", 1)[1] if recibida.startswith("sha256=") else recibida

    if not hmac.compare_digest(recibida, _hmac(cuerpo, secreto)):
        raise FirmaInvalida("La firma no corresponde al cuerpo")
