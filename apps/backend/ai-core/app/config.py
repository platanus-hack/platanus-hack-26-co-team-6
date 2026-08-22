"""Configuracion de ai-core.

Regla de clon fresco: todo default vive aca como literal, no solo en .env.
`.env` sobreescribe; nunca es obligatorio. `extra="ignore"` para que una
variable futura en .env no tumbe el arranque antes de que exista el campo.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    log_level: str = "INFO"

    # Credenciales de proveedor. Viven aca y SOLO aca — ni core ni el
    # frontend deben tenerlas. Vacio = el triaje cae a la heuristica.
    anthropic_api_key: str = ""

    # Modelo de extraccion clinica.
    modelo_triage: str = "claude-opus-5"
    # "low" es una decision de LATENCIA, no de costo: es el numero que sale
    # en el pitch. Si la calidad falla en dictados feos, subir a "medium"
    # y volver a medir — el pitch aguanta 2s mas, no aguanta un error en vivo.
    esfuerzo_triage: str = "low"

    # ── Transcripcion (STT) ──────────────────────────────────────
    # Claude NO recibe audio: toma texto, imagenes y PDFs. Una nota de voz
    # de WhatsApp necesita este paso antes del triaje.
    #
    # "auto" = usa el proveedor que tenga credencial (Deepgram primero, que
    # es el mas rapido). "deepgram" | "elevenlabs" lo fuerzan.
    stt_proveedor: str = "auto"

    deepgram_api_key: str = ""
    elevenlabs_api_key: str = ""

    # nova-3 es el modelo actual de Deepgram; scribe_v2 el de ElevenLabs.
    stt_modelo_deepgram: str = "nova-3"
    stt_modelo_elevenlabs: str = "scribe_v2"

    # es = espanol. El dictado es en espanol colombiano; fijarlo evita que el
    # modelo dude con la jerga clinica y mejora la latencia.
    stt_idioma: str = "es"

    # Un dictado de ambulancia dura segundos. Si la transcripcion no vuelve
    # en 20s, algo esta mal y es mejor fallar rapido que colgar el triaje.
    stt_timeout_s: float = 20.0


settings = Settings()
