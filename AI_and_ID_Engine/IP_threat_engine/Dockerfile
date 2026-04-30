# --- Stage 1: Build ---
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Cache module deps
COPY go.mod go.sum ./
RUN go mod download

# Source
COPY main.go ./

# Static binary
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" -o server .

# --- Stage 2: Run ---
FROM alpine:3.20

RUN apk add --no-cache ca-certificates wget && \
    addgroup -S rihno && adduser -S rihno -G rihno

WORKDIR /app

COPY --from=builder /app/server .
RUN chown -R rihno:rihno /app

USER rihno

# Override at runtime: docker run -e KAFKA_BROKER=other-host:9092 ...
ENV KAFKA_BROKER=my_rihno_kafka:9092

EXPOSE 8888

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8888/api/scans || exit 1

CMD ["./server"]
