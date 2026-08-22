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
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response

from . import metricas, webhooks_recibidos
from .config import settings
from .rutas import interno, whatsapp
from .telefonia import rutas as telefonia
from .telefonia import llamadas
from .canales.whatsapp import GRAPH  # noqa: F401  (documenta la versión de Graph)

logging.basicConfig(level=settings.log_level)
log = logging.getLogger(__name__)


@asynccontextmanager
async def ciclo(_: FastAPI):
    # Que el modo de deduplicación se lea en el log de arranque y no solo en
    # /listo: si arranca en memoria con dos instancias, hay que enterarse antes
    # de que Meta reintente, no después.
    log.info("[voz] deduplicación de webhooks: %s", webhooks_recibidos.modo())
    yield
    await webhooks_recibidos.cerrar()


app = FastAPI(title="voz", version="0.1.0", lifespan=ciclo)

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
        # Sin base, un reintento de Meta puede despachar dos ambulancias al
        # mismo paciente en cuanto haya más de una instancia. Se dice.
        "deduplicacion": {
            "modo": webhooks_recibidos.modo(),
            "persistida": webhooks_recibidos.hay_base(),
        },
        "url_publica": settings.url_publica or None,
        "aguas_abajo": {
            "ai_core": settings.ai_core_base_url,
            "core": settings.core_base_url,
        },
    }


@app.get("/metrics")
def metrics() -> Response:
    """Contadores en formato Prometheus.

    Sin autenticación a propósito: aquí no hay nada sensible — cuántos
    reintentos absorbimos, no de quién. El día que una métrica lleve una
    etiqueta con un teléfono o un `casoId`, este endpoint pasa a exigir
    `SECRETO_ENDPOINT`.
    """
    return Response(content=metricas.exponer(), media_type="text/plain; version=0.0.4")
