"""voz — el canal público de PULSO.

Único servicio con cara a internet: Twilio y Meta tienen que alcanzarlo.
`core` (:3001) y `ai-core` (:8000) siguen siendo internos; este servicio les
habla, ellos nunca hablan hacia afuera.

    frontend ─┐
              ├─→ core ──→ ai-core
    voz ──────┘     ↑          ↑
     ↑              └──────────┘
  Twilio · WhatsApp
"""

import logging

from fastapi import FastAPI

from .config import settings
from .rutas import interno, whatsapp
from .telefonia import rutas as telefonia
from .telefonia import llamadas
from .canales.whatsapp import GRAPH  # noqa: F401  (documenta la versión de Graph)

logging.basicConfig(level=settings.log_level)

app = FastAPI(title="voz", version="0.1.0")

app.include_router(whatsapp.router)
app.include_router(interno.router)
app.include_router(telefonia.router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness. No toca nada aguas abajo, a propósito."""
    return {"status": "ok"}


@app.get("/listo")
def listo() -> dict[str, object]:
    """Qué está realmente conectado. Míralo antes de culpar al demo."""
    return {
        "whatsapp": {
            "proveedor": settings.whatsapp_proveedor,
            "puede_enviar": bool(
                settings.whatsapp_token and settings.whatsapp_phone_number_id
            ),
            "verificacion_lista": bool(settings.whatsapp_verify_token),
        },
        "twilio": {"configurado": llamadas.configurado()},
        "url_publica": settings.url_publica or None,
        "aguas_abajo": {
            "ai_core": settings.ai_core_base_url,
            "core": settings.core_base_url,
        },
    }
