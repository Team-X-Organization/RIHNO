# RIHNO Deployment — Container & Network Reference

All services join one Docker network so backend can resolve sibling containers
by name (`my_rihno_ai_engine`, `my_rihno_redis`, etc).

## 0. Network

```bash
docker network create rihno-network
```

## 1. Datastores

```bash
# TimescaleDB
docker run -d --name my_rihno_db -p 5432:5432 \
  -v rihnodb_volume:/pgdata \
  -e PGDATA=/pgdata \
  -e POSTGRES_PASSWORD=5001 \
  --network rihno-network \
  timescale/timescaledb:latest-pg18

# pgAdmin (optional)
docker run -d --name pgadmin-container -p 5051:80 \
  -e PGADMIN_DEFAULT_EMAIL=sakibdalal73@gmail.com \
  -e PGADMIN_DEFAULT_PASSWORD=5001 \
  --network rihno-network dpage/pgadmin4

# Kafka
docker run -d --name my_rihno_kafka -p 9092:9092 \
  --network rihno-network apache/kafka:latest

# Redis (shared by dealer, AI engine, notification engine)
docker run -d --name my_rihno_redis -p 6379:6379 \
  --network rihno-network redis:latest
```

## 2. Streamers

```bash
# Dealer (HTTP 8000, TCP 8080)
cd Data_Streamer/RIHNO_DEALER
docker build -t rihno_dealer .
docker run -d --name my_rihno_dealer \
  -p 8000:8000 -p 8080:8080 \
  -e REDIS_HOST=my_rihno_redis \
  -e DB_URL='postgres://postgres:5001@my_rihno_db:5432/rihnodb?sslmode=disable' \
  --network rihno-network rihno_dealer
```

## 3. AI / Threat engines

```bash
# IP threat engine
cd AI_and_ID_Engine/IP_threat_engine
docker build -t rihno_ip_threat .
docker run -d --name my_rihno_ip_threat -p 8888:8888 \
  -e KAFKA_BROKER=my_rihno_kafka:9092 \
  --network rihno-network rihno_ip_threat

# AI Threat Detection Engine (Zero-Day)
cd AI_and_ID_Engine/AI_Threat_Detection_Engine
docker build -t rihno_ai_engine .
docker run -d --name my_rihno_ai_engine -p 4050:4050 \
  -e REDIS_HOST=my_rihno_redis \
  -e REDIS_PORT=6379 \
  --network rihno-network rihno_ai_engine

# Notification Engine (email + SMS)
cd Data_Streamer/Notification_Engine
docker build -t rihno_notify .
docker run -d --name my_rihno_notify -p 5060:5060 \
  -e REDIS_HOST=my_rihno_redis \
  -e REDIS_PORT=6379 \
  -e SMTP_HOST=smtp.gmail.com \
  -e SMTP_PORT=587 \
  -e SMTP_USER=<gmail-address> \
  -e SMTP_PASS=<gmail-app-password> \
  -e SMTP_FROM=<gmail-address> \
  -e TWILIO_ACCOUNT_SID=<optional> \
  -e TWILIO_AUTH_TOKEN=<optional> \
  -e TWILIO_FROM_NUMBER=<optional> \
  --network rihno-network rihno_notify
```

## 4. MCP

```bash
# MCP Server image (pulled by client at runtime)
cd AI_and_ID_Engine/MCP/MCP_Server
docker build -t rihno_mcp_server .

# MCP Client API (port 8001)
cd AI_and_ID_Engine/MCP/MCP_Client
docker build -t rihno_mcp_client .
docker run -d --name my_rihno_mcp_client -p 8001:8001 \
  --env-file .env \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --network rihno-network rihno_mcp_client
```

## 5. Webapp

```bash
# Backend — MUST join rihno-network so it can reach my_rihno_ai_engine, my_rihno_notify, my_rihno_ip_threat by name.
cd Webapp/Backend
docker build -t rihno_backend .
docker run -d --name my_rihno_backend -p 5050:5050 \
  --env-file .env \
  -e AI_ENGINE_URL=http://my_rihno_ai_engine:4050 \
  -e NOTIFY_ENGINE_URL=http://my_rihno_notify:5060 \
  -e THREAT_API_URL=http://my_rihno_ip_threat:8888/api/scans \
  --network rihno-network rihno_backend

# Frontend (Vite dev server, port 5173)
cd Webapp/Frontend/rihno_frontend
docker build -t rihno_frontend .
docker run -d --name my_rihno_frontend -p 5173:5173 \
  --env-file .env \
  --network rihno-network rihno_frontend
```

## Frontend `.env`

```env
VITE_COGNITO_AUTHORITY=
VITE_COGNITO_CLIENT_ID=
VITE_COGNITO_REDIRECT_URI=http://localhost:5173/
VITE_COGNITO_DOMAIN=

# Browser-reachable URL of the backend (not container name — browser can't resolve those)
VITE_BACKEND_URL=http://192.168.1.10:5050/
VITE_DEALER_URL=http://192.168.1.10:8000
VITE_AI_API_URL=http://192.168.1.10:8001
```

## Backend `.env`

```env
AWS_API_CLI_AUTH_URL=
AWS_DEVICE_API_URL=
PORT=5050

# Sibling containers on rihno-network
KAFKA_BROKER=my_rihno_kafka:9092
AI_ENGINE_URL=http://my_rihno_ai_engine:4050
NOTIFY_ENGINE_URL=http://my_rihno_notify:5060
THREAT_API_URL=http://my_rihno_ip_threat:8888/api/scans
```

## Health check chain

| URL | Reaches |
|-----|---------|
| http://localhost:5050/api/backend_check | Backend |
| http://localhost:5050/api/ai/status     | Backend → AI engine |
| http://localhost:5050/api/notify/threats?email=you@x.com | Backend → Notify engine |
| http://localhost:4050/health            | AI engine direct |
| http://localhost:5060/health            | Notify engine direct |
| http://localhost:8888/api/scans         | IP threat engine direct |

If `/api/ai/status` returns `502/timeout`, backend is not on `rihno-network`
or `my_rihno_ai_engine` container is not running.
