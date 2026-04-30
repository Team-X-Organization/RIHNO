# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM golang:1.24-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

# Cache module deps
COPY go.mod go.sum ./
RUN go mod download

# Source
COPY main.go redis_pipeline.go ./

# Static binary (CGO disabled for scratch/alpine compatibility)
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" -o dealer .

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata wget && \
    addgroup -S rihno && adduser -S rihno -G rihno

WORKDIR /app

COPY --from=builder /app/dealer .
RUN chown -R rihno:rihno /app

USER rihno

# 8000 → HTTP REST API   (overridable via HTTP_PORT)
# 8080 → TCP agent listener (overridable via TCP_PORT)
EXPOSE 8000 8080

ENV HTTP_PORT=8000 \
    TCP_PORT=8080 \
    DB_URL="" \
    REDIS_HOST="my_rihno_redis" \
    REDIS_PORT="6379" \
    REDIS_PASS="" \
    REDIS_DB="0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8000/health || exit 1

ENTRYPOINT ["./dealer"]
