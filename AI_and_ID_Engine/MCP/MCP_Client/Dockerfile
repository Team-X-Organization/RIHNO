# ============================================================
# RIHNO MCP Client API — single-stage image using uv
# ============================================================
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# Docker CLI (newer than apt's docker.io) — required for spawning MCP server containers
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/debian bookworm stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
        docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache deps
COPY pyproject.toml uv.lock* ./

# Install dependencies (creates .venv automatically)
RUN uv sync --no-dev

# Source
COPY api.py ./

ENV RIHNO_AWS_REGION=us-east-1 \
    RIHNO_DOCKER_IMAGE=rihno_mcp_server \
    RIHNO_MODEL_ID=claude-3.5-sonnet \
    AWS_BEARER_TOKEN_BEDROCK="" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/api/status')" || exit 1

CMD ["uv", "run", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8001"]
