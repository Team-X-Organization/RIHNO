"""
ensemble_scorer.py

Ensemble Anomaly Scorer
  - Combines signals from all 4 detection layers
  - Inactive layers redistribute their weight to active ones
  - Critical alerts override minimum score to HIGH
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
    """Combine multiple detector outputs into a single anomaly score."""

    BASE_WEIGHTS = {
        "statistical": 0.35,
        "hybrid": 0.45,
        "network_analyzer": 0.20,
    }

    def score(
        self,
        statistical_result: Dict,
        hybrid_result: Dict,
        network_result: Dict,
        metadata: Dict,
    ) -> Dict:
        """Compute ensemble anomaly score with adaptive weighting."""
        layers = {
            "statistical": statistical_result,
            "hybrid": hybrid_result,
            "network_analyzer": network_result,
        }

        # Determine active layers and redistribute inactive weight
        active_weights = {}
        inactive_weight = 0.0
        for name, result in layers.items():
            if name == "network_analyzer" or result.get("active", True):
                active_weights[name] = self.BASE_WEIGHTS[name]
            else:
                inactive_weight += self.BASE_WEIGHTS[name]

        if active_weights and inactive_weight > 0:
            total_active = sum(active_weights.values())
            for name in active_weights:
                active_weights[name] += inactive_weight * active_weights[name] / total_active

        # Compute weighted score
        final_score = 0.0
        layer_contributions = {}
        for name, weight in active_weights.items():
            layer_score = layers[name].get("score", 0.0)
            contribution = layer_score * weight
            final_score += contribution
            layer_contributions[name] = {
                "score": round(layer_score, 4),
                "weight": round(weight, 4),
                "contribution": round(contribution, 4),
                "active": layers[name].get("active", True),
            }

        # Critical alerts override: minimum HIGH for any critical finding
        critical_alerts = statistical_result.get("critical_alerts", [])
        net_alerts = [a for a in network_result.get("alerts", []) if a.get("severity") == "high"]
        if critical_alerts or net_alerts:
            final_score = max(final_score, 0.6)

        return {
            "timestamp": metadata.get("timestamp", ""),
            "email": metadata.get("email", ""),
            "agent_name": metadata.get("agent_name", ""),
            "final_score": round(final_score, 4),
            "threat_level": classify_threat(final_score),
            "layer_contributions": layer_contributions,
            "critical_alerts": critical_alerts,
            "network_alerts": network_result.get("alerts", []),
            "network_patterns": network_result.get("patterns", []),
            "anomalous_features": statistical_result.get("anomalous_features", [])[:10],
            "hybrid_details": {
                "reconstruction_error": hybrid_result.get("reconstruction_error", 0.0),
                "discriminator_score": hybrid_result.get("discriminator_score", 0.0),
                "threshold_multiplier": hybrid_result.get("threshold_multiplier", 1.0),
                "rl_epsilon": hybrid_result.get("rl_epsilon", 0.5),
            },
        }