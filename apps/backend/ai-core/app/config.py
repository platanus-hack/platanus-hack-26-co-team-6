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


settings = Settings()
