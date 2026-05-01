"""
alert_watcher.py

Background poller: scans the AI engine's per-agent alert ZSETs in Redis,
finds alerts above each user's threshold, and dispatches email + SMS.

Dedupes via RecipientsStore.mark_sent().
One email per agent per poll — dispatches only the newest qualifying unsent
alert, preventing startup floods when many old alerts sit in Redis.
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
from bedrock_summarizer import summarize_alert

logger = logging.getLogger(__name__)


THREAT_RANK = {"normal": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}

POLL_INTERVAL_SECONDS = 10
ALERT_LOOKBACK = 20  # newest N alerts per agent per poll
# Minimum seconds between two dispatched notifications for the same agent.
# Prevents back-to-back emails when multiple alerts clear the threshold.
MIN_DISPATCH_INTERVAL = 60  # 1 minute


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
        # Per-agent last-dispatch wall time — enforces MIN_DISPATCH_INTERVAL.
        self._agent_last_dispatch_ts: Dict[str, float] = {}

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
        # Track the single best unsent alert above threshold to dispatch this poll.
        best_unsent: Optional[dict] = None
        best_unsent_rank: int = -1

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
            rank = THREAT_RANK.get(level, 0)
            if rank < threshold:
                continue

            uid = _alert_id(agent_id, alert)
            if self.store.already_sent(email, uid):
                continue

            # Mark all qualifying unsent alerts as sent to prevent future floods,
            # but only actually dispatch the highest-severity one this poll.
            self.store.mark_sent(email, uid)

            if rank > best_unsent_rank:
                best_unsent = alert
                best_unsent_rank = rank

        if latest_for_agent is not None:
            self._last_threat[agent_id] = {
                "threat_level": latest_for_agent.get("threat_level", "normal"),
                "final_score": latest_for_agent.get("final_score", 0),
                "timestamp": latest_for_agent.get("timestamp", ""),
                "email": email,
                "ai_summary": self._last_threat.get(agent_id, {}).get("ai_summary", ""),
            }

        if best_unsent is None or muted:
            return

        # Rate-limit: skip if a notification for this agent went out recently.
        now = time.time()
        last_ts = self._agent_last_dispatch_ts.get(agent_id, 0)
        if now - last_ts < MIN_DISPATCH_INTERVAL:
            logger.info(
                "Suppressing notification for %s — last sent %.0fs ago (cooldown %ds)",
                agent_id, now - last_ts, MIN_DISPATCH_INTERVAL,
            )
            return

        self._agent_last_dispatch_ts[agent_id] = now
        self._dispatch(email, best_unsent)

    # ── Dispatch ─────────────────────────────────────────────────────────────

    def _dispatch(self, email: str, alert: Dict) -> None:
        subject = build_alert_subject(alert)

        # Generate Nova Lite explanation once per alert. Returns None on
        # any failure (boto3 missing, AWS creds missing, model error) — the
        # notification still goes out with raw metrics intact.
        summary = summarize_alert(alert)
        email_summary = summary.get("email_summary", "") if summary else ""
        sms_summary = summary.get("sms_summary", "") if summary else ""

        if email_summary:
            logger.info("Bedrock summary included in notification for agent %s", alert.get("agent_id"))
        else:
            logger.info("No Bedrock summary for agent %s (check AWS creds / BEDROCK_SUMMARY_DISABLED)", alert.get("agent_id"))

        # Persist the summary text so the frontend /threats endpoint can return it.
        agent_id = alert.get("agent_id", "")
        if agent_id and agent_id in self._last_threat:
            self._last_threat[agent_id]["ai_summary"] = email_summary

        body = build_alert_body(alert, ai_summary=email_summary)
        html = build_alert_html(alert, ai_summary=email_summary)
        sms_body = build_sms_body(alert, ai_summary=sms_summary)

        emails = self.store.get_enabled_by_type(email, "email")
        for rec in emails:
            ok, info = send_email(rec["value"], subject, body, html=html)
            self._last_dispatch[rec["value"]] = {
                "ok": ok, "info": info, "ts": int(time.time()),
                "channel": "email", "level": alert.get("threat_level"),
                "ai_summary": bool(email_summary),
            }
            logger.info("Email dispatch → %s ok=%s", rec["value"], ok)

        phones = self.store.get_enabled_by_type(email, "sms")
        for rec in phones:
            ok, info = send_sms(rec["value"], sms_body)
            self._last_dispatch[rec["value"]] = {
                "ok": ok, "info": info, "ts": int(time.time()),
                "channel": "sms", "level": alert.get("threat_level"),
                "ai_summary": bool(sms_summary),
            }
            logger.info("SMS dispatch → %s ok=%s", rec["value"], ok)

    # ── Status ───────────────────────────────────────────────────────────────

    def status(self) -> Dict:
        return {
            "running": bool(self._thread and self._thread.is_alive()),
            "poll_interval": self.poll_interval,
            "min_dispatch_interval": MIN_DISPATCH_INTERVAL,
            "last_dispatches": self._last_dispatch,
        }

    def latest_threats(self, email: Optional[str] = None) -> List[Dict]:
        out = []
        for agent_id, info in self._last_threat.items():
            if email and info.get("email") != email:
                continue
            out.append({"agent_id": agent_id, **info})
        return out
