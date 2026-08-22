"""Configuracion del servicio de voz.

Regla de clon fresco: todo default vive aca como literal, no solo en .env.
`.env` sobreescribe; nunca es obligatorio.

⚠️ ESTE ES EL UNICO SERVICIO DE PULSO CON CARA PUBLICA. Twilio, Meta y Kapso
   tienen que alcanzarlo desde internet. `core` y `ai-core` siguen siendo
   internos: este servicio les habla, ellos nunca hablan hacia afuera.
"""

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    log_level: str = "INFO"
    #: Render inyecta PORT. El literal es para correr local sin .env.
    port: int = 8090

    # ── Hacia adentro ────────────────────────────────────────────
    ai_core_base_url: str = "http://127.0.0.1:8000"
    core_base_url: str = "http://127.0.0.1:3001"
    #: Presupuesto de una llamada a ai-core que involucra al LLM.
    timeout_ia_s: float = 30.0
    timeout_core_s: float = 10.0
    #: core niega por defecto: expone dictado clinico y coordenadas del
    #: paciente. Es la misma contrasena de turno que usan las consolas.
    #: Vacia = no se manda Authorization (core sin guard activo).
    core_password: str = ""

    # ── URL publica ──────────────────────────────────────────────
    #: Donde Twilio y Meta pueden alcanzarnos. En Render es la URL del
    #: servicio; en local, un tunel (`ngrok http 8090`).
    #: Twilio la NECESITA: abre un WebSocket de vuelta para el audio.
    url_publica: str = ""

    # ── WhatsApp ─────────────────────────────────────────────────
    #: "meta" = Cloud API directo. "kapso" = a traves de Kapso.
    whatsapp_proveedor: str = "meta"
    #: Cadena que TU inventas y le repites a Meta al registrar el webhook.
    #: Este repo es publico: no la dejes en un valor conocido.
    whatsapp_verify_token: str = ""
    whatsapp_token: str = ""
    whatsapp_phone_number_id: str = ""
    kapso_api_key: str = ""
    kapso_base_url: str = "https://api.kapso.ai/platform/v1"
    #: Numero de WhatsApp en Kapso. Lo necesita el registro del webhook.
    kapso_phone_number_id: str = ""

    #: Secreto con el que el proveedor firma cada entrega (HMAC-SHA256 del
    #: cuerpo crudo). SIN ESTO EL WEBHOOK ACEPTA CUALQUIER COSA: es un
    #: endpoint publico y cualquiera podria inventar una emergencia.
    #: Vacio = no se verifica. Se avisa al arrancar; en produccion, ponlo.
    whatsapp_webhook_secret: str = ""

    # ── Twilio ───────────────────────────────────────────────────
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    #: El "from". Acepta un Verified Caller ID; no hace falta comprar numero.
    twilio_phone_number: str = ""

    # ── Idempotencia de webhooks ─────────────────────────────────
    #: Postgres donde vive `webhook_recibido` (migración 0003). Es la MISMA
    #: base de core: `voz` no tiene base propia y no la necesita.
    #:
    #: Vacía = deduplicación en memoria, que se pierde al reiniciar y NO se
    #: comparte entre instancias. `GET /listo` lo dice en `deduplicacion.modo`.
    #: Con dos instancias en Render y sin esta URL, un reintento de Meta
    #: despacha dos ambulancias al mismo paciente.
    #:
    #: Acepta el nombre de core (`PULSO_ROUTING_DATABASE_URL`) para no pedir
    #: dos veces la misma cadena, y uno propio por si algún día se separan.
    webhook_database_url: str = Field(
        default="",
        validation_alias=AliasChoices(
            "PULSO_WEBHOOK_DATABASE_URL",
            "PULSO_ROUTING_DATABASE_URL",
        ),
    )

    # ── Seguridad ────────────────────────────────────────────────
    #: Protege los endpoints que disparan acciones costosas (llamar por
    #: telefono). Vacio en local = abierto; en Render ponlo SIEMPRE.
    secreto_endpoint: str = ""


settings = Settings()
