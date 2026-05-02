# ─── IDS Zero-Day Detection API ───────────────────────────────────────────────
# Build:  docker build -t rihno-ids .
# Run:    docker run -p 4050:4050 -e REDIS_HOST=my_rihno_redis rihno-ids
# ──────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# ── Install dependencies first (layer caching) ──────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Application code ────────────────────────────────────────────────────────
COPY feature_extractor.py \
     statistical_detector.py \
     hybrid_detector.py \
     network_analyzer.py \
     ensemble_scorer.py \
     redis_store.py \
     main.py \
     auto_detector.py \
     api_server.py \
     ./

# ── Drop privileges ─────────────────────────────────────────────────────────
RUN groupadd -r rihno && useradd -r -g rihno rihno && chown -R rihno:rihno /app
USER rihno

EXPOSE 4050

ENV REDIS_HOST="my_rihno_redis" \
    REDIS_PORT="6379" \
    REDIS_PASS="" \
    REDIS_DB="0" \
    IDS_PORT="4050"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:4050/health')" || exit 1

CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "4050"]
