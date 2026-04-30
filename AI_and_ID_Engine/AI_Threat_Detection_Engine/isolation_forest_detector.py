"""
isolation_forest_detector.py

Layer 2: Isolation Forest Anomaly Detector
  - Unsupervised tree-based outlier detection
  - Activates after 50 samples per agent
  - Retrains every 100 new samples
"""

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from typing import Dict, List, Optional
import pickle


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

    @property
    def is_active(self) -> bool:
        return self.is_trained

    def add_sample(self, features: np.ndarray):
        """Add a sample to training buffer. Auto-trains when ready."""
        self.training_data.append(features.copy())
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
        })

    def deserialize(self, data: bytes):
        """Restore state from Redis."""
        obj = pickle.loads(data)
        self.model = obj["model"]
        self.scaler = obj["scaler"]
        self.is_trained = obj["is_trained"]
        self.training_data = obj["training_data"]
        self.samples_since_train = obj["samples_since_train"]