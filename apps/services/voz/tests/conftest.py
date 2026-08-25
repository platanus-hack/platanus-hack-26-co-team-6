"""Aislamiento de los tests respecto al `.env` del desarrollador.

⚠️ POR QUÉ EXISTE ESTE ARCHIVO

`Settings` lee `apps/services/voz/.env` con pydantic-settings. Eso está bien
para correr el servicio, y es un problema para los tests: **quien tenga
credenciales locales corre una suite distinta a la de CI.**

El caso concreto que lo destapó: con `WHATSAPP_WEBHOOK_SECRET` puesta en el
`.env`, el webhook empieza a exigir firma y diez tests que posteaban sin
firmar pasaron a dar 403. En CI, sin `.env`, esos mismos tests pasaban. Un
test que depende de si el que lo corre tiene credenciales no prueba nada.

Aquí se neutralizan TODAS las credenciales antes de cada test. Quien necesite
una, la pone explícitamente en su propio fixture — y así se lee en el test
qué está ejercitando.
"""

import pytest

from app.config import settings

#: Todo lo que puede venir del `.env` y cambiar el comportamiento.
NEUTRALIZAR = {
    "whatsapp_webhook_secret": "",
    "whatsapp_token": "",
    "whatsapp_phone_number_id": "",
    "whatsapp_verify_token": "",
    "kapso_api_key": "",
    "twilio_account_sid": "",
    "twilio_auth_token": "",
    "twilio_phone_number": "",
    "core_password": "",
    "secreto_endpoint": "",
    "url_publica": "",
    # ⚠️ SIN ESTO EL TEST DE LATENCIA MIDE LA RED, NO EL CÓDIGO.
    # La deduplicación abre un pool contra Postgres, y con un Supabase remoto
    # la PRIMERA conexión tarda ~2 s. El test de la tarea 0.3 exige p99 < 1 s
    # y fallaba midiendo el viaje a la nube. Con el `.env` puesto pasaba; en
    # CI, sin él, pasaba — otra vez la suite dependiendo de quién la corre.
    "webhook_database_url": "",
}


@pytest.fixture(autouse=True)
def entorno_aislado(monkeypatch):
    """Corre igual con `.env` y sin él. Si un test necesita una credencial,
    que la ponga él y se vea en el test."""
    for campo, valor in NEUTRALIZAR.items():
        if hasattr(settings, campo):
            monkeypatch.setattr(settings, campo, valor)
