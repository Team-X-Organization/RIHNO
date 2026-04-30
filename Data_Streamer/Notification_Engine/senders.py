"""
senders.py

Email + SMS dispatchers.

Email uses SMTP (Gmail/SendGrid/etc).
SMS uses Twilio if creds configured, otherwise logs only.
"""

import os
import smtplib
import ssl
import logging
from email.message import EmailMessage
from typing import Tuple

logger = logging.getLogger(__name__)


# ── Config ──────────────────────────────────────────────────────────────────

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER)
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() == "true"

TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.environ.get("TWILIO_FROM_NUMBER", "")


# ── Email ───────────────────────────────────────────────────────────────────

def send_email(to_addr: str, subject: str, body: str, html: str = "") -> Tuple[bool, str]:
    if not SMTP_USER or not SMTP_PASS:
        logger.warning("SMTP not configured — would have sent email to %s", to_addr)
        return False, "smtp_not_configured"

    msg = EmailMessage()
    msg["From"] = SMTP_FROM or SMTP_USER
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.set_content(body)
    if html:
        msg.add_alternative(html, subtype="html")

    try:
        if SMTP_PORT == 465:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=15) as s:
                s.login(SMTP_USER, SMTP_PASS)
                s.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
                s.ehlo()
                if SMTP_USE_TLS:
                    s.starttls(context=ssl.create_default_context())
                    s.ehlo()
                s.login(SMTP_USER, SMTP_PASS)
                s.send_message(msg)
        return True, "sent"
    except Exception as exc:  # noqa: BLE001
        logger.exception("Email send failed: %s", exc)
        return False, str(exc)


# ── SMS ─────────────────────────────────────────────────────────────────────

def send_sms(to_number: str, body: str) -> Tuple[bool, str]:
    if not (TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM):
        logger.warning("Twilio not configured — would have sent SMS to %s", to_number)
        return False, "twilio_not_configured"
    try:
        from twilio.rest import Client  # type: ignore
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        msg = client.messages.create(body=body, from_=TWILIO_FROM, to=to_number)
        return True, msg.sid
    except Exception as exc:  # noqa: BLE001
        logger.exception("SMS send failed: %s", exc)
        return False, str(exc)


# ── Templates ───────────────────────────────────────────────────────────────

def build_alert_subject(alert: dict) -> str:
    level = alert.get("threat_level", "unknown").upper()
    agent = alert.get("agent_id") or alert.get("agent_name") or "agent"
    return f"[RIHNO] {level} threat on {agent}"


def build_alert_body(alert: dict) -> str:
    lines = [
        "RIHNO Intrusion Detection Alert",
        "================================",
        f"Threat Level : {alert.get('threat_level', '?').upper()}",
        f"Score        : {alert.get('final_score', 0):.3f}",
        f"Agent        : {alert.get('agent_id') or alert.get('agent_name', '?')}",
        f"Timestamp    : {alert.get('timestamp', '?')}",
        "",
    ]

    crit = alert.get("critical_alerts") or []
    if crit:
        lines.append("Critical Alerts:")
        for c in crit[:8]:
            lines.append(f"  - {c}")
        lines.append("")

    net = alert.get("network_alerts") or []
    if net:
        lines.append("Network Alerts:")
        for n in net[:8]:
            lines.append(f"  - {n}")
        lines.append("")

    lines.append("Open the RIHNO dashboard for full context.")
    return "\n".join(lines)


def build_alert_html(alert: dict) -> str:
    level = (alert.get("threat_level") or "unknown").upper()
    color = {
        "CRITICAL": "#FF6B6B",
        "HIGH": "#FF6B6B",
        "MEDIUM": "#FFECA0",
        "LOW": "#CEFFBC",
    }.get(level, "#7EA0FD")

    crit = alert.get("critical_alerts") or []
    net = alert.get("network_alerts") or []

    def list_html(items):
        if not items:
            return "<em>none</em>"
        return "<ul>" + "".join(f"<li>{i}</li>" for i in items[:8]) + "</ul>"

    return f"""
    <div style="font-family: monospace; max-width:600px; border:4px solid #000;">
      <div style="background:{color}; padding:16px; border-bottom:4px solid #000;">
        <h1 style="margin:0; text-transform:uppercase;">RIHNO ALERT</h1>
        <p style="margin:4px 0 0;">Threat level: <strong>{level}</strong></p>
      </div>
      <div style="padding:16px;">
        <p><strong>Score:</strong> {alert.get('final_score', 0):.3f}</p>
        <p><strong>Agent:</strong> {alert.get('agent_id') or alert.get('agent_name','?')}</p>
        <p><strong>Time:</strong> {alert.get('timestamp','?')}</p>
        <h3>Critical</h3>{list_html(crit)}
        <h3>Network</h3>{list_html(net)}
      </div>
    </div>
    """


def build_sms_body(alert: dict) -> str:
    level = (alert.get("threat_level") or "?").upper()
    agent = alert.get("agent_id") or alert.get("agent_name") or "agent"
    score = alert.get("final_score", 0)
    return f"RIHNO {level} on {agent} score={score:.2f}"
