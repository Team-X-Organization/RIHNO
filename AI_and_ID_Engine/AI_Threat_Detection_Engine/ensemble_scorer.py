"""
ensemble_scorer.py

Ensemble Anomaly Scorer
  - Hybrid AI (Autoencoder + GAN + RL) is the sole threat scoring layer
  - Network analyzer runs passively; its alerts are surfaced but do not
    inflate the primary score (eliminates the static 0.6 floor bug)
  - final_score == hybrid_score when active, 0.0 during warmup
"""

from typing import Dict


def classify_threat(score: float) -> str:
    """Map anomaly score (0.0-1.0) to threat level."""
    if score < 0.15:
        return "normal"
    elif score < 0.35:
        return "low"
    elif score < 0.55:
        return "medium"
    elif score < 0.75:
        return "high"
    return "critical"


class EnsembleScorer:
    """Wrap Hybrid AI output into the canonical assessment shape."""

    def score(
        self,
        hybrid_result: Dict,
        network_result: Dict,
        metadata: Dict,
    ) -> Dict:
        hybrid_score = max(0.0, min(1.0, hybrid_result.get("score", 0.0)))
        hybrid_active = hybrid_result.get("active", True)

        final_score = hybrid_score

        layer_contributions = {
            "hybrid": {
                "score": round(hybrid_score, 4),
                "weight": 1.0,
                "contribution": round(hybrid_score, 4),
                "active": hybrid_active,
            }
        }

        return {
            "timestamp": metadata.get("timestamp", ""),
            "email": metadata.get("email", ""),
            "agent_name": metadata.get("agent_name", ""),
            "final_score": round(final_score, 4),
            "threat_level": classify_threat(final_score),
            "layer_contributions": layer_contributions,
            "critical_alerts": [],
            "network_alerts": network_result.get("alerts", []),
            "network_patterns": network_result.get("patterns", []),
            "anomalous_features": [],
            "hybrid_details": {
                "reconstruction_error": hybrid_result.get("reconstruction_error", 0.0),
                "discriminator_score": hybrid_result.get("discriminator_score", 0.0),
                "threshold_multiplier": hybrid_result.get("threshold_multiplier", 1.0),
                "rl_epsilon": hybrid_result.get("rl_epsilon", 0.5),
            },
        }
