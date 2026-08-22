"""Configuracion del servicio de voz.

Regla de clon fresco: todo default vive aca como literal, no solo en .env.
`.env` sobreescribe; nunca es obligatorio.

⚠️ ESTE ES EL UNICO SERVICIO DE PULSO CON CARA PUBLICA. Twilio, Meta y Kapso
   tienen que alcanzarlo desde internet. `core` y `ai-core` siguen siendo
   internos: este servicio les habla, ellos nunca hablan hacia afuera.
"""

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
    kapso_base_url: str = "https://app.kapso.ai/api/v1"

    # ── Twilio ───────────────────────────────────────────────────
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    #: El "from". Acepta un Verified Caller ID; no hace falta comprar numero.
    twilio_phone_number: str = ""

    # ── Seguridad ────────────────────────────────────────────────
    #: Protege los endpoints que disparan acciones costosas (llamar por
    #: telefono). Vacio en local = abierto; en Render ponlo SIEMPRE.
    secreto_endpoint: str = ""


settings = Settings()
