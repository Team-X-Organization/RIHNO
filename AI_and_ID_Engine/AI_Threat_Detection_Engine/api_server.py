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

import os
import threading
from typing import Dict, List, Any, Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from redis_store import RedisStore
from main import IDSEngine


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

store = RedisStore(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, password=REDIS_PASS)
engine = IDSEngine(store)
engine_lock = threading.Lock()


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
        result = engine.process(metric.dict())
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