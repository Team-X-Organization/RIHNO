# --- Stage 1: Build ---
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy module definition and source together so go mod tidy can resolve imports
COPY go.mod main.go ./

# Generate go.sum and download dependencies, then compile a static binary
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server .

# --- Stage 2: Run ---
FROM alpine:3.20

# ca-certificates is required for outbound HTTPS (threat feed download)
RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /app/server .

# Default broker points to the Kafka container name on rihno-network.
# Override at runtime: docker run -e KAFKA_BROKER=other-host:9092 ...
#
# Run on the shared network:
#   docker build -t rihno-network-ip-id .
#   docker run -d --name rihno_ip_id --network rihno-network -p 8888:8888 rihno-network-ip-id
ENV KAFKA_BROKER=my_rihno_kafka:9092

EXPOSE 8888

CMD ["./server"]
