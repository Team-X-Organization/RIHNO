"""
auto_detector.py

Background poller — runs detection on every registered agent at fixed interval.

Without this, the IDS engine only acts on incoming HTTP requests, so dealer-fed
metrics in Redis are never scored.
"""

import logging
import threading
import time
from typing import Optional

from main import IDSEngine
from redis_store import RedisStore

logger = logging.getLogger(__name__)


class AutoDetector:
    def __init__(
        self,
        engine: IDSEngine,
        store: RedisStore,
        engine_lock: threading.Lock,
        poll_interval: float = 5.0,
    ):
        self.engine = engine
        self.store = store
        self.engine_lock = engine_lock
        self.poll_interval = poll_interval
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._last_seen_entry: dict = {}  # agent_id -> last stream id processed
        self._iterations = 0
        self._last_run_ts = 0

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="auto-detector")
        self._thread.start()
        logger.info("AutoDetector started (interval=%.1fs)", self.poll_interval)

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)

    def status(self) -> dict:
        return {
            "running": bool(self._thread and self._thread.is_alive()),
            "poll_interval": self.poll_interval,
            "iterations": self._iterations,
            "last_run_ts": self._last_run_ts,
            "tracked_agents": len(self._last_seen_entry),
        }

    def _loop(self):
        while not self._stop.is_set():
            try:
                self._scan_once()
            except Exception:  # noqa: BLE001
                logger.exception("auto-detector iteration failed")
            self._iterations += 1
            self._last_run_ts = int(time.time())
            self._stop.wait(self.poll_interval)

    def _scan_once(self):
        agents = self.store.get_all_agents()
        for agent_id in agents:
            if ":" not in agent_id:
                continue
            email, agent_name = agent_id.split(":", 1)

            # Skip if no new entries since last scan
            stream_key = self.store._key(agent_id, "stream")
            try:
                latest = self.store.redis.xrevrange(stream_key, count=1)
            except Exception:  # noqa: BLE001
                continue
            if not latest:
                continue

            entry_id = latest[0][0]
            entry_id_str = entry_id.decode() if isinstance(entry_id, bytes) else entry_id
            if self._last_seen_entry.get(agent_id) == entry_id_str:
                continue

            with self.engine_lock:
                try:
                    self.engine.process_from_stream(email, agent_name)
                    self._last_seen_entry[agent_id] = entry_id_str
                except Exception:  # noqa: BLE001
                    logger.exception("process_from_stream failed for %s", agent_id)
