# ai-core — la IA. INTERNO: nunca debe quedar con cara pública.
#
# ⚠️ EL CONTEXTO DE BUILD ES LA RAÍZ DEL REPO, no esta carpeta.
#    render.yaml:  dockerfilePath: ./apps/backend/ai-core/Dockerfile
#                  dockerContext:  .
#    Construir a mano:  docker build -f apps/backend/ai-core/Dockerfile .
#    Si lo corres desde aquí, el COPY de `data/` falla y no vas a entender por qué.
FROM python:3.12-slim

# uv: el mismo gestor que voz, para que las imágenes se construyan igual.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Las dependencias primero: cambiar código no invalida esta capa.
COPY apps/backend/ai-core/pyproject.toml apps/backend/ai-core/uv.lock ./
RUN uv sync --frozen --no-dev

COPY apps/backend/ai-core/app ./app

# Las fuentes compartidas del repo. Hoy ai-core NO las lee en tiempo de
# ejecución (el prompt clínico sigue duplicado en Python y TypeScript, tarea
# 0.5), pero viajan en la imagen para que el día que 0.5 aterrice y el prompt
# pase a ser fuente única en data/, este Dockerfile no tenga que cambiar.
# Son 6 MB.
COPY data ./data

# Render inyecta PORT. El 8000 es el default de config.py, para que la imagen
# también corra sin PORT.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uv run --no-dev uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
