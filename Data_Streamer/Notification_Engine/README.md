# RIHNO Notification Engine

FastAPI service that watches the AI Threat Detection Engine's Redis alert
streams and dispatches email + SMS notifications to per-user recipient lists.

## Run

```
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 5060
```

## Environment

| Var | Purpose |
|-----|---------|
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_PASS` | Shared IDS Redis |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_USE_TLS` | Email |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | SMS (optional) |

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/health` | Liveness + watcher status |
| GET    | `/recipients/{email}` | List recipients + settings |
| POST   | `/recipients/{email}` | Add recipient `{type,value,label}` |
| PATCH  | `/recipients/{email}/{id}` | Update label / enabled |
| DELETE | `/recipients/{email}/{id}` | Remove recipient |
| GET    | `/settings/{email}` | Get min threat level + mute |
| PUT    | `/settings/{email}` | Update settings |
| POST   | `/test/{email}` | Fire test alert at a channel |
| GET    | `/threats/{email}` | Latest per-agent threat status |
| GET    | `/dispatch_log` | Last dispatch results |

## Redis keys

```
notify:recipients:{email}   HASH
notify:settings:{email}     HASH
notify:sent:{email}         ZSET   (dedupe)
```

The watcher reads the AI engine's keys directly:

```
ids:agents                  SET
ids:{email}:{agent}:alerts  ZSET
```
