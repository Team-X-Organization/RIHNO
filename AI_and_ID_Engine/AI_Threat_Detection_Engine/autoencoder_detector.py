"""
autoencoder_detector.py

Layer 3: Autoencoder Anomaly Detector (sklearn MLPRegressor)
  - Learns to reconstruct normal metric patterns
  - High reconstruction error = anomaly
  - Activates after 200 samples per agent
  - No GPU or PyTorch dependency required
"""

import numpy as np
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from typing import Dict, List, Optional
import pickle


class AutoencoderDetector:
    """Autoencoder-based anomaly detection using reconstruction error."""

    MIN_SAMPLES = 200
    RETRAIN_INTERVAL = 500

    def __init__(self, input_dim: int, latent_dim: int = 16, **kwargs):
        self.input_dim = input_dim
        self.latent_dim = latent_dim
        self.model: Optional[MLPRegressor] = None
        self.scaler = StandardScaler()
        self.training_data: List[np.ndarray] = []
        self.threshold: float = 0.0
        self.is_trained = False
        self.samples_since_train = 0

    @property
    def is_active(self) -> bool:
        return self.is_trained

    def add_sample(self, features: np.ndarray):
        """Add sample to training buffer. Auto-trains when ready."""
        self.training_data.append(features.copy())
        self.samples_since_train += 1
        if not self.is_trained and len(self.training_data) >= self.MIN_SAMPLES:
            self.train()
        elif self.is_trained and self.samples_since_train >= self.RETRAIN_INTERVAL:
            self.train()

    def train(self):
        """Train the autoencoder to reconstruct normal data."""
        if len(self.training_data) < self.MIN_SAMPLES:
            return

        X = np.array(self.training_data)
        self.scaler.fit(X)
        X_scaled = self.scaler.transform(X)

        # MLPRegressor as autoencoder: input → 64 → bottleneck → 64 → input
        self.model = MLPRegressor(
            hidden_layer_sizes=(64, self.latent_dim, 64),
            activation="relu", solver="adam", max_iter=200,
            learning_rate_init=0.001, early_stopping=True,
            validation_fraction=0.1, random_state=42, verbose=False,
        )
        self.model.fit(X_scaled, X_scaled)

        # Compute threshold at 95th percentile of training errors
        predictions = self.model.predict(X_scaled)
        errors = np.mean((predictions - X_scaled) ** 2, axis=1)
        self.threshold = float(np.percentile(errors, 95.0))
        self.is_trained = True
        self.samples_since_train = 0

    def detect(self, features: np.ndarray) -> Dict:
        """Run autoencoder detection. Returns score 0.0-1.0."""
        result = {
            "score": 0.0, "reconstruction_error": 0.0,
            "threshold": self.threshold, "layer": "autoencoder",
            "active": self.is_active,
        }
        if not self.is_active:
            result["reason"] = f"Need {self.MIN_SAMPLES - len(self.training_data)} more samples"
            return result

        x_scaled = self.scaler.transform(features.reshape(1, -1))
        prediction = self.model.predict(x_scaled)
        per_feat_err = (prediction - x_scaled).flatten() ** 2
        mse = float(np.mean(per_feat_err))

        if self.threshold > 0:
            score = np.clip((mse / self.threshold - 1.0) / 2.0, 0.0, 1.0)
        else:
            score = 0.0

        result["score"] = float(score)
        result["reconstruction_error"] = mse
        return result

    def serialize(self) -> bytes:
        """Serialize full state for Redis persistence."""
        return pickle.dumps({
            "model": self.model, "scaler": self.scaler,
            "threshold": self.threshold, "is_trained": self.is_trained,
            "training_data": self.training_data,
            "samples_since_train": self.samples_since_train,
        })

    def deserialize(self, data: bytes):
        """Restore state from Redis."""
        obj = pickle.loads(data)
        self.model = obj["model"]
        self.scaler = obj["scaler"]
        self.threshold = obj["threshold"]
        self.is_trained = obj["is_trained"]
        self.training_data = obj["training_data"]
        self.samples_since_train = obj["samples_since_train"]