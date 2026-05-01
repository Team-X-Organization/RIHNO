"""
bedrock_summarizer.py

AWS Bedrock Nova Lite summarizer for RIHNO security alerts.

Generates a short, human-readable explanation of an alert that is appended
to email/SMS notifications alongside the raw metrics. The model is asked
to keep output well under a configurable character budget so SMS recipients
still receive useful context within carrier limits.

Env vars:
    AWS_REGION                  default us-east-1
    BEDROCK_MODEL_ID            default amazon.nova-lite-v1:0
    BEDROCK_SUMMARY_DISABLED    set to "true" to short-circuit (returns None)

Public API:
    summarize_alert(alert: dict) -> dict | None
        Returns {"email_summary": str, "sms_summary": str} on success,
        or None on any failure (callers must fall back gracefully).
"""

from __future__ import annotations

import json
import logging
import os
import threading
from typing import Optional

logger = logging.getLogger(__name__)

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-lite-v1:0")
DISABLED = os.environ.get("BEDROCK_SUMMARY_DISABLED", "false").lower() == "true"

EMAIL_SUMMARY_MAX_CHARS = 600
SMS_SUMMARY_MAX_CHARS = 140  # leaves room for metric line in 160-char SMS

_client = None
_client_lock = threading.Lock()
_init_failed = False


def _get_client():
    """Lazy-initialise the bedrock-runtime client. Cached, thread-safe."""
    global _client, _init_failed
    if _init_failed or DISABLED:
        return None
    if _client is not None:
        return _client
    with _client_lock:
        if _client is not None:
            return _client
        try:
            import boto3  # imported lazily so notification engine starts even without boto3
            _client = boto3.client("bedrock-runtime", region_name=AWS_REGION)
            logger.info("Bedrock summarizer ready (region=%s, model=%s)", AWS_REGION, MODEL_ID)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Bedrock summarizer disabled — init failed: %s", exc)
            _init_failed = True
            _client = None
    return _client


_SYSTEM_PROMPT = (
    "You are RIHNO Analyst, a senior SOC engineer. Given a single security "
    "alert payload, produce a tight plain-text explanation a non-technical "
    "operator can act on. Two outputs are required: an EMAIL_SUMMARY "
    f"(max {EMAIL_SUMMARY_MAX_CHARS} chars, 2-4 sentences, may include a "
    "short bulleted action list) and an SMS_SUMMARY "
    f"(max {SMS_SUMMARY_MAX_CHARS} chars, single line, no markdown). "
    "Both must (1) name the threat in plain English, (2) state likely cause, "
    "(3) suggest one immediate action. Never invent data not present in the "
    "alert. Return ONLY valid JSON with keys email_summary and sms_summary."
)


def _build_user_prompt(alert: dict) -> str:
    payload = {
        "threat_level": alert.get("threat_level"),
        "final_score": alert.get("final_score"),
        "agent_id": alert.get("agent_id") or alert.get("agent_name"),
        "timestamp": alert.get("timestamp"),
        "critical_alerts": (alert.get("critical_alerts") or [])[:8],
        "network_alerts": (alert.get("network_alerts") or [])[:8],
        "anomalous_features": (alert.get("anomalous_features") or [])[:6],
        "layer_contributions": alert.get("layer_contributions") or {},
    }
    return (
        "Summarize this RIHNO alert. Return JSON only.\n\n"
        f"```json\n{json.dumps(payload, default=str, indent=2)}\n```"
    )


def _parse_response(text: str) -> Optional[dict]:
    """Extract JSON object from model output (model may wrap in code fences)."""
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    # find the first { and last } — robust against trailing prose
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        obj = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return None
    email_s = str(obj.get("email_summary", "")).strip()
    sms_s = str(obj.get("sms_summary", "")).strip()
    if not email_s and not sms_s:
        return None
    return {
        "email_summary": email_s[:EMAIL_SUMMARY_MAX_CHARS],
        "sms_summary": sms_s[:SMS_SUMMARY_MAX_CHARS],
    }


def summarize_alert(alert: dict) -> Optional[dict]:
    """
    Call Bedrock Nova Lite to summarize an alert.
    Returns {email_summary, sms_summary} or None on failure.
    Never raises — callers must treat None as "no AI summary available".
    """
    client = _get_client()
    if client is None:
        return None

    try:
        response = client.converse(
            modelId=MODEL_ID,
            messages=[
                {
                    "role": "user",
                    "content": [{"text": _build_user_prompt(alert)}],
                }
            ],
            system=[{"text": _SYSTEM_PROMPT}],
            inferenceConfig={"maxTokens": 400, "temperature": 0.2, "topP": 0.9},
        )
        text = "".join(
            block.get("text", "")
            for block in response.get("output", {}).get("message", {}).get("content", [])
            if "text" in block
        )
        parsed = _parse_response(text)
        if parsed is None:
            logger.warning("Nova Lite returned unparseable summary for alert: %r", text[:200])
        else:
            logger.info(
                "Nova Lite summary ok (level=%s agent=%s email_chars=%d sms_chars=%d)",
                alert.get("threat_level"),
                alert.get("agent_id"),
                len(parsed["email_summary"]),
                len(parsed["sms_summary"]),
            )
        return parsed
    except Exception as exc:  # noqa: BLE001
        logger.exception("Bedrock summarize_alert failed: %s", exc)
        return None
