"""
statistical_detector.py

Layer 1: Statistical Anomaly Detector
  - Z-score analysis with per-feature weighting
  - Rule-based critical feature checks (non-zero = immediate alert)
  - Works from the very first sample
"""

import numpy as np
from typing import Dict
from feature_extractor import OnlineNormalizer, ALL_FEATURES, FEATURE_GROUPS


# ── Per-feature weights (higher = more suspicious when anomalous) ────────────

FEATURE_WEIGHTS = {}
for feat in FEATURE_GROUPS["threat_scores"]:
    FEATURE_WEIGHTS[feat] = 3.0
for feat in FEATURE_GROUPS["network_topology"]:
    FEATURE_WEIGHTS[feat] = 2.0
for feat in FEATURE_GROUPS["network_ratios"]:
    FEATURE_WEIGHTS[feat] = 1.5
for feat in FEATURE_GROUPS["process"]:
    FEATURE_WEIGHTS[feat] = 1.2
for feat in FEATURE_GROUPS["system"]:
    FEATURE_WEIGHTS[feat] = 1.0
for feat in FEATURE_GROUPS["network_volume"]:
    FEATURE_WEIGHTS[feat] = 1.0

# Features that should NEVER be non-zero in normal operation
CRITICAL_FEATURES = {
    "suspicious_process_names", "suspicious_port_connections",
    "port_scanning_score", "data_exfiltration_score",
    "c2_communication_score", "zombie_process_count",
    "syn_sent_connections", "port_scan_indicators",
}


class StatisticalDetector:
    """Z-score + rule-based anomaly detection. Active from sample 1."""

    def __init__(self, z_threshold: float = 3.0):
        self.z_threshold = z_threshold
        self.normalizer = OnlineNormalizer(len(ALL_FEATURES))

    def update(self, features: np.ndarray):
        """Update running statistics with a new sample."""
        self.normalizer.update(features)

    def detect(self, features: np.ndarray) -> Dict:
        """Run statistical anomaly detection. Returns score 0.0-1.0."""
        result = {
            "score": 0.0,
            "anomalous_features": [],
            "critical_alerts": [],
            "layer": "statistical",
        }

        # Rule-based: critical features non-zero check (works on sample 1)
        for i, feat_name in enumerate(ALL_FEATURES):
            if feat_name in CRITICAL_FEATURES and features[i] > 0:
                result["critical_alerts"].append({
                    "feature": feat_name,
                    "value": float(features[i]),
                    "reason": f"{feat_name} = {features[i]} (expected 0)",
                })

        # Z-score analysis (needs at least 3 samples for meaningful variance)
        if self.normalizer.n >= 3:
            z_scores = self.normalizer.z_score(features)
            weights = np.array([FEATURE_WEIGHTS.get(f, 1.0) for f in ALL_FEATURES])

            for i, feat_name in enumerate(ALL_FEATURES):
                if abs(z_scores[i]) > self.z_threshold:
                    result["anomalous_features"].append({
                        "feature": feat_name,
                        "z_score": round(float(z_scores[i]), 2),
                        "value": round(float(features[i]), 4),
                        "mean": round(float(self.normalizer.mean[i]), 4),
                    })

            exceeded = (np.abs(z_scores) > self.z_threshold).astype(float)
            anomaly_score = float(np.sum(exceeded * weights) / np.sum(weights))
            critical_boost = min(len(result["critical_alerts"]) * 0.15, 0.5)
            result["score"] = min(anomaly_score + critical_boost, 1.0)
        else:
            # Not enough data for z-scores — rely on rules only
            result["score"] = min(len(result["critical_alerts"]) * 0.2, 1.0)

        return result