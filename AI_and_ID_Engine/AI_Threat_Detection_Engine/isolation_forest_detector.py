"""
isolation_forest_detector.py

Layer 2: Isolation Forest Anomaly Detector
  - Unsupervised tree-based outlier detection
  - Activates after 50 samples per agent
  - Retrains every 100 new samples
"""

import logging
import time
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from typing import Dict, List, Optional
import pickle

logger = logging.getLogger(__name__)

# Force retrain when loaded model is older than this (seconds)
STALE_MODEL_AGE_SECONDS = 3600  # 1 hour
# Cap training_data list to bound memory and prevent unbounded drift
MAX_TRAINING_BUFFER = 5000


class IsolationForestDetector:
    """Isolation Forest for unsupervised anomaly detection."""

    MIN_SAMPLES = 50
    RETRAIN_INTERVAL = 100

    def __init__(self, contamination: float = 0.05):
        self.contamination = contamination
        self.model: Optional[IsolationForest] = None
        self.scaler = StandardScaler()
        self.training_data: List[np.ndarray] = []
        self.samples_since_train = 0
        self.is_trained = False
        self.last_trained_at: float = 0.0
        self.train_count: int = 0
        self.agent_label: str = ""  # set by AgentPipeline for log clarity

    @property
    def is_active(self) -> bool:
        return self.is_trained

    def add_sample(self, features: np.ndarray):
        """Add a sample to training buffer. Auto-trains when ready."""
        self.training_data.append(features.copy())
        if len(self.training_data) > MAX_TRAINING_BUFFER:
            # Drop oldest to keep memory bounded and let model adapt to recent data
            self.training_data = self.training_data[-MAX_TRAINING_BUFFER:]
        self.samples_since_train += 1
        if not self.is_trained and len(self.training_data) >= self.MIN_SAMPLES:
            self.train()
        elif self.is_trained and self.samples_since_train >= self.RETRAIN_INTERVAL:
            self.train()

    def train(self):
        """Train the isolation forest on collected data."""
        if len(self.training_data) < self.MIN_SAMPLES:
            return
        X = np.array(self.training_data)
        self.scaler.fit(X)
        X_scaled = self.scaler.transform(X)
        self.model = IsolationForest(
            n_estimators=200, contamination=self.contamination,
            max_samples="auto", random_state=42, n_jobs=-1,
        )
        self.model.fit(X_scaled)
        self.is_trained = True
        self.samples_since_train = 0
        self.last_trained_at = time.time()
        self.train_count += 1
        logger.info(
            "[iforest][%s] trained #%d on %d samples (contamination=%.3f)",
            self.agent_label or "?", self.train_count, len(X), self.contamination,
        )

    def detect(self, features: np.ndarray) -> Dict:
        """Run isolation forest detection. Returns score 0.0-1.0."""
        result = {
            "score": 0.0, "is_anomaly": False,
            "layer": "isolation_forest", "active": self.is_active,
        }
        if not self.is_active:
            result["reason"] = f"Need {self.MIN_SAMPLES - len(self.training_data)} more samples"
            return result

        X = self.scaler.transform(features.reshape(1, -1))
        raw_score = self.model.score_samples(X)[0]
        prediction = self.model.predict(X)[0]
        result["score"] = float(np.clip(((-raw_score) - 0.5) / 0.5, 0.0, 1.0))
        result["is_anomaly"] = prediction == -1
        result["raw_score"] = float(raw_score)
        return result

    def serialize(self) -> bytes:
        """Serialize full state for Redis persistence."""
        return pickle.dumps({
            "model": self.model, "scaler": self.scaler,
            "is_trained": self.is_trained,
            "training_data": self.training_data,
            "samples_since_train": self.samples_since_train,
            "last_trained_at": self.last_trained_at,
            "train_count": self.train_count,
            "saved_at": time.time(),
            "version": 2,
        })

    def deserialize(self, data: bytes):
        """
        Restore state from Redis. Resets samples_since_train so the next
        retrain interval starts fresh from the restart point — prevents
        a saved counter from skipping the immediate post-restart retrain.
        Forces an immediate retrain if the saved model is stale.
        """
        obj = pickle.loads(data)
        self.model = obj.get("model")
        self.scaler = obj.get("scaler", self.scaler)
        self.is_trained = obj.get("is_trained", False)
        self.training_data = obj.get("training_data", [])
        # Reset counter so we don't accidentally skip retraining after restart
        self.samples_since_train = 0
        self.last_trained_at = obj.get("last_trained_at", 0.0)
        self.train_count = obj.get("train_count", 0)

        age = time.time() - (self.last_trained_at or 0)
        if self.is_trained and age > STALE_MODEL_AGE_SECONDS and len(self.training_data) >= self.MIN_SAMPLES:
            logger.info(
                "[iforest][%s] loaded model is stale (%.0fs old) — forcing retrain",
                self.agent_label or "?", age,
            )
            self.train()
        else:
            logger.info(
                "[iforest][%s] restored from redis (trained=%s buffer=%d age=%.0fs)",
                self.agent_label or "?", self.is_trained, len(self.training_data), age,
            )