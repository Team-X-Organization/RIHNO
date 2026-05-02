"""
hybrid_detector.py

Hybrid AE + GAN + RL Anomaly Detector (PyTorch)

Architecture:
  - Autoencoder: learns to reconstruct normal traffic; high error = anomaly
  - GAN Discriminator: adversarially sharpens AE latent representations
  - RL Agent (DQN): dynamically adapts detection threshold at runtime

Activates after MIN_SAMPLES=200. Retrains every RETRAIN_INTERVAL=50 samples.
All weights saved via torch.save() to Redis.
"""

import io
import logging
import random
import time
from collections import deque
from typing import Dict, List, Optional, Tuple

import numpy as np
import pickle
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
MAX_TRAINING_BUFFER = 10_000
STALE_MODEL_AGE_SECONDS = 3600


# ── Neural Network Modules ─────────────────────────────────────────────────────

class _Encoder(nn.Module):
    def __init__(self, input_dim: int, latent_dim: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.2),
            nn.Linear(128, 64),
            nn.BatchNorm1d(64),
            nn.ReLU(inplace=True),
            nn.Linear(64, latent_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class _Decoder(nn.Module):
    def __init__(self, latent_dim: int, output_dim: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(latent_dim, 64),
            nn.BatchNorm1d(64),
            nn.ReLU(inplace=True),
            nn.Dropout(0.2),
            nn.Linear(64, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(inplace=True),
            nn.Linear(128, output_dim),
        )

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        return self.net(z)


class _Autoencoder(nn.Module):
    def __init__(self, input_dim: int, latent_dim: int):
        super().__init__()
        self.input_dim = input_dim
        self.latent_dim = latent_dim
        self.encoder = _Encoder(input_dim, latent_dim)
        self.decoder = _Decoder(latent_dim, input_dim)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        z = self.encoder(x)
        return self.decoder(z), z


class _Discriminator(nn.Module):
    """Tells real samples from AE reconstructions — GAN training signal."""
    def __init__(self, input_dim: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Dropout(0.3),
            nn.Linear(64, 32),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Linear(32, 16),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Linear(16, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class _QNetwork(nn.Module):
    """Lightweight Q-network for RL threshold adaptation."""
    def __init__(self, state_dim: int = 4, n_actions: int = 3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, 16),
            nn.ReLU(inplace=True),
            nn.Linear(16, 8),
            nn.ReLU(inplace=True),
            nn.Linear(8, n_actions),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class _ReplayBuffer:
    def __init__(self, capacity: int = 1000):
        self.buffer: deque = deque(maxlen=capacity)

    def push(self, state, action, reward, next_state):
        self.buffer.append((state, action, reward, next_state))

    def sample(self, batch_size: int):
        batch = random.sample(self.buffer, min(batch_size, len(self.buffer)))
        s, a, r, ns = zip(*batch)
        return (
            torch.FloatTensor(np.array(s)),
            torch.LongTensor(a),
            torch.FloatTensor(r),
            torch.FloatTensor(np.array(ns)),
        )

    def __len__(self) -> int:
        return len(self.buffer)


# ── Hybrid Detector ────────────────────────────────────────────────────────────

class HybridDetector:
    """
    Hybrid Autoencoder + GAN + RL anomaly detector.

    AE reconstructs normal patterns; high reconstruction error signals anomaly.
    GAN discriminator adversarially sharpens the AE's latent representation.
    RL DQN agent adapts the detection threshold based on runtime behavior.

    Activates at >=200 samples. Retrains every 50 new samples.
    """

    MIN_SAMPLES = 200
    RETRAIN_INTERVAL = 50

    LATENT_DIM = 32
    EPOCHS = 80
    BATCH_SIZE = 64
    AE_LR = 1e-3
    DISC_LR = 5e-4
    WEIGHT_DECAY = 1e-5
    VAL_FRACTION = 0.1
    EARLY_STOP_PATIENCE = 10
    GAN_LAMBDA = 0.1

    RL_LR = 1e-3
    RL_GAMMA = 0.95
    RL_EPSILON_START = 0.5
    RL_EPSILON_END = 0.05
    RL_EPSILON_DECAY = 0.995
    RL_BATCH_SIZE = 32
    RL_REPLAY_CAPACITY = 1000
    RL_UPDATE_FREQ = 10

    def __init__(self, input_dim: int, **kwargs):
        self.input_dim = input_dim
        self.ae: Optional[_Autoencoder] = None
        self.disc: Optional[_Discriminator] = None
        self.q_net: Optional[_QNetwork] = None
        self._q_optimizer: Optional[torch.optim.Adam] = None
        self.scaler = StandardScaler()

        self.training_data: List[np.ndarray] = []
        self.threshold: float = 0.0
        self.is_trained = False
        self.samples_since_train = 0
        self.last_trained_at: float = 0.0
        self.train_count: int = 0
        self.agent_label: str = ""

        self.rl_epsilon: float = self.RL_EPSILON_START
        self.rl_replay = _ReplayBuffer(self.RL_REPLAY_CAPACITY)
        self.rl_inference_count: int = 0
        self._rl_last_state: Optional[np.ndarray] = None
        self._rl_last_action: Optional[int] = None
        self._threshold_multiplier: float = 1.0

        self._error_history: deque = deque(maxlen=50)
        self._alert_history: deque = deque(maxlen=100)

    @property
    def is_active(self) -> bool:
        return self.is_trained

    def add_sample(self, features: np.ndarray):
        self.training_data.append(features.copy())
        if len(self.training_data) > MAX_TRAINING_BUFFER:
            self.training_data = self.training_data[-MAX_TRAINING_BUFFER:]
        self.samples_since_train += 1
        if not self.is_trained and len(self.training_data) >= self.MIN_SAMPLES:
            self.train()
        elif self.is_trained and self.samples_since_train >= self.RETRAIN_INTERVAL:
            self.train()

    def _build_models(self) -> Tuple[_Autoencoder, _Discriminator, _QNetwork]:
        ae = _Autoencoder(self.input_dim, self.LATENT_DIM).to(DEVICE)
        disc = _Discriminator(self.input_dim).to(DEVICE)
        q_net = _QNetwork(state_dim=4, n_actions=3).to(DEVICE)
        return ae, disc, q_net

    def train(self):
        """Joint AE+GAN training with RL Q-network initialization."""
        if len(self.training_data) < self.MIN_SAMPLES:
            return

        torch.manual_seed(42)
        X = np.asarray(self.training_data, dtype=np.float32)
        self.scaler.fit(X)
        X_scaled = self.scaler.transform(X).astype(np.float32)

        n = X_scaled.shape[0]
        rng = np.random.RandomState(42)
        idx = rng.permutation(n)
        val_n = max(1, int(n * self.VAL_FRACTION))
        train_idx, val_idx = idx[val_n:], idx[:val_n]
        X_train = torch.from_numpy(X_scaled[train_idx]).to(DEVICE)
        X_val = torch.from_numpy(X_scaled[val_idx]).to(DEVICE)

        ae, disc, q_net = self._build_models()
        ae_opt = torch.optim.Adam(ae.parameters(), lr=self.AE_LR, weight_decay=self.WEIGHT_DECAY)
        disc_opt = torch.optim.Adam(disc.parameters(), lr=self.DISC_LR, weight_decay=self.WEIGHT_DECAY)
        mse_fn = nn.MSELoss()
        bce_fn = nn.BCELoss()

        n_train = X_train.shape[0]
        best_val = float("inf")
        best_ae_state = best_disc_state = None
        patience = 0

        for _ in range(self.EPOCHS):
            ae.train(); disc.train()
            perm = torch.randperm(n_train, device=DEVICE)

            for i in range(0, n_train, self.BATCH_SIZE):
                batch = X_train[perm[i:i + self.BATCH_SIZE]]
                if batch.shape[0] < 2:
                    continue

                real_lbl = torch.ones(batch.shape[0], 1, device=DEVICE)
                fake_lbl = torch.zeros(batch.shape[0], 1, device=DEVICE)

                # Discriminator step
                disc_opt.zero_grad()
                with torch.no_grad():
                    recon_d, _ = ae(batch)
                d_loss = bce_fn(disc(batch), real_lbl) + bce_fn(disc(recon_d.detach()), fake_lbl)
                d_loss.backward()
                disc_opt.step()

                # AE step: reconstruction + adversarial (fool discriminator)
                ae_opt.zero_grad()
                recon_a, _ = ae(batch)
                ae_loss = mse_fn(recon_a, batch) + self.GAN_LAMBDA * bce_fn(disc(recon_a), real_lbl)
                ae_loss.backward()
                ae_opt.step()

            ae.eval(); disc.eval()
            with torch.no_grad():
                val_recon, _ = ae(X_val)
                val_loss = float(mse_fn(val_recon, X_val).item())

            if val_loss < best_val - 1e-6:
                best_val = val_loss
                best_ae_state = {k: v.detach().cpu().clone() for k, v in ae.state_dict().items()}
                best_disc_state = {k: v.detach().cpu().clone() for k, v in disc.state_dict().items()}
                patience = 0
            else:
                patience += 1
                if patience >= self.EARLY_STOP_PATIENCE:
                    break

        if best_ae_state:
            ae.load_state_dict(best_ae_state)
        if best_disc_state:
            disc.load_state_dict(best_disc_state)
        ae.eval(); disc.eval()

        # 95th-percentile threshold on full training set
        with torch.no_grad():
            X_full = torch.from_numpy(X_scaled).to(DEVICE)
            recon_full, _ = ae(X_full)
            errors = torch.mean((recon_full - X_full) ** 2, dim=1).cpu().numpy()

        self.threshold = float(np.percentile(errors, 95.0))
        self._threshold_multiplier = 1.0
        self.ae = ae
        self.disc = disc
        self.q_net = q_net
        self._q_optimizer = None  # reset so it's recreated on next update
        self.is_trained = True
        self.samples_since_train = 0
        self.last_trained_at = time.time()
        self.train_count += 1

        logger.info(
            "[hybrid][%s] trained #%d on %d samples "
            "(threshold=%.6f latent=%d val_loss=%.6f device=%s)",
            self.agent_label or "?", self.train_count, len(X),
            self.threshold, self.LATENT_DIM, best_val, DEVICE.type,
        )

    # ── RL helpers ─────────────────────────────────────────────────────────────

    def _rl_state(self, norm_error: float) -> np.ndarray:
        errors = list(self._error_history)
        moving_avg = float(np.mean(errors)) if errors else norm_error
        moving_std = float(np.std(errors)) if len(errors) > 1 else 0.0
        alert_rate = float(np.mean(self._alert_history)) if self._alert_history else 0.0
        return np.array([norm_error, moving_avg, moving_std, alert_rate], dtype=np.float32)

    def _rl_action(self, state: np.ndarray) -> int:
        if self.q_net is None or np.random.random() < self.rl_epsilon:
            return np.random.randint(3)
        with torch.no_grad():
            q = self.q_net(torch.FloatTensor(state).unsqueeze(0).to(DEVICE))
        return int(q.argmax().item())

    def _rl_apply_action(self, action: int):
        if action == 0:
            self._threshold_multiplier = max(0.5, self._threshold_multiplier * 0.95)
        elif action == 2:
            self._threshold_multiplier = min(3.0, self._threshold_multiplier * 1.05)

    def _rl_reward(self, norm_error: float) -> float:
        alert_rate = float(np.mean(self._alert_history)) if self._alert_history else 0.0
        if alert_rate > 0.4:
            return -1.0
        if norm_error > 3.0:
            return 2.0
        if alert_rate < 0.05 and norm_error < 1.5:
            return 1.0
        return 0.0

    def _rl_update(self):
        if len(self.rl_replay) < self.RL_BATCH_SIZE or self.q_net is None:
            return
        states, actions, rewards, next_states = self.rl_replay.sample(self.RL_BATCH_SIZE)
        states = states.to(DEVICE)
        actions = actions.to(DEVICE)
        rewards = rewards.to(DEVICE)
        next_states = next_states.to(DEVICE)

        if self._q_optimizer is None:
            self._q_optimizer = torch.optim.Adam(self.q_net.parameters(), lr=self.RL_LR)

        self.q_net.train()
        q_vals = self.q_net(states).gather(1, actions.unsqueeze(1)).squeeze()
        with torch.no_grad():
            target = rewards + self.RL_GAMMA * self.q_net(next_states).max(1)[0]
        loss = F.mse_loss(q_vals, target)
        self._q_optimizer.zero_grad()
        loss.backward()
        self._q_optimizer.step()
        self.q_net.eval()

    # ── Inference ──────────────────────────────────────────────────────────────

    def detect(self, features: np.ndarray) -> Dict:
        result = {
            "score": 0.0,
            "reconstruction_error": 0.0,
            "discriminator_score": 0.0,
            "threshold": self.threshold,
            "threshold_multiplier": round(self._threshold_multiplier, 4),
            "rl_epsilon": round(self.rl_epsilon, 4),
            "layer": "hybrid",
            "active": self.is_active,
        }
        if not self.is_active:
            result["reason"] = f"Need {self.MIN_SAMPLES - len(self.training_data)} more samples"
            return result

        x_scaled = self.scaler.transform(features.reshape(1, -1)).astype(np.float32)
        x_t = torch.from_numpy(x_scaled).to(DEVICE)

        self.ae.eval(); self.disc.eval()
        with torch.no_grad():
            recon, _ = self.ae(x_t)
            disc_score = float(self.disc(x_t).item())
            mse_err = float(torch.mean((recon - x_t) ** 2).item())

        adj_threshold = max(self.threshold * self._threshold_multiplier, 1e-9)
        norm_error = mse_err / adj_threshold

        state = self._rl_state(norm_error)
        action = self._rl_action(state)
        self._rl_apply_action(action)

        ae_score = float(np.clip((norm_error - 1.0) / 2.0, 0.0, 1.0))
        # disc near 0 on real input = discriminator confused = anomaly signal
        disc_anomaly = max(0.0, 1.0 - disc_score)
        blended = float(np.clip(0.8 * ae_score + 0.2 * disc_anomaly, 0.0, 1.0))

        self._error_history.append(norm_error)
        self._alert_history.append(1.0 if blended > 0.35 else 0.0)

        reward = self._rl_reward(norm_error)
        next_state = self._rl_state(norm_error)
        if self._rl_last_state is not None:
            self.rl_replay.push(self._rl_last_state, self._rl_last_action, reward, state)
        self._rl_last_state = state
        self._rl_last_action = action

        self.rl_epsilon = max(self.RL_EPSILON_END, self.rl_epsilon * self.RL_EPSILON_DECAY)
        self.rl_inference_count += 1
        if self.rl_inference_count % self.RL_UPDATE_FREQ == 0:
            self._rl_update()

        result["score"] = blended
        result["reconstruction_error"] = mse_err
        result["discriminator_score"] = disc_score
        return result

    # ── Persistence ────────────────────────────────────────────────────────────

    def serialize(self) -> bytes:
        ae_bytes = disc_bytes = q_bytes = None
        if self.ae is not None:
            buf = io.BytesIO()
            torch.save(self.ae.state_dict(), buf)
            ae_bytes = buf.getvalue()
        if self.disc is not None:
            buf = io.BytesIO()
            torch.save(self.disc.state_dict(), buf)
            disc_bytes = buf.getvalue()
        if self.q_net is not None:
            buf = io.BytesIO()
            torch.save(self.q_net.state_dict(), buf)
            q_bytes = buf.getvalue()

        return pickle.dumps({
            "ae_state": ae_bytes,
            "disc_state": disc_bytes,
            "q_state": q_bytes,
            "input_dim": self.input_dim,
            "latent_dim": self.LATENT_DIM,
            "scaler": self.scaler,
            "threshold": self.threshold,
            "threshold_multiplier": self._threshold_multiplier,
            "is_trained": self.is_trained,
            "training_data": self.training_data,
            "samples_since_train": self.samples_since_train,
            "last_trained_at": self.last_trained_at,
            "train_count": self.train_count,
            "rl_epsilon": self.rl_epsilon,
            "saved_at": time.time(),
            "version": 1,
        })

    def deserialize(self, data: bytes):
        obj = pickle.loads(data)

        self.scaler = obj.get("scaler", self.scaler)
        self.threshold = obj.get("threshold", 0.0)
        self._threshold_multiplier = obj.get("threshold_multiplier", 1.0)
        self.is_trained = obj.get("is_trained", False)
        self.training_data = obj.get("training_data", [])
        self.samples_since_train = 0
        self.last_trained_at = obj.get("last_trained_at", 0.0)
        self.train_count = obj.get("train_count", 0)
        self.rl_epsilon = obj.get("rl_epsilon", self.RL_EPSILON_START)

        saved_input = obj.get("input_dim", self.input_dim)
        saved_latent = obj.get("latent_dim", self.LATENT_DIM)
        if saved_input != self.input_dim or saved_latent != self.LATENT_DIM:
            logger.info(
                "[hybrid][%s] arch mismatch (saved %d/%d vs %d/%d) — retraining",
                self.agent_label or "?",
                saved_input, saved_latent, self.input_dim, self.LATENT_DIM,
            )
            self.ae = self.disc = self.q_net = None
            self.is_trained = False
            if len(self.training_data) >= self.MIN_SAMPLES:
                self.train()
            return

        ae, disc, q_net = self._build_models()
        try:
            ae_bytes = obj.get("ae_state")
            disc_bytes = obj.get("disc_state")
            q_bytes = obj.get("q_state")

            if ae_bytes and self.is_trained:
                ae.load_state_dict(torch.load(io.BytesIO(ae_bytes), map_location=DEVICE, weights_only=True))
                ae.eval()
                self.ae = ae

            if disc_bytes and self.is_trained:
                disc.load_state_dict(torch.load(io.BytesIO(disc_bytes), map_location=DEVICE, weights_only=True))
                disc.eval()
                self.disc = disc

            if q_bytes:
                q_net.load_state_dict(torch.load(io.BytesIO(q_bytes), map_location=DEVICE, weights_only=True))
                q_net.eval()
                self.q_net = q_net

        except Exception as e:
            logger.warning(
                "[hybrid][%s] failed to restore weights (%s) — will retrain",
                self.agent_label or "?", e,
            )
            self.ae = self.disc = self.q_net = None
            self.is_trained = False

        if not self.is_trained and len(self.training_data) >= self.MIN_SAMPLES:
            self.train()
            return

        age = time.time() - (self.last_trained_at or 0)
        if self.is_trained and age > STALE_MODEL_AGE_SECONDS and len(self.training_data) >= self.MIN_SAMPLES:
            logger.info(
                "[hybrid][%s] stale model (%.0fs) — forcing retrain",
                self.agent_label or "?", age,
            )
            self.train()
        else:
            logger.info(
                "[hybrid][%s] restored (trained=%s buffer=%d age=%.0fs device=%s epsilon=%.3f)",
                self.agent_label or "?", self.is_trained, len(self.training_data),
                age, DEVICE.type, self.rl_epsilon,
            )
