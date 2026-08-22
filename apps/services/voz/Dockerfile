# voz — el canal público de PULSO.
FROM python:3.12-slim

# uv: mismo gestor que ai-core, para que las dos imágenes se construyan igual.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Las dependencias primero: cambiar código no invalida esta capa.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY app ./app

# Render inyecta PORT y espera que el proceso escuche ahí. El 8090 es el
# default de config.py, para que la imagen también corra sin PORT.
ENV PORT=8090
EXPOSE 8090

CMD ["sh", "-c", "uv run --no-dev uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8090}"]
