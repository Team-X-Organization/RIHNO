"""
main.py — RIHNO Notification Engine

FastAPI service that:
  * Stores per-user recipient lists (email/SMS) in Redis.
  * Polls the IDS engine's Redis alert ZSETs and dispatches notifications.
  * Exposes endpoints for the webapp backend to manage recipients.

Run:
    uvicorn main:app --host 0.0.0.0 --port 5060

Env:
    REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASS
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_USE_TLS
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
"""

import logging
import os
import re
from typing import Optional

import redis
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from alert_watcher import AlertWatcher, THREAT_RANK
from recipients_store import RecipientsStore
from senders import (
    build_alert_body, build_alert_html, build_alert_subject,
    build_sms_body, send_email, send_sms,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


# ── Config ─────────────────────────────────────────────────────────────────

REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
REDIS_DB = int(os.environ.get("REDIS_DB", "0"))
REDIS_PASS = os.environ.get("REDIS_PASS") or None


# ── App + dependencies ────────────────────────────────────────────────────

app = FastAPI(title="RIHNO Notification Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

store = RecipientsStore(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, password=REDIS_PASS)

ids_redis = redis.Redis(
    host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, password=REDIS_PASS,
    decode_responses=False, socket_timeout=5, retry_on_timeout=True,
)

watcher = AlertWatcher(ids_redis=ids_redis, store=store)


@app.on_event("startup")
def _startup():
    watcher.start()


@app.on_event("shutdown")
def _shutdown():
    watcher.stop()


# ── Models ────────────────────────────────────────────────────────────────

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^\+?[0-9\s\-()]{7,20}$")


class RecipientIn(BaseModel):
    type: str = Field(..., pattern="^(email|sms)$")
    value: str
    label: Optional[str] = ""


class RecipientUpdate(BaseModel):
    label: Optional[str] = None
    enabled: Optional[bool] = None


class SettingsIn(BaseModel):
    min_threat_level: Optional[str] = Field(None, pattern="^(low|medium|high|critical)$")
    mute_until: Optional[int] = None


class TestIn(BaseModel):
    type: str = Field(..., pattern="^(email|sms)$")
    value: str


# ── Health ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok" if store.health() else "degraded",
        "redis": store.health(),
        "watcher": watcher.status(),
    }


# ── Recipients CRUD ───────────────────────────────────────────────────────

@app.get("/recipients/{email}")
def list_recipients(email: str):
    store.ensure_owner_subscribed(email)
    return {
        "email": email,
        "recipients": store.list_recipients(email),
        "settings": store.get_settings(email),
    }


@app.post("/recipients/{email}")
def add_recipient(email: str, body: RecipientIn):
    if body.type == "email" and not EMAIL_RE.match(body.value):
        raise HTTPException(400, "invalid email address")
    if body.type == "sms" and not PHONE_RE.match(body.value):
        raise HTTPException(400, "invalid phone number")
    rec = store.add_recipient(email, body.type, body.value.strip(), body.label or "")
    return rec


@app.patch("/recipients/{email}/{rec_id}")
def update_recipient(email: str, rec_id: str, body: RecipientUpdate):
    rec = store.update_recipient(email, rec_id, body.dict(exclude_none=True))
    if not rec:
        raise HTTPException(404, "recipient not found")
    return rec


@app.delete("/recipients/{email}/{rec_id}")
def delete_recipient(email: str, rec_id: str):
    if not store.delete_recipient(email, rec_id):
        raise HTTPException(404, "recipient not found")
    return {"status": "deleted", "id": rec_id}


# ── Settings ──────────────────────────────────────────────────────────────

@app.get("/settings/{email}")
def get_settings(email: str):
    return store.get_settings(email)


@app.put("/settings/{email}")
def put_settings(email: str, body: SettingsIn):
    return store.set_settings(email, body.dict(exclude_none=True))


# ── Test ──────────────────────────────────────────────────────────────────

@app.post("/test/{email}")
def test_send(email: str, body: TestIn):
    """Fire a sample alert at a single channel — for users to verify config."""
    sample = {
        "threat_level": "medium",
        "final_score": 0.42,
        "agent_id": f"{email}:test-agent",
        "timestamp": "test",
        "critical_alerts": ["This is a RIHNO test alert."],
        "network_alerts": [],
    }
    if body.type == "email":
        if not EMAIL_RE.match(body.value):
            raise HTTPException(400, "invalid email")
        ok, info = send_email(
            body.value,
            build_alert_subject(sample),
            build_alert_body(sample),
            build_alert_html(sample),
        )
    else:
        if not PHONE_RE.match(body.value):
            raise HTTPException(400, "invalid phone")
        ok, info = send_sms(body.value, build_sms_body(sample))
    return {"ok": ok, "info": info}


# ── Threat status ─────────────────────────────────────────────────────────

@app.get("/threats/{email}")
def threats_for_user(email: str):
    """Latest cached AI-detection threat per agent for a user."""
    threats = watcher.latest_threats(email=email)

    # Best-effort live read if cache empty (cold start)
    if not threats:
        try:
            agents = ids_redis.smembers("ids:agents") or []
        except redis.RedisError:
            agents = []
        for agent_id in agents:
            agent_id_str = agent_id.decode() if isinstance(agent_id, bytes) else agent_id
            owner, _, _ = agent_id_str.partition(":")
            if owner != email:
                continue
            try:
                top = ids_redis.zrevrange(f"ids:{agent_id_str}:alerts", 0, 0)
            except redis.RedisError:
                continue
            if not top:
                threats.append({
                    "agent_id": agent_id_str,
                    "threat_level": "normal",
                    "final_score": 0,
                    "timestamp": "",
                })
                continue
            import json as _json
            try:
                alert = _json.loads(top[0].decode() if isinstance(top[0], bytes) else top[0])
            except _json.JSONDecodeError:
                continue
            threats.append({
                "agent_id": agent_id_str,
                "threat_level": alert.get("threat_level", "normal"),
                "final_score": alert.get("final_score", 0),
                "timestamp": alert.get("timestamp", ""),
            })

    summary = {
        "total_agents": len(threats),
        "max_level": "normal",
        "max_rank": 0,
    }
    for t in threats:
        rank = THREAT_RANK.get(t["threat_level"], 0)
        if rank > summary["max_rank"]:
            summary["max_rank"] = rank
            summary["max_level"] = t["threat_level"]

    return {"email": email, "summary": summary, "agents": threats}


@app.get("/dispatch_log")
def dispatch_log():
    return watcher.status()
