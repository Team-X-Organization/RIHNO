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
import pickle
from typing import Dict, List

from feature_extractor import (
    extract_features, extract_network_features,
    extract_metadata, make_agent_key, ALL_FEATURES,
)
from statistical_detector import StatisticalDetector
from isolation_forest_detector import IsolationForestDetector
from autoencoder_detector import AutoencoderDetector
from network_analyzer import NetworkAnalyzer
from ensemble_scorer import EnsembleScorer
from redis_store import RedisStore, MODEL_SAVE_INTERVAL


# ── Per-Agent Pipeline ───────────────────────────────────────────────────────

class AgentPipeline:
    """
    Isolated detection pipeline for a single agent.
    Each agent has its own normalizer, isolation forest,
    autoencoder, and network analyzer.
    """

    def __init__(self, email: str, agent_name: str):
        self.email = email
        self.agent_name = agent_name
        self.agent_key = make_agent_key(email, agent_name)

        n_features = len(ALL_FEATURES)
        self.statistical = StatisticalDetector(z_threshold=3.0)
        self.iforest = IsolationForestDetector(contamination=0.05)
        self.autoencoder = AutoencoderDetector(input_dim=n_features, latent_dim=16)
        self.network = NetworkAnalyzer()
        self.ensemble = EnsembleScorer()
        self.sample_count = 0

    def process(self, features, net_features, metadata) -> Dict:
        """Run all detection layers and return ensemble result."""
        self.sample_count += 1

        self.statistical.update(features)
        self.iforest.add_sample(features)
        self.autoencoder.add_sample(features)

        stat_result = self.statistical.detect(features)
        iforest_result = self.iforest.detect(features)
        ae_result = self.autoencoder.detect(features)
        net_result = self.network.analyze(net_features)

        result = self.ensemble.score(
            stat_result, iforest_result, ae_result, net_result, metadata,
        )

        result["system_status"] = {
            "agent_key": self.agent_key,
            "total_samples": self.sample_count,
            "statistical_active": True,
            "iforest_active": self.iforest.is_active,
            "iforest_samples_needed": max(0, self.iforest.MIN_SAMPLES - len(self.iforest.training_data)),
            "autoencoder_active": self.autoencoder.is_active,
            "autoencoder_samples_needed": max(0, self.autoencoder.MIN_SAMPLES - len(self.autoencoder.training_data)),
        }
        return result

    def save_to_redis(self, store: RedisStore):
        """Persist all model state to Redis."""
        e, a = self.email, self.agent_name
        norm = self.statistical.normalizer
        store.save_normalizer(e, a, norm.n, norm.mean, norm.M2, norm.min_vals, norm.max_vals)
        if self.iforest.training_data:
            store.save_model_state(e, a, "iforest", self.iforest.serialize())
        if self.autoencoder.training_data:
            store.save_model_state(e, a, "autoencoder", self.autoencoder.serialize())

    def load_from_redis(self, store: RedisStore):
        """Restore model state from Redis."""
        e, a = self.email, self.agent_name
        norm_data = store.load_normalizer(e, a)
        if norm_data:
            n = self.statistical.normalizer
            n.n = norm_data["n"]
            n.mean = norm_data["mean"]
            n.M2 = norm_data["M2"]
            n.min_vals = norm_data["min_vals"]
            n.max_vals = norm_data["max_vals"]
            self.sample_count = n.n
        iforest_data = store.load_model_state(e, a, "iforest")
        if iforest_data:
            self.iforest.deserialize(iforest_data)
        ae_data = store.load_model_state(e, a, "autoencoder")
        if ae_data:
            self.autoencoder.deserialize(ae_data)


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
        return {
            "agent_key": pipeline.agent_key,
            "email": email,
            "agent_name": agent_name,
            "samples_processed": pipeline.sample_count,
            "layers": {
                "statistical": {"active": True},
                "isolation_forest": {
                    "active": pipeline.iforest.is_active,
                    "samples": len(pipeline.iforest.training_data),
                    "needed": pipeline.iforest.MIN_SAMPLES,
                },
                "autoencoder": {
                    "active": pipeline.autoencoder.is_active,
                    "samples": len(pipeline.autoencoder.training_data),
                    "needed": pipeline.autoencoder.MIN_SAMPLES,
                },
                "network_analyzer": {"active": True},
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