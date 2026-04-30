"""
alert_watcher.py

Background poller: scans the AI engine's per-agent alert ZSETs in Redis,
finds alerts above each user's threshold, and dispatches email + SMS.

Dedupes via RecipientsStore.mark_sent().
"""

import json
import logging
import threading
import time
from typing import Dict, List, Optional

import redis

from recipients_store import RecipientsStore
from senders import (
    build_alert_body, build_alert_html, build_alert_subject,
    build_sms_body, send_email, send_sms,
)

logger = logging.getLogger(__name__)


THREAT_RANK = {"normal": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}

POLL_INTERVAL_SECONDS = 10
ALERT_LOOKBACK = 20  # newest N alerts per agent per poll


def _alert_id(agent_id: str, alert: Dict) -> str:
    ts = alert.get("timestamp") or alert.get("stored_at") or ""
    score = alert.get("final_score", 0)
    return f"{agent_id}|{ts}|{score}"


class AlertWatcher:
    """Polls Redis IDS alerts and dispatches notifications."""

    def __init__(
        self,
        ids_redis: redis.Redis,
        store: RecipientsStore,
        poll_interval: int = POLL_INTERVAL_SECONDS,
    ):
        self.ids_redis = ids_redis
        self.store = store
        self.poll_interval = poll_interval
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._last_dispatch: Dict[str, dict] = {}
        self._last_threat: Dict[str, dict] = {}

    # ── Lifecycle ────────────────────────────────────────────────────────────

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="alert-watcher")
        self._thread.start()
        logger.info("AlertWatcher started")

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
        logger.info("AlertWatcher stopped")

    # ── Loop ─────────────────────────────────────────────────────────────────

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self._scan_once()
            except Exception:  # noqa: BLE001
                logger.exception("AlertWatcher iteration failed")
            self._stop.wait(self.poll_interval)

    def _scan_once(self) -> None:
        try:
            agents = self.ids_redis.smembers("ids:agents") or []
        except redis.RedisError as exc:
            logger.warning("Cannot reach IDS redis: %s", exc)
            return

        for agent_id in agents:
            agent_id_str = agent_id.decode() if isinstance(agent_id, bytes) else agent_id
            email, _, _ = agent_id_str.partition(":")
            if not email:
                continue

            try:
                self._process_agent(email, agent_id_str)
            except Exception:  # noqa: BLE001
                logger.exception("processing %s failed", agent_id_str)

    def _process_agent(self, email: str, agent_id: str) -> None:
        # ensure account owner is subscribed
        self.store.ensure_owner_subscribed(email)

        settings = self.store.get_settings(email)
        min_level = settings.get("min_threat_level", "medium")
        mute_until = settings.get("mute_until", 0)
        muted = mute_until and mute_until > int(time.time())
        threshold = THREAT_RANK.get(min_level, 2)

        alert_key = f"ids:{agent_id}:alerts"
        try:
            entries = self.ids_redis.zrevrange(alert_key, 0, ALERT_LOOKBACK - 1)
        except redis.RedisError:
            return

        latest_for_agent: Optional[dict] = None

        for raw in entries:
            payload = raw.decode() if isinstance(raw, bytes) else raw
            try:
                alert = json.loads(payload)
            except json.JSONDecodeError:
                continue
            alert["agent_id"] = agent_id

            if latest_for_agent is None:
                latest_for_agent = alert

            level = alert.get("threat_level", "normal")
            if THREAT_RANK.get(level, 0) < threshold:
                continue

            uid = _alert_id(agent_id, alert)
            if self.store.already_sent(email, uid):
                continue

            if not muted:
                self._dispatch(email, alert)
            self.store.mark_sent(email, uid)

        if latest_for_agent is not None:
            self._last_threat[agent_id] = {
                "threat_level": latest_for_agent.get("threat_level", "normal"),
                "final_score": latest_for_agent.get("final_score", 0),
                "timestamp": latest_for_agent.get("timestamp", ""),
                "email": email,
            }

    # ── Dispatch ─────────────────────────────────────────────────────────────

    def _dispatch(self, email: str, alert: Dict) -> None:
        subject = build_alert_subject(alert)
        body = build_alert_body(alert)
        html = build_alert_html(alert)
        sms_body = build_sms_body(alert)

        emails = self.store.get_enabled_by_type(email, "email")
        for rec in emails:
            ok, info = send_email(rec["value"], subject, body, html=html)
            self._last_dispatch[rec["value"]] = {
                "ok": ok, "info": info, "ts": int(time.time()),
                "channel": "email", "level": alert.get("threat_level"),
            }

        phones = self.store.get_enabled_by_type(email, "sms")
        for rec in phones:
            ok, info = send_sms(rec["value"], sms_body)
            self._last_dispatch[rec["value"]] = {
                "ok": ok, "info": info, "ts": int(time.time()),
                "channel": "sms", "level": alert.get("threat_level"),
            }

    # ── Status ───────────────────────────────────────────────────────────────

    def status(self) -> Dict:
        return {
            "running": bool(self._thread and self._thread.is_alive()),
            "poll_interval": self.poll_interval,
            "last_dispatches": self._last_dispatch,
        }

    def latest_threats(self, email: Optional[str] = None) -> List[Dict]:
        out = []
        for agent_id, info in self._last_threat.items():
            if email and info.get("email") != email:
                continue
            out.append({"agent_id": agent_id, **info})
        return out
