# RIHNO Notification Engine
# Build: docker build -t rihno-notify .
# Run:   docker run -p 5060:5060 --env-file .env rihno-notify

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY recipients_store.py senders.py alert_watcher.py main.py ./

RUN groupadd -r rihno && useradd -r -g rihno rihno && chown -R rihno:rihno /app
USER rihno

EXPOSE 5060

ENV REDIS_HOST=my_rihno_redis \
    REDIS_PORT=6379 \
    REDIS_DB=0 \
    SMTP_HOST=smtp.gmail.com \
    SMTP_PORT=587 \
    SMTP_USE_TLS=true

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5060/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5060"]
