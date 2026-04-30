FROM golang:latest

WORKDIR /usr/src/app

# Pre-copy/cache go.mod for pre-downloading dependencies
COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .

# Build the app
RUN go build -v -o /usr/local/bin/app .

# Run the app
CMD ["app"]