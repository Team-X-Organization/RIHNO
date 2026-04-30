# RIHNO Network IP Threat Detection Service

A Golang-based network intrusion detection system that monitors network connections and identifies malicious IPs using threat intelligence feeds. The service consumes network data from Kafka, cross-references IPs against a blocklist, and provides threat analysis through a REST API.

## Features

- Real-time threat detection based on network connections
- Automatic threat feed download from blocklist.de
- Kafka message consumer for distributed alert processing
- REST API for threat query and analysis
- Multi-agent support for distributed monitoring
- Containerized deployment with Docker

## Prerequisites

- Docker
- Existing `rihno-network` Docker network (or create one)
- Kafka broker running on the `rihno-network` (optional, for full integration)

## Quick Start

### Create the Docker Network

If you haven't created the `rihno-network` yet:

```bash
docker network create rihno-network
```

### Build the Docker Image

Build the Docker image with the name `rihno_ip_threat`:

```bash
docker build -t rihno_ip_threat .
```

### Run the Docker Container

Run the container on the `rihno-network` with the container name `my_rihno_ip_threat`:

```bash
docker run -d \
  --name my_rihno_ip_threat \
  --network rihno-network \
  -p 8888:8888 \
  rihno_ip_threat
```

### Verify the Container is Running

```bash
docker ps | grep my_rihno_ip_threat
```

## Environment Variables

The following environment variables can be overridden at runtime:

- `KAFKA_BROKER` (default: `my_rihno_kafka:9092`) - Kafka broker address for message consumption

### Example: Custom Kafka Broker

```bash
docker run -d \
  --name my_rihno_ip_threat \
  --network rihno-network \
  -p 8888:8888 \
  -e KAFKA_BROKER=kafka-host:9092 \
  rihno_ip_threat
```

## API Endpoints

### Health/Status Check

```bash
curl http://localhost:8888/
```

### Get Threat Analysis

```bash
curl http://localhost:8888/api/threats
```

## Container Management

### View Container Logs

```bash
docker logs my_rihno_ip_threat
```

### Follow Live Logs

```bash
docker logs -f my_rihno_ip_threat
```

### Stop the Container

```bash
docker stop my_rihno_ip_threat
```

### Start the Container

```bash
docker start my_rihno_ip_threat
```

### Remove the Container

```bash
docker rm my_rihno_ip_threat
```

## Network Configuration

The service runs on the `rihno-network` shared Docker network, enabling communication with other services like:

- **Kafka Broker**: `my_rihno_kafka:9092` (default)
- **Other Agents**: Via service names within the network

All containers on the same network can communicate using their container names as hostnames.

## How It Works

1. **Threat Feed Loading**: On startup, the service downloads the latest threat IP list from blocklist.de
2. **Message Processing**: Listens for network connection data on Kafka
3. **Threat Detection**: Cross-references received IPs against the malicious IP database
4. **Results Storage**: Maintains processed threat analysis results in memory
5. **API Access**: Provides REST endpoints for querying threat data

## Dockerfile

The Dockerfile uses a two-stage build process:

- **Stage 1 (Builder)**: Golang Alpine image - compiles the Go application into a static binary
- **Stage 2 (Runtime)**: Alpine Linux - runs the compiled binary with minimal dependencies

This approach ensures a small, efficient container image suitable for production deployment.

## Troubleshooting

### Container won't start
- Check if the `rihno-network` exists: `docker network ls`
- Verify the image was built successfully: `docker images | grep rihno_ip_threat`
- Check logs: `docker logs my_rihno_ip_threat`

### Can't connect to Kafka
- Ensure Kafka is running and accessible on the network
- Verify the Kafka broker address with the `KAFKA_BROKER` environment variable
- Check that both containers are on the same network: `docker network inspect rihno-network`

### Port already in use
- Change the host port: `docker run -p 9999:8888 ...` (access via http://localhost:9999)
- Or remove the conflicting container: `docker rm -f container-name`

## License

[Your License Here]
