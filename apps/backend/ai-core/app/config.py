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
    # ElevenLabs cubre STT y TTS con la MISMA credencial, asi que es el
    # default: un proveedor, una llave, los dos lados de la voz.
    #
    # Deepgram se queda disponible a proposito. No estorba (son ~40 lineas
    # probadas) y es el plan B de una sola variable si ElevenLabs limita,
    # se cae, o la llave no llega a tiempo.
    #
    # "auto" = el que tenga credencial. "deepgram" | "elevenlabs" lo fuerzan.
    stt_proveedor: str = "elevenlabs"

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

    # ── Sintesis de voz (TTS) ────────────────────────────────────
    # Para la llamada de seguimiento cuando una ambulancia se demora.
    # Misma llave que STT: ELEVENLABS_API_KEY.

    # eleven_multilingual_v2 habla espanol bien. Es el default del proveedor.
    tts_modelo: str = "eleven_multilingual_v2"
    # Voz por defecto de ElevenLabs. Cambiala por uno de tu biblioteca.
    tts_voz_id: str = "21m00Tcm4TlvDq8ikWAM"
    # mp3_44100_128 es el default del proveedor. Para telefonia (Twilio)
    # conviene ulaw_8000, que es lo que espera la red.
    tts_formato: str = "mp3_44100_128"
    tts_timeout_s: float = 20.0

    # ── Agentes conversacionales de ElevenLabs ───────────────────
    # Dos agentes, dos momentos distintos de la operacion:
    #
    #   REPORTE     — habla con el paramedico cuando reporta la situacion.
    #                 Entrante: el paramedico inicia.
    #   SEGUIMIENTO — llama cuando una ambulancia se demora mas de lo
    #                 normal, para saber que paso y si necesita apoyo.
    #                 Saliente: PULSO inicia.
    #
    # Se configuran en elevenlabs.io -> Agents. Aqui solo van los IDs;
    # la credencial es la misma ELEVENLABS_API_KEY.
    elevenlabs_agente_reporte_id: str = ""
    elevenlabs_agente_seguimiento_id: str = ""


settings = Settings()
