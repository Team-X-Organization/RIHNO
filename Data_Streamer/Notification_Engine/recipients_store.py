"""
recipients_store.py

Per-user recipient list stored in Redis.

Key Schema:
  notify:recipients:{email}     HASH  — recipient_id -> JSON {type,value,label,enabled}
  notify:sent:{email}           ZSET  — dedupe seen alert ids by timestamp
  notify:settings:{email}       HASH  — min_threat_level, mute_until
"""

import json
import time
import uuid
from typing import Dict, List, Optional

import redis


DEDUPE_WINDOW_SECONDS = 24 * 3600
RECIPIENTS_KEY = "notify:recipients"
SETTINGS_KEY = "notify:settings"
SENT_KEY = "notify:sent"


class RecipientsStore:
    def __init__(self, host="localhost", port=6379, db=0, password=None):
        self.redis = redis.Redis(
            host=host, port=port, db=db, password=password,
            decode_responses=True, socket_timeout=5, retry_on_timeout=True,
        )

    def _rkey(self, email: str) -> str:
        return f"{RECIPIENTS_KEY}:{email}"

    def _skey(self, email: str) -> str:
        return f"{SETTINGS_KEY}:{email}"

    def _sentkey(self, email: str) -> str:
        return f"{SENT_KEY}:{email}"

    def health(self) -> bool:
        try:
            return self.redis.ping()
        except redis.RedisError:
            return False

    # ── Recipients ────────────────────────────────────────────────────────────

    def add_recipient(self, email: str, rec_type: str, value: str, label: str = "") -> Dict:
        rec_id = uuid.uuid4().hex[:12]
        rec = {
            "id": rec_id,
            "type": rec_type,
            "value": value,
            "label": label or value,
            "enabled": True,
            "created_at": int(time.time()),
        }
        self.redis.hset(self._rkey(email), rec_id, json.dumps(rec))
        return rec

    def list_recipients(self, email: str) -> List[Dict]:
        raw = self.redis.hgetall(self._rkey(email))
        out = []
        for rid, val in raw.items():
            try:
                out.append(json.loads(val))
            except json.JSONDecodeError:
                continue
        out.sort(key=lambda r: r.get("created_at", 0))
        return out

    def get_recipient(self, email: str, rec_id: str) -> Optional[Dict]:
        val = self.redis.hget(self._rkey(email), rec_id)
        if not val:
            return None
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return None

    def delete_recipient(self, email: str, rec_id: str) -> bool:
        return bool(self.redis.hdel(self._rkey(email), rec_id))

    def update_recipient(self, email: str, rec_id: str, updates: Dict) -> Optional[Dict]:
        rec = self.get_recipient(email, rec_id)
        if not rec:
            return None
        rec.update(updates)
        self.redis.hset(self._rkey(email), rec_id, json.dumps(rec))
        return rec

    def get_enabled_by_type(self, email: str, rec_type: str) -> List[Dict]:
        return [
            r for r in self.list_recipients(email)
            if r.get("type") == rec_type and r.get("enabled", True)
        ]

    def ensure_owner_subscribed(self, email: str) -> None:
        """Auto-add the account email itself if no email recipients exist."""
        emails = self.get_enabled_by_type(email, "email")
        if emails:
            return
        if not email or "@" not in email:
            return
        self.add_recipient(email, "email", email, label="Account Owner")

    # ── Settings ──────────────────────────────────────────────────────────────

    def get_settings(self, email: str) -> Dict:
        raw = self.redis.hgetall(self._skey(email))
        return {
            "min_threat_level": raw.get("min_threat_level", "medium"),
            "mute_until": int(raw.get("mute_until", 0) or 0),
        }

    def set_settings(self, email: str, updates: Dict) -> Dict:
        clean = {k: str(v) for k, v in updates.items() if v is not None}
        if clean:
            self.redis.hset(self._skey(email), mapping=clean)
        return self.get_settings(email)

    # ── Dedupe ────────────────────────────────────────────────────────────────

    def already_sent(self, email: str, alert_id: str) -> bool:
        score = self.redis.zscore(self._sentkey(email), alert_id)
        return score is not None

    def mark_sent(self, email: str, alert_id: str) -> None:
        now = time.time()
        self.redis.zadd(self._sentkey(email), {alert_id: now})
        cutoff = now - DEDUPE_WINDOW_SECONDS
        self.redis.zremrangebyscore(self._sentkey(email), 0, cutoff)
