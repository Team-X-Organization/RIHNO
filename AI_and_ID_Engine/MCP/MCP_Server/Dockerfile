# RIHNO MCP Server (STDIO transport)
# Build: docker build -t rihno_mcp_server .
# Used by MCP Client which spawns it as a subprocess.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PATH="/opt/venv/bin:$PATH"

# uv binary for fast dependency installs
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /bin/

WORKDIR /app

# Create venv + install runtime deps
# psycopg2-binary skips system build tools (gcc/libpq-dev)
RUN uv venv /opt/venv && \
    uv pip install --python /opt/venv mcp psycopg2-binary

# Source
COPY main.py ./

# Drop privileges
RUN groupadd -r rihno && useradd -r -g rihno rihno && chown -R rihno:rihno /app /opt/venv
USER rihno

# MCP transport is STDIO — no port to expose
CMD ["python", "main.py"]
