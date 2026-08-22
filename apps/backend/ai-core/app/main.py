"""ai-core — AI service for the Emergencies project.

This service is internal. It is reached by `core` (the NestJS gateway), never by
the browser, which is why it carries no CORS middleware.
"""

from fastapi import FastAPI

app = FastAPI(title="ai-core", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe. Must not depend on any downstream service."""
    return {"status": "ok"}
