"""
api_server.py

FastAPI Server for IDS Zero-Day Detection

Run:
    uvicorn api_server:app --host 0.0.0.0 --port 4050

Env vars:
    REDIS_HOST  (default: my_rihno_redis)
    REDIS_PORT  (default: 6379)
    REDIS_DB    (default: 0)
    REDIS_PASS  (default: empty)
"""

import logging
import os
import threading
from typing import Dict, List, Any, Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)

from redis_store import RedisStore, MODEL_SAVE_INTERVAL
from main import IDSEngine
from auto_detector import AutoDetector


# ── Config ───────────────────────────────────────────────────────────────────

REDIS_HOST = os.environ.get("REDIS_HOST", "my_rihno_redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
REDIS_DB = int(os.environ.get("REDIS_DB", "0"))
REDIS_PASS = os.environ.get("REDIS_PASS", None)


# ── Initialize ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="IDS Zero-Day Detection API",
    description="Progressive unsupervised anomaly detection with per-agent isolation.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

store = RedisStore(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, password=REDIS_PASS)
engine = IDSEngine(store)
engine_lock = threading.Lock()

AUTO_DETECT_INTERVAL = float(os.environ.get("AUTO_DETECT_INTERVAL", "5.0"))
auto_detector = AutoDetector(engine, store, engine_lock, poll_interval=AUTO_DETECT_INTERVAL)


@app.on_event("startup")
def _startup_auto_detector():
    auto_detector.start()


@app.on_event("shutdown")
def _shutdown_auto_detector():
    auto_detector.stop()


# ── Models ───────────────────────────────────────────────────────────────────

class MetricInput(BaseModel):
    timestamp: str
    email: str
    agent_name: str
    agent_type: str
    metrics: Dict[str, Any]
    network_map: Optional[Dict[str, Any]] = None


class DetectionResult(BaseModel):
    timestamp: str
    email: str
    agent_name: str
    final_score: float
    threat_level: str
    layer_contributions: Dict
    critical_alerts: List
    network_alerts: List
    network_patterns: List
    anomalous_features: List
    system_status: Dict


# ── Ingest ───────────────────────────────────────────────────────────────────

@app.post("/ingest", response_model=DetectionResult)
async def ingest_metric(metric: MetricInput):
    """Ingest a metric and return threat assessment."""
    with engine_lock:
        result = engine.process(metric.model_dump())
    return result


@app.post("/ingest/batch")
async def ingest_batch(metrics: List[MetricInput]):
    """Ingest multiple metrics. Each routes to its agent's pipeline."""
    results = []
    with engine_lock:
        for m in metrics:
            results.append(engine.process(m.dict()))
    return results


@app.post("/detect/{email}/{agent_name}")
async def detect_from_stream(email: str, agent_name: str):
    """
    Read the latest metric from Redis (written by Go dealer)
    and run detection. Use this when the dealer already pushed
    data to Redis and you just want the AI prediction.
    """
    with engine_lock:
        result = engine.process_from_stream(email, agent_name)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


# ── Agents ───────────────────────────────────────────────────────────────────

@app.get("/agents")
async def list_agents():
    agents = store.get_all_agents()
    agent_list = []
    for agent_id in agents:
        parts = agent_id.split(":", 1)
        if len(parts) == 2:
            agent_list.append({
                "agent_id": agent_id,
                "email": parts[0],
                "agent_name": parts[1],
                "stream_length": store.get_stream_length(parts[0], parts[1]),
            })
    return {"agents": agent_list, "count": len(agent_list)}


@app.get("/agents/{email}/{agent_name}/status")
async def agent_status(email: str, agent_name: str):
    if not store.agent_exists(email, agent_name):
        raise HTTPException(status_code=404, detail="Agent not found")
    with engine_lock:
        return engine.get_agent_status(email, agent_name)


@app.get("/agents/{email}/{agent_name}/alerts")
async def agent_alerts(email: str, agent_name: str, count: int = Query(default=50, le=500)):
    if not store.agent_exists(email, agent_name):
        raise HTTPException(status_code=404, detail="Agent not found")
    alerts = store.get_recent_alerts(email, agent_name, count=count)
    return {"agent": f"{email}:{agent_name}", "alerts": alerts, "count": len(alerts)}


@app.get("/agents/{email}/{agent_name}/history")
async def agent_history(email: str, agent_name: str, count: int = Query(default=100, le=1000)):
    if not store.agent_exists(email, agent_name):
        raise HTTPException(status_code=404, detail="Agent not found")
    metrics = store.get_metric_history(email, agent_name, count=count)
    return {
        "agent": f"{email}:{agent_name}",
        "metrics": metrics,
        "count": len(metrics),
        "stream_length": store.get_stream_length(email, agent_name),
    }


@app.get("/agents/{email}/{agent_name}/latest")
async def agent_latest(email: str, agent_name: str):
    if not store.agent_exists(email, agent_name):
        raise HTTPException(status_code=404, detail="Agent not found")
    metric = store.get_latest_metric(email, agent_name)
    if not metric:
        raise HTTPException(status_code=404, detail="No metrics found")
    return metric


@app.delete("/agents/{email}/{agent_name}")
async def delete_agent(email: str, agent_name: str):
    if not store.agent_exists(email, agent_name):
        raise HTTPException(status_code=404, detail="Agent not found")
    store.delete_agent(email, agent_name)
    key = f"{email}:{agent_name}"
    with engine_lock:
        engine._pipelines.pop(key, None)
    return {"status": "deleted", "agent": f"{email}:{agent_name}"}


@app.put("/agents/{email}/{agent_name}/config")
async def update_agent_config(email: str, agent_name: str, config: dict):
    if not store.agent_exists(email, agent_name):
        raise HTTPException(status_code=404, detail="Agent not found")
    store.set_agent_config(email, agent_name, config)
    return {"status": "updated", "config": config}


# ── Alerts ───────────────────────────────────────────────────────────────────

@app.get("/alerts")
async def all_alerts(count: int = Query(default=100, le=500)):
    alerts = store.get_all_alerts(count=count)
    return {"alerts": alerts, "count": len(alerts)}


# ── System ───────────────────────────────────────────────────────────────────

@app.get("/status")
async def system_status():
    with engine_lock:
        return engine.get_global_status()


@app.get("/health")
async def health():
    redis_ok = store.health_check()
    return {
        "status": "healthy" if redis_ok else "degraded",
        "redis": "connected" if redis_ok else "disconnected",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/save")
async def save_models():
    with engine_lock:
        engine.save_all()
    return {"status": "saved", "pipelines": len(engine._pipelines)}


@app.get("/models/status")
async def models_status():
    """
    Per-agent model freshness report. Use this to verify that detectors
    are actually retraining over time and that Redis persistence is working.

    Returned per pipeline:
      sample_count, last_saved_at, iforest {trained, train_count, last_trained_at, age_seconds, buffer_size},
      autoencoder {trained, train_count, last_trained_at, age_seconds, buffer_size, threshold},
      statistical {samples}
    """
    now = datetime.utcnow().timestamp()
    rows = []
    with engine_lock:
        for key, pipeline in engine._pipelines.items():
            ifd = pipeline.iforest
            ae = pipeline.autoencoder
            rows.append({
                "agent_key": key,
                "sample_count": pipeline.sample_count,
                "last_saved_at": pipeline.last_saved_at,
                "last_saved_age_seconds": (now - pipeline.last_saved_at) if pipeline.last_saved_at else None,
                "iforest": {
                    "trained": ifd.is_trained,
                    "train_count": ifd.train_count,
                    "last_trained_at": ifd.last_trained_at,
                    "age_seconds": (now - ifd.last_trained_at) if ifd.last_trained_at else None,
                    "buffer_size": len(ifd.training_data),
                    "samples_since_train": ifd.samples_since_train,
                    "min_samples": ifd.MIN_SAMPLES,
                    "retrain_interval": ifd.RETRAIN_INTERVAL,
                },
                "autoencoder": {
                    "trained": ae.is_trained,
                    "train_count": ae.train_count,
                    "last_trained_at": ae.last_trained_at,
                    "age_seconds": (now - ae.last_trained_at) if ae.last_trained_at else None,
                    "buffer_size": len(ae.training_data),
                    "samples_since_train": ae.samples_since_train,
                    "threshold": ae.threshold,
                    "min_samples": ae.MIN_SAMPLES,
                    "retrain_interval": ae.RETRAIN_INTERVAL,
                },
                "statistical": {
                    "samples": pipeline.statistical.normalizer.n,
                },
            })
    return {
        "now": now,
        "active_pipelines": len(rows),
        "save_interval": MODEL_SAVE_INTERVAL,
        "pipelines": rows,
    }


@app.post("/models/retrain/{email}/{agent_name}")
async def force_retrain(email: str, agent_name: str):
    """Force an immediate retrain of an agent's iforest + autoencoder."""
    if not store.agent_exists(email, agent_name):
        raise HTTPException(status_code=404, detail="Agent not found")
    with engine_lock:
        pipeline = engine._get_pipeline(email, agent_name)
        ifd, ae = pipeline.iforest, pipeline.autoencoder
        if len(ifd.training_data) >= ifd.MIN_SAMPLES:
            ifd.train()
        if len(ae.training_data) >= ae.MIN_SAMPLES:
            ae.train()
        pipeline.save_to_redis(store)
    return {
        "status": "retrained",
        "iforest_trained": ifd.is_trained,
        "iforest_train_count": ifd.train_count,
        "autoencoder_trained": ae.is_trained,
        "autoencoder_train_count": ae.train_count,
    }


# ── Auto-detector ────────────────────────────────────────────────────────────

@app.get("/auto_detector/status")
async def auto_detector_status():
    return auto_detector.status()


# ── Threat Summary (per-user aggregation for frontend) ───────────────────────

@app.get("/threat_summary")
async def threat_summary(email: str = Query(..., description="Owner email")):
    """
    Aggregate per-agent threat data for a single user. Read-only.
    Returns last assessment (level, score, layers), recent alerts, pipeline status.
    """
    safe_owner = email.replace(":", "_")
    all_agents = store.get_all_agents()
    agents_out = []

    for agent_id in all_agents:
        if ":" not in agent_id:
            continue
        owner, agent_name = agent_id.split(":", 1)
        if owner != safe_owner:
            continue

        latest_metric = store.get_latest_metric(owner, agent_name)
        recent_alerts = store.get_recent_alerts(owner, agent_name, count=10)
        last_assessment = store.get_last_assessment(owner, agent_name)

        with engine_lock:
            status_obj = engine.get_agent_status(owner, agent_name)

        agents_out.append({
            "agent_id": agent_id,
            "agent_name": agent_name,
            "email": owner,
            "stream_length": store.get_stream_length(owner, agent_name),
            "last_assessment": last_assessment,
            "recent_alerts": recent_alerts,
            "status": status_obj,
            "last_metric_ts": latest_metric.get("timestamp") if latest_metric else None,
        })

    return {
        "email": email,
        "agents": agents_out,
        "agent_count": len(agents_out),
        "auto_detector": auto_detector.status(),
    }