# RIHNO CLI
# Build: docker build -t rihno-cli .
# Run:   docker run --rm -it rihno-cli [subcommand]

# --- Stage 1: Build ---
FROM golang:1.24-alpine AS builder

WORKDIR /usr/src/app

# Cache module deps
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# Source
COPY . .

# Static binary
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" -o /usr/local/bin/rihno .

# --- Stage 2: Runtime ---
FROM alpine:3.20

RUN apk add --no-cache ca-certificates && \
    addgroup -S rihno && adduser -S rihno -G rihno

COPY --from=builder /usr/local/bin/rihno /usr/local/bin/rihno

USER rihno
WORKDIR /home/rihno

ENTRYPOINT ["rihno"]
