"""
main.py

Zero-Day Attack Detection Engine (Redis-backed, per-agent)

Each agent (email + agent_name) gets an isolated detection pipeline
with independent model state persisted in Redis.

Usage:
    from redis_store import RedisStore
    from main import IDSEngine

    store = RedisStore(host="my_rihno_redis", port=6379)
    engine = IDSEngine(store)
    result = engine.process(metric_json)
    print(result["threat_level"])  # "normal" | "low" | "medium" | "high" | "critical"
"""

import json
import logging
import pickle
import time
from typing import Dict, List

from feature_extractor import (
    extract_features, extract_network_features,
    extract_metadata, make_agent_key, ALL_FEATURES,
)
from hybrid_detector import HybridDetector
from network_analyzer import NetworkAnalyzer
from ensemble_scorer import EnsembleScorer
from redis_store import RedisStore, MODEL_SAVE_INTERVAL

logger = logging.getLogger(__name__)


# ── Per-Agent Pipeline ───────────────────────────────────────────────────────

class AgentPipeline:
    """
    Isolated detection pipeline for a single agent.
    Each agent has its own hybrid detector (with internal scaler) and network analyzer.
    """

    def __init__(self, email: str, agent_name: str):
        self.email = email
        self.agent_name = agent_name
        self.agent_key = make_agent_key(email, agent_name)

        n_features = len(ALL_FEATURES)
        self.hybrid = HybridDetector(input_dim=n_features)
        self.hybrid.agent_label = self.agent_key
        self.network = NetworkAnalyzer()
        self.ensemble = EnsembleScorer()
        self.sample_count = 0
        self.last_saved_at: float = 0.0

    def process(self, features, net_features, metadata) -> Dict:
        """Run Hybrid AI + network layers and return ensemble result."""
        self.sample_count += 1

        self.hybrid.add_sample(features)

        hybrid_result = self.hybrid.detect(features)
        net_result = self.network.analyze(net_features)

        result = self.ensemble.score(hybrid_result, net_result, metadata)

        result["system_status"] = {
            "agent_key": self.agent_key,
            "total_samples": self.sample_count,
            "hybrid_active": self.hybrid.is_active,
            "hybrid_samples_needed": max(0, self.hybrid.MIN_SAMPLES - len(self.hybrid.training_data)),
            "hybrid_train_count": self.hybrid.train_count,
        }
        return result

    def save_to_redis(self, store: RedisStore):
        """Persist hybrid model state to Redis."""
        e, a = self.email, self.agent_name
        if self.hybrid.training_data:
            store.save_model_state(e, a, "hybrid", self.hybrid.serialize())
        self.last_saved_at = time.time()
        logger.info(
            "[pipeline][%s] persisted to redis (samples=%d hybrid_trained=%s)",
            self.agent_key, self.sample_count, self.hybrid.is_trained,
        )

    def load_from_redis(self, store: RedisStore):
        """Restore hybrid model state from Redis."""
        e, a = self.email, self.agent_name
        hybrid_data = store.load_model_state(e, a, "hybrid")
        if hybrid_data:
            self.hybrid.deserialize(hybrid_data)
            self.sample_count = len(self.hybrid.training_data)


# ── Multi-Agent Engine ───────────────────────────────────────────────────────

class IDSEngine:
    """
    Multi-agent IDS Engine backed by Redis.
    Manages a pool of per-agent pipelines. Models are loaded from
    Redis on first access and periodically saved back.
    """

    def __init__(self, store: RedisStore):
        self.store = store
        self._pipelines: Dict[str, AgentPipeline] = {}

    def _get_pipeline(self, email: str, agent_name: str) -> AgentPipeline:
        """Get or create a detection pipeline for an agent."""
        key = make_agent_key(email, agent_name)
        if key not in self._pipelines:
            pipeline = AgentPipeline(email, agent_name)
            pipeline.load_from_redis(self.store)
            self._pipelines[key] = pipeline
        return self._pipelines[key]

    def process(self, metric_json: dict) -> Dict:
        """
        Process a single metric reading.
        1. Route to agent's isolated pipeline
        2. Store metric in Redis stream
        3. Run detection
        4. Store alerts if threat detected
        5. Periodically save models
        """
        email = metric_json.get("email", "unknown")
        agent_name = metric_json.get("agent_name", "unknown")

        pipeline = self._get_pipeline(email, agent_name)

        # Store raw metric in Redis (if not already pushed by Go dealer)
        # The Go dealer writes to the stream; this is a fallback for direct API usage
        self.store.push_metric(email, agent_name, metric_json)

        features = extract_features(metric_json)
        net_features = extract_network_features(metric_json)
        metadata = extract_metadata(metric_json)

        result = pipeline.process(features, net_features, metadata)

        # Always store the latest assessment so frontend can show current
        # threat score even when no alert was raised.
        self.store.save_last_assessment(email, agent_name, {
            "timestamp": result.get("timestamp"),
            "threat_level": result.get("threat_level"),
            "final_score": result.get("final_score"),
            "layer_contributions": result.get("layer_contributions", {}),
            "anomalous_features": result.get("anomalous_features", []),
            "critical_alerts": result.get("critical_alerts", []),
            "network_alerts": result.get("network_alerts", []),
            "network_patterns": result.get("network_patterns", []),
            "system_status": result.get("system_status", {}),
        })

        if result["threat_level"] != "normal":
            self.store.push_alert(email, agent_name, {
                "timestamp": result["timestamp"],
                "threat_level": result["threat_level"],
                "final_score": result["final_score"],
                "critical_alerts": result.get("critical_alerts", []),
                "network_alerts": result.get("network_alerts", []),
            })

        if pipeline.sample_count % MODEL_SAVE_INTERVAL == 0:
            pipeline.save_to_redis(self.store)

        return result

    def process_from_stream(self, email: str, agent_name: str) -> Dict:
        """
        Read the latest metric from the agent's Redis stream and process it.
        Used when the Go dealer has already written the data to Redis.
        """
        metric = self.store.get_latest_metric(email, agent_name)
        if not metric:
            return {"error": f"No metrics found for {email}:{agent_name}"}
        return self.process(metric)

    def get_agent_status(self, email: str, agent_name: str) -> Dict:
        pipeline = self._get_pipeline(email, agent_name)
        summary = self.store.get_agent_summary(email, agent_name)
        h = pipeline.hybrid
        return {
            "agent_key": pipeline.agent_key,
            "email": email,
            "agent_name": agent_name,
            "samples_processed": pipeline.sample_count,
            "layers": {
                "hybrid": {
                    "active": h.is_active,
                    "samples": len(h.training_data),
                    "needed": h.MIN_SAMPLES,
                    "train_count": h.train_count,
                    "threshold": round(h.threshold, 6),
                    "threshold_multiplier": round(h._threshold_multiplier, 4),
                    "rl_epsilon": round(h.rl_epsilon, 4),
                },
            },
            "redis": summary,
        }

    def get_all_agents_status(self) -> List:
        agents = self.store.get_all_agents()
        statuses = []
        for agent_id in agents:
            parts = agent_id.split(":", 1)
            if len(parts) == 2:
                statuses.append(self.get_agent_status(parts[0], parts[1]))
        return statuses

    def get_global_status(self) -> Dict:
        return {
            "global_stats": self.store.get_global_stats(),
            "active_pipelines": len(self._pipelines),
            "agents": self.get_all_agents_status(),
        }

    def save_all(self):
        """Force save all pipeline states to Redis."""
        for key, pipeline in self._pipelines.items():
            pipeline.save_to_redis(self.store)