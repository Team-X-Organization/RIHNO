"""
redis_store.py

Redis Data Layer for IDS Zero-Day Detection

Key Schema (must match Go dealer's redis_pipeline.go):
  ids:agents                          SET    — all registered agent keys
  ids:{email}:{agent}:stream          STREAM — raw metrics (Go writes, Python reads)
  ids:{email}:{agent}:latest          STRING — latest metric JSON snapshot
  ids:{email}:{agent}:alerts          ZSET   — alerts scored by timestamp
  ids:{email}:{agent}:model:iforest   STRING — pickled isolation forest state
  ids:{email}:{agent}:model:autoencoder STRING — pickled autoencoder state
  ids:{email}:{agent}:model:normalizer STRING — pickled normalizer state
  ids:{email}:{agent}:config          HASH   — per-agent config overrides
  ids:global:stats                    HASH   — global counters
"""

import json
import time
import pickle
import numpy as np
import redis
from typing import Dict, List, Optional


# ── Constants ────────────────────────────────────────────────────────────────

STREAM_MAXLEN = 5000
ALERT_MAX_COUNT = 500
MODEL_SAVE_INTERVAL = 50


class RedisStore:
    """Redis data layer for the IDS system."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6379,
        db: int = 0,
        password: Optional[str] = None,
    ):
        self.redis = redis.Redis(
            host=host, port=port, db=db,
            password=password,
            decode_responses=False,
            socket_timeout=5,
            retry_on_timeout=True,
        )
        self._prefix = "ids"

    def _key(self, *parts) -> str:
        return ":".join([self._prefix] + list(parts))

    def _agent_key(self, email: str, agent: str) -> str:
        """Sanitize email + agent into key segment. Must match Go sanitizeKeyPart()."""
        safe_email = email.replace(":", "_")
        safe_agent = agent.replace(":", "_").replace(" ", "_")
        return f"{safe_email}:{safe_agent}"

    # ── Agent Registry ────────────────────────────────────────────

    def register_agent(self, email: str, agent: str) -> None:
        agent_id = self._agent_key(email, agent)
        self.redis.sadd(self._key("agents"), agent_id)

    def get_all_agents(self) -> List[str]:
        members = self.redis.smembers(self._key("agents"))
        return [m.decode() if isinstance(m, bytes) else m for m in members]

    def agent_exists(self, email: str, agent: str) -> bool:
        agent_id = self._agent_key(email, agent)
        return self.redis.sismember(self._key("agents"), agent_id)

    # ── Metric Stream ─────────────────────────────────────────────

    def push_metric(self, email: str, agent: str, metric_json: dict) -> str:
        """Push a metric to the agent's stream (also used by Python if needed)."""
        agent_id = self._agent_key(email, agent)
        stream_key = self._key(agent_id, "stream")
        entry_data = {"data": json.dumps(metric_json)}
        entry_id = self.redis.xadd(stream_key, entry_data, maxlen=STREAM_MAXLEN, approximate=True)
        self.redis.set(self._key(agent_id, "latest"), json.dumps(metric_json))
        self.register_agent(email, agent)
        self.redis.hincrby(self._key("global", "stats"), "total_processed", 1)
        return entry_id.decode() if isinstance(entry_id, bytes) else entry_id

    def get_latest_metric(self, email: str, agent: str) -> Optional[dict]:
        agent_id = self._agent_key(email, agent)
        data = self.redis.get(self._key(agent_id, "latest"))
        return json.loads(data) if data else None

    def get_metric_history(self, email: str, agent: str, count: int = 100) -> List[dict]:
        agent_id = self._agent_key(email, agent)
        stream_key = self._key(agent_id, "stream")
        entries = self.redis.xrevrange(stream_key, count=count)
        metrics = []
        for entry_id, fields in entries:
            data_field = fields.get(b"data") or fields.get("data")
            if data_field:
                raw = data_field.decode() if isinstance(data_field, bytes) else data_field
                metrics.append(json.loads(raw))
        metrics.reverse()
        return metrics

    def get_stream_length(self, email: str, agent: str) -> int:
        agent_id = self._agent_key(email, agent)
        return self.redis.xlen(self._key(agent_id, "stream"))

    # ── Alerts ────────────────────────────────────────────────────

    def push_alert(self, email: str, agent: str, alert: dict) -> None:
        agent_id = self._agent_key(email, agent)
        alert_key = self._key(agent_id, "alerts")
        score = time.time()
        alert["stored_at"] = score
        self.redis.zadd(alert_key, {json.dumps(alert): score})
        total = self.redis.zcard(alert_key)
        if total > ALERT_MAX_COUNT:
            self.redis.zremrangebyrank(alert_key, 0, total - ALERT_MAX_COUNT - 1)
        self.redis.hincrby(self._key("global", "stats"), "total_alerts", 1)

    def get_recent_alerts(self, email: str, agent: str, count: int = 50) -> List[dict]:
        agent_id = self._agent_key(email, agent)
        alert_key = self._key(agent_id, "alerts")
        entries = self.redis.zrevrange(alert_key, 0, count - 1)
        return [json.loads(e.decode() if isinstance(e, bytes) else e) for e in entries]

    def get_all_alerts(self, count: int = 100) -> List[dict]:
        all_alerts = []
        for agent_id in self.get_all_agents():
            alert_key = self._key(agent_id, "alerts")
            entries = self.redis.zrevrange(alert_key, 0, count - 1, withscores=True)
            for entry, score in entries:
                raw = entry.decode() if isinstance(entry, bytes) else entry
                alert = json.loads(raw)
                alert["agent_id"] = agent_id
                all_alerts.append((score, alert))
        all_alerts.sort(key=lambda x: x[0], reverse=True)
        return [a for _, a in all_alerts[:count]]

    # ── Model State Persistence ───────────────────────────────────

    def save_model_state(self, email: str, agent: str, component: str, data: bytes) -> None:
        agent_id = self._agent_key(email, agent)
        self.redis.set(self._key(agent_id, "model", component), data)

    def load_model_state(self, email: str, agent: str, component: str) -> Optional[bytes]:
        agent_id = self._agent_key(email, agent)
        return self.redis.get(self._key(agent_id, "model", component))

    def save_normalizer(self, email: str, agent: str, n: int, mean, m2, min_vals, max_vals):
        data = pickle.dumps({"n": n, "mean": mean, "M2": m2, "min_vals": min_vals, "max_vals": max_vals})
        self.save_model_state(email, agent, "normalizer", data)

    def load_normalizer(self, email: str, agent: str) -> Optional[dict]:
        data = self.load_model_state(email, agent, "normalizer")
        return pickle.loads(data) if data else None

    # ── Per-Agent Config ──────────────────────────────────────────

    def set_agent_config(self, email: str, agent: str, config: dict) -> None:
        agent_id = self._agent_key(email, agent)
        encoded = {k: json.dumps(v) for k, v in config.items()}
        self.redis.hset(self._key(agent_id, "config"), mapping=encoded)

    def get_agent_config(self, email: str, agent: str) -> dict:
        agent_id = self._agent_key(email, agent)
        raw = self.redis.hgetall(self._key(agent_id, "config"))
        config = {}
        for k, v in raw.items():
            k_str = k.decode() if isinstance(k, bytes) else k
            v_str = v.decode() if isinstance(v, bytes) else v
            try:
                config[k_str] = json.loads(v_str)
            except (json.JSONDecodeError, TypeError):
                config[k_str] = v_str
        return config

    # ── Global Stats ──────────────────────────────────────────────

    def get_global_stats(self) -> dict:
        raw = self.redis.hgetall(self._key("global", "stats"))
        stats = {}
        for k, v in raw.items():
            k_str = k.decode() if isinstance(k, bytes) else k
            v_str = v.decode() if isinstance(v, bytes) else v
            try:
                stats[k_str] = int(v_str)
            except (ValueError, TypeError):
                stats[k_str] = v_str
        stats["registered_agents"] = self.redis.scard(self._key("agents"))
        return stats

    # ── Last Assessment (every detection result, even "normal") ──

    def save_last_assessment(self, email: str, agent: str, result: dict) -> None:
        agent_id = self._agent_key(email, agent)
        self.redis.set(self._key(agent_id, "last_assessment"), json.dumps(result))

    def get_last_assessment(self, email: str, agent: str) -> Optional[dict]:
        agent_id = self._agent_key(email, agent)
        data = self.redis.get(self._key(agent_id, "last_assessment"))
        return json.loads(data) if data else None

    # ── Agent Summary ─────────────────────────────────────────────

    def get_agent_summary(self, email: str, agent: str) -> dict:
        agent_id = self._agent_key(email, agent)
        return {
            "agent_id": agent_id,
            "stream_length": self.get_stream_length(email, agent),
            "recent_alerts": len(self.get_recent_alerts(email, agent, count=10)),
            "has_iforest": self.load_model_state(email, agent, "iforest") is not None,
            "has_autoencoder": self.load_model_state(email, agent, "autoencoder") is not None,
            "has_normalizer": self.load_model_state(email, agent, "normalizer") is not None,
        }

    # ── Cleanup ───────────────────────────────────────────────────

    def delete_agent(self, email: str, agent: str) -> None:
        agent_id = self._agent_key(email, agent)
        keys = [
            self._key(agent_id, s)
            for s in ["stream", "latest", "alerts", "config", "last_assessment"]
        ] + [
            self._key(agent_id, "model", c)
            for c in ["iforest", "autoencoder", "normalizer"]
        ]
        self.redis.delete(*keys)
        self.redis.srem(self._key("agents"), agent_id)

    def health_check(self) -> bool:
        try:
            return self.redis.ping()
        except redis.ConnectionError:
            return False