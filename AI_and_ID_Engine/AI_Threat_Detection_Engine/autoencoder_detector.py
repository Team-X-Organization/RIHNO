"""
autoencoder_detector.py

Layer 3: Autoencoder Anomaly Detector (PyTorch)
  - Symmetric MLP autoencoder: input → 64 → latent → 64 → input
  - Trains to reconstruct normal metric patterns
  - High reconstruction error = anomaly
  - Activates after 200 samples per agent
  - Runs on CUDA if available, else CPU
"""

import io
import logging
import time
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import StandardScaler
from typing import Dict, List, Optional
import pickle

logger = logging.getLogger(__name__)

STALE_MODEL_AGE_SECONDS = 3600
MAX_TRAINING_BUFFER = 10000

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


class _AENet(nn.Module):
    """Symmetric MLP autoencoder."""

    def __init__(self, input_dim: int, latent_dim: int = 16, hidden_dim: int = 64):
        super().__init__()
        self.input_dim = input_dim
        self.latent_dim = latent_dim
        self.hidden_dim = hidden_dim
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(inplace=True),
            nn.Linear(hidden_dim, latent_dim),
            nn.ReLU(inplace=True),
        )
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, hidden_dim),
            nn.ReLU(inplace=True),
            nn.Linear(hidden_dim, input_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.decoder(self.encoder(x))


class AutoencoderDetector:
    """PyTorch autoencoder-based anomaly detection using reconstruction error."""

    MIN_SAMPLES = 200
    RETRAIN_INTERVAL = 500

    # Training hyperparameters
    HIDDEN_DIM = 64
    EPOCHS = 100
    BATCH_SIZE = 64
    LEARNING_RATE = 1e-3
    WEIGHT_DECAY = 1e-5
    VAL_FRACTION = 0.1
    EARLY_STOP_PATIENCE = 10

    def __init__(self, input_dim: int, latent_dim: int = 16, **kwargs):
        self.input_dim = input_dim
        self.latent_dim = latent_dim
        self.model: Optional[_AENet] = None
        self.scaler = StandardScaler()
        self.training_data: List[np.ndarray] = []
        self.threshold: float = 0.0
        self.is_trained = False
        self.samples_since_train = 0
        self.last_trained_at: float = 0.0
        self.train_count: int = 0
        self.agent_label: str = ""

    @property
    def is_active(self) -> bool:
        return self.is_trained

    def add_sample(self, features: np.ndarray):
        """Add sample to training buffer. Auto-trains when ready."""
        self.training_data.append(features.copy())
        if len(self.training_data) > MAX_TRAINING_BUFFER:
            self.training_data = self.training_data[-MAX_TRAINING_BUFFER:]
        self.samples_since_train += 1
        if not self.is_trained and len(self.training_data) >= self.MIN_SAMPLES:
            self.train()
        elif self.is_trained and self.samples_since_train >= self.RETRAIN_INTERVAL:
            self.train()

    def _build_model(self) -> _AENet:
        return _AENet(self.input_dim, self.latent_dim, self.HIDDEN_DIM).to(DEVICE)

    def train(self):
        """Train the PyTorch autoencoder on buffered samples."""
        if len(self.training_data) < self.MIN_SAMPLES:
            return

        torch.manual_seed(42)
        X = np.asarray(self.training_data, dtype=np.float32)
        self.scaler.fit(X)
        X_scaled = self.scaler.transform(X).astype(np.float32)

        # Train/val split
        n = X_scaled.shape[0]
        idx = np.random.RandomState(42).permutation(n)
        val_n = max(1, int(n * self.VAL_FRACTION))
        val_idx, train_idx = idx[:val_n], idx[val_n:]
        X_train = torch.from_numpy(X_scaled[train_idx]).to(DEVICE)
        X_val = torch.from_numpy(X_scaled[val_idx]).to(DEVICE)

        loader = DataLoader(
            TensorDataset(X_train, X_train),
            batch_size=self.BATCH_SIZE, shuffle=True, drop_last=False,
        )

        self.model = self._build_model()
        optimizer = torch.optim.Adam(
            self.model.parameters(),
            lr=self.LEARNING_RATE, weight_decay=self.WEIGHT_DECAY,
        )
        criterion = nn.MSELoss()

        best_val = float("inf")
        best_state = None
        patience = 0

        self.model.train()
        for epoch in range(self.EPOCHS):
            for xb, _ in loader:
                optimizer.zero_grad()
                recon = self.model(xb)
                loss = criterion(recon, xb)
                loss.backward()
                optimizer.step()

            # Validation
            self.model.eval()
            with torch.no_grad():
                val_recon = self.model(X_val)
                val_loss = float(criterion(val_recon, X_val).item())
            self.model.train()

            if val_loss < best_val - 1e-6:
                best_val = val_loss
                best_state = {k: v.detach().cpu().clone() for k, v in self.model.state_dict().items()}
                patience = 0
            else:
                patience += 1
                if patience >= self.EARLY_STOP_PATIENCE:
                    break

        if best_state is not None:
            self.model.load_state_dict(best_state)

        # Compute threshold at 95th percentile of training reconstruction errors
        self.model.eval()
        with torch.no_grad():
            X_full = torch.from_numpy(X_scaled).to(DEVICE)
            recon = self.model(X_full).cpu().numpy()
        errors = np.mean((recon - X_scaled) ** 2, axis=1)
        self.threshold = float(np.percentile(errors, 95.0))
        self.is_trained = True
        self.samples_since_train = 0
        self.last_trained_at = time.time()
        self.train_count += 1
        logger.info(
            "[autoencoder][%s] trained #%d on %d samples (threshold=%.6f, latent_dim=%d, val_loss=%.6f, device=%s)",
            self.agent_label or "?", self.train_count, len(X), self.threshold,
            self.latent_dim, best_val, DEVICE.type,
        )

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

        x_scaled = self.scaler.transform(features.reshape(1, -1)).astype(np.float32)
        self.model.eval()
        with torch.no_grad():
            x_t = torch.from_numpy(x_scaled).to(DEVICE)
            recon = self.model(x_t).cpu().numpy()
        per_feat_err = (recon - x_scaled).flatten() ** 2
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
        model_bytes: Optional[bytes] = None
        if self.model is not None:
            buf = io.BytesIO()
            torch.save(self.model.state_dict(), buf)
            model_bytes = buf.getvalue()

        return pickle.dumps({
            "model_state": model_bytes,
            "input_dim": self.input_dim,
            "latent_dim": self.latent_dim,
            "hidden_dim": self.HIDDEN_DIM,
            "scaler": self.scaler,
            "threshold": self.threshold,
            "is_trained": self.is_trained,
            "training_data": self.training_data,
            "samples_since_train": self.samples_since_train,
            "last_trained_at": self.last_trained_at,
            "train_count": self.train_count,
            "saved_at": time.time(),
            "version": 3,  # bumped: pytorch backend
        })

    def deserialize(self, data: bytes):
        """Restore state from Redis. Forces retrain if stale or schema mismatch."""
        obj = pickle.loads(data)
        version = obj.get("version", 1)

        self.scaler = obj.get("scaler", self.scaler)
        self.threshold = obj.get("threshold", 0.0)
        self.is_trained = obj.get("is_trained", False)
        self.training_data = obj.get("training_data", [])
        self.samples_since_train = 0
        self.last_trained_at = obj.get("last_trained_at", 0.0)
        self.train_count = obj.get("train_count", 0)

        # Old sklearn-backed snapshots (version < 3): drop model, force retrain
        if version < 3:
            logger.info(
                "[autoencoder][%s] legacy snapshot (v%d) — discarding model, will retrain",
                self.agent_label or "?", version,
            )
            self.model = None
            self.is_trained = False
            if len(self.training_data) >= self.MIN_SAMPLES:
                self.train()
            return

        model_bytes = obj.get("model_state")
        saved_input_dim = obj.get("input_dim", self.input_dim)
        saved_latent_dim = obj.get("latent_dim", self.latent_dim)
        saved_hidden_dim = obj.get("hidden_dim", self.HIDDEN_DIM)

        # Schema mismatch → discard and retrain
        if (saved_input_dim != self.input_dim
                or saved_latent_dim != self.latent_dim
                or saved_hidden_dim != self.HIDDEN_DIM):
            logger.info(
                "[autoencoder][%s] arch mismatch (saved %d/%d/%d vs %d/%d/%d) — retraining",
                self.agent_label or "?",
                saved_input_dim, saved_latent_dim, saved_hidden_dim,
                self.input_dim, self.latent_dim, self.HIDDEN_DIM,
            )
            self.model = None
            self.is_trained = False
            if len(self.training_data) >= self.MIN_SAMPLES:
                self.train()
            return

        if model_bytes and self.is_trained:
            try:
                self.model = self._build_model()
                buf = io.BytesIO(model_bytes)
                state = torch.load(buf, map_location=DEVICE, weights_only=True)
                self.model.load_state_dict(state)
                self.model.eval()
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "[autoencoder][%s] failed to restore model weights (%s) — will retrain",
                    self.agent_label or "?", e,
                )
                self.model = None
                self.is_trained = False
        else:
            self.model = None
            # Inconsistent flag: marked trained but no weights — clear it
            if self.is_trained:
                logger.warning(
                    "[autoencoder][%s] is_trained=True but no model bytes — clearing flag",
                    self.agent_label or "?",
                )
                self.is_trained = False

        age = time.time() - (self.last_trained_at or 0)
        if self.is_trained and age > STALE_MODEL_AGE_SECONDS and len(self.training_data) >= self.MIN_SAMPLES:
            logger.info(
                "[autoencoder][%s] loaded model is stale (%.0fs old) — forcing retrain",
                self.agent_label or "?", age,
            )
            self.train()
        else:
            logger.info(
                "[autoencoder][%s] restored from redis (trained=%s buffer=%d age=%.0fs device=%s)",
                self.agent_label or "?", self.is_trained, len(self.training_data), age, DEVICE.type,
            )
