# ─── IDS Zero-Day Detection API ───────────────────────────────────────────────
# Build:  docker build -t rihno-ids .
# Run:    docker run -p 4050:4050 -e REDIS_HOST=my_rihno_redis rihno-ids
# ──────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim

# Prevents Python from writing .pyc files and buffers stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# ── Install dependencies first (layer caching) ──────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Copy application code ────────────────────────────────────────────────────
COPY feature_extractor.py .
COPY statistical_detector.py .
COPY isolation_forest_detector.py .
COPY autoencoder_detector.py .
COPY network_analyzer.py .
COPY ensemble_scorer.py .
COPY redis_store.py .
COPY main.py .
COPY api_server.py .

# ── Port ─────────────────────────────────────────────────────────────────────
EXPOSE 4050

# ── Environment defaults ─────────────────────────────────────────────────────
ENV REDIS_HOST="my_rihno_redis" \
    REDIS_PORT="6379" \
    REDIS_PASS="" \
    REDIS_DB="0" \
    IDS_PORT="4050"

# ── Health check ─────────────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:4050/health')" || exit 1

# ── Start the API server ─────────────────────────────────────────────────────
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "4050"]