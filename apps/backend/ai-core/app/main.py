"""ai-core — AI service for the Emergencies project.

This service is internal. It is reached by `core` (the NestJS gateway), never by
the browser, which is why it carries no CORS middleware.
"""

from fastapi import FastAPI

from .routers import cobertura, interpretar, sbar, score, transcribir, triage

app = FastAPI(title="ai-core", version="0.1.0")

app.include_router(triage.router)
app.include_router(score.router)
app.include_router(transcribir.router)
app.include_router(interpretar.router)
app.include_router(cobertura.router)
app.include_router(sbar.router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe. Must not depend on any downstream service."""
    return {"status": "ok"}
