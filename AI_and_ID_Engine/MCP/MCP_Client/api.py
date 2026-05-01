"""
RIHNO IDS — Bedrock MCP FastAPI Server
=======================================
Bridges the React frontend to the Docker-based MCP server and AWS Bedrock.
Mirrors the agentic loop logic from main.py exactly.

Start with:
    
    
"""

import asyncio
import logging
import os
import textwrap
from contextlib import AsyncExitStack, asynccontextmanager
from typing import Optional, List, Dict, Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from pydantic import BaseModel

# ============================================================
# Configuration  (override via environment variables)
# ============================================================
AWS_REGION   = os.getenv("RIHNO_AWS_REGION",   "us-east-1")
DOCKER_IMAGE = os.getenv("RIHNO_DOCKER_IMAGE",  "rihno_mcp_server")

# Known-good Bedrock model IDs — mirrors main.py KNOWN_MODELS
KNOWN_MODELS: dict[str, str] = {
    "claude-sonnet-4.6":  "us.anthropic.claude-sonnet-4-6",
    "claude-sonnet-4.5":  "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "claude-opus-4.6":    "us.anthropic.claude-opus-4-6-v1",
    "claude-haiku-4.5":   "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "claude-3.5-sonnet":  "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
    "deepseek-r1":        "us.deepseek.v3.2",
    "llama3-70b":         "us.meta.llama3-3-70b-instruct-v1:0",
    "llama3-8b":          "us.meta.llama3-1-8b-instruct-v1:0",
    "nova-pro":           "amazon.nova-pro-v1:0",
    "nova-lite":          "amazon.nova-lite-v1:0",
    "nova-micro":         "amazon.nova-micro-v1:0",
    "mistral-large":      "mistral.mistral-large-2402-v1:0",
}

def _resolve_model(raw: str) -> str:
    """Accept a short alias or full Bedrock model ID."""
    return KNOWN_MODELS.get(raw.lower(), raw)

_raw_model = os.getenv("RIHNO_MODEL_ID", "claude-3.5-sonnet")
MODEL_ID    = _resolve_model(_raw_model)

MAX_TOOL_ITERATIONS = 10   # mirrors main.py
MAX_HISTORY_TURNS   = 20   # prune oldest turns to avoid token bloat
TOOL_SNIPPET_LEN    = 200

# ============================================================
# Logging
# ============================================================
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
log = logging.getLogger("rihno.api")

# ============================================================
# System Prompt  (identical to main.py)
# ============================================================
SYSTEM_PROMPT = [{
    "text": textwrap.dedent("""\
        You are **RIHNO Analyst**, a senior AI security analyst embedded in
        the RIHNO Intrusion Detection System (IDS). You speak with the
        confidence of a SOC lead: precise, calm, and action-oriented.

        ── ROLE ────────────────────────────────────────────────────────────
        Your job is to turn raw IDS telemetry into clear, prioritised
        intelligence the user can act on within seconds. Every answer should
        leave the user understanding: (1) what is happening, (2) how bad it
        is, and (3) what to do next.

        ── DATA DISCIPLINE ─────────────────────────────────────────────────
        - ALWAYS call MCP tools before asserting any metric, score, or alert.
          Never guess, never recall from training.
        - If a tool returns no data, say so plainly. Do not invent placeholders.
        - Chain tools when needed: `list_agents` → `get_agent_health_summary`
          → `get_active_threats` → drill-down with `get_port_scan_report` or
          `get_top_talkers`.
        - Prefer summary tools (`get_agent_health_summary`, `get_threat_trend`,
          `get_alert_correlation`) for broad questions; reserve raw tools
          (`get_recent_connections`, `get_network_map`) for forensic depth.
        - Never echo raw JSON, Python dicts, or tool call syntax. Translate
          it into human language.

        ── RESPONSE STRUCTURE ──────────────────────────────────────────────
        Use this skeleton when responding to a security query:

        > **TL;DR** — one-line verdict, e.g.
        > "*3 agents healthy, 1 (sensor-2) shows critical port-scan activity.*"

        > **## Findings** — bullet list grouped by agent_name. Each bullet:
        > `**agent_name** — score 0.87 (critical) — 14 unresolved alerts.`

        > **## Evidence** — concrete numbers from tool results. Show metric
        > names, values, and timestamps. Use a Markdown table when comparing
        > 3+ agents or metrics.

        > **## Recommended Next Steps** — 1-3 imperative actions, e.g.
        > "Run `get_port_scan_report` on sensor-2 to confirm reconnaissance."

        Skip sections that don't apply (e.g. no recommendations needed for a
        purely informational lookup).

        ── SEVERITY CONVENTIONS ───────────────────────────────────────────
        Lead with one of these badges when severity ≥ medium:
        - 🟢 **NORMAL** (score < 0.15)
        - 🟡 **LOW** (0.15-0.35)
        - 🟠 **MEDIUM** (0.35-0.55)
        - 🔴 **HIGH** (0.55-0.75)
        - ⚠️ **CRITICAL** (≥ 0.75)

        For critical findings, place the ⚠️ warning at the very top of the
        response, before TL;DR.

        ── FORMATTING ──────────────────────────────────────────────────────
        - Use Markdown headings (##, ###), **bold**, `inline code` for IDs,
          IPs, ports, and process names.
        - Use Markdown tables for comparisons (the frontend renders them).
        - Use fenced code blocks for log excerpts or JSON snippets the user
          should copy.
        - Round scores to 2 decimal places. Format timestamps as
          `YYYY-MM-DD HH:MM UTC`.
        - Never invent emojis beyond the severity set above.
        - Be concise. Default cap: 250 words unless the user asks for depth.

        ── EMAIL CONTEXT ───────────────────────────────────────────────────
        The user's email is injected at session start. Pass it to every tool
        that requires `email`. Do not ask the user for it.
    """)
}]

# ============================================================
# Helpers  (mirrors main.py)
# ============================================================
def _build_bedrock_tools(mcp_tools) -> list[dict]:
    """Convert MCP tool definitions into the Bedrock toolSpec format."""
    return [
        {
            "toolSpec": {
                "name": tool.name,
                "description": tool.description or "",
                "inputSchema": {"json": tool.inputSchema},
            }
        }
        for tool in mcp_tools.tools
    ]


def _trim_history(messages: list[dict], max_turns: int) -> list[dict]:
    """
    Keep conversation history under max_turns pairs to avoid token bloat.
    Always preserves the very first user message (original context).
    Mirrors main.py _trim_history exactly.
    """
    if len(messages) <= max_turns * 2:
        return messages
    return [messages[0]] + messages[-(max_turns - 1) * 2:]


def _extract_final_text(response: dict) -> str:
    """Pull all text blocks out of a Bedrock converse response."""
    return "".join(
        block["text"]
        for block in response["output"]["message"].get("content", [])
        if "text" in block
    )


# ============================================================
# Core agentic loop  (mirrors main.py run_agentic_turn)
# ============================================================
async def run_agentic_turn(
    bedrock_client,
    session: ClientSession,
    tools: list[dict],
    messages: list[dict],
    model_id: str = None,
) -> str:
    """
    Send messages to Bedrock and drive the tool-use loop until the model
    produces a final text response. Raises RuntimeError on failure.
    """
    effective_model = model_id or MODEL_ID

    for iteration in range(1, MAX_TOOL_ITERATIONS + 1):
        log.debug("Bedrock call — iteration %d", iteration)

        try:
            response = bedrock_client.converse(
                modelId=effective_model,
                messages=messages,
                system=SYSTEM_PROMPT,
                toolConfig={"tools": tools},
            )
        except (BotoCoreError, ClientError) as exc:
            raise RuntimeError(f"Bedrock API error: {exc}") from exc

        stop_reason = response.get("stopReason")
        usage = response.get("usage", {})
        log.info(
            "stop_reason=%s  input_tokens=%s  output_tokens=%s",
            stop_reason,
            usage.get("inputTokens", "?"),
            usage.get("outputTokens", "?"),
        )

        # ── Model wants to use tools ──────────────────────────────────────
        if stop_reason == "tool_use":
            ai_message = response["output"]["message"]
            messages.append(ai_message)
            tool_results: list[dict] = []

            for block in ai_message.get("content", []):
                if "toolUse" not in block:
                    continue

                tool_use  = block["toolUse"]
                tool_name = tool_use["name"]
                tool_args = tool_use["input"]
                tool_id   = tool_use["toolUseId"]

                log.info("  ↳ Tool call: %s(%s)", tool_name, tool_args)

                try:
                    result = await session.call_tool(tool_name, arguments=tool_args)
                    result_text = result.content[0].text
                    status = "success"
                    log.debug(
                        "  ↳ Tool result snippet: %s…",
                        result_text[:TOOL_SNIPPET_LEN].replace("\n", " "),
                    )
                except Exception as exc:
                    result_text = f"Tool execution failed: {exc}"
                    status = "error"
                    log.warning("  ↳ Tool '%s' raised: %s", tool_name, exc)

                tool_results.append({
                    "toolResult": {
                        "toolUseId": tool_id,
                        "content": [{"text": result_text}],
                        "status": status,
                    }
                })

            messages.append({"role": "user", "content": tool_results})
            log.info("  ↳ Tool results sent back — continuing loop…")
            continue

        # ── Model is done ─────────────────────────────────────────────────
        if stop_reason in ("end_turn", "max_tokens"):
            return _extract_final_text(response) or "(Model returned no text content.)"

        return f"(Unexpected stop reason: {stop_reason})"

    raise RuntimeError(f"Agentic loop exceeded {MAX_TOOL_ITERATIONS} iterations without finishing.")


# ============================================================
# FastAPI app + MCP lifespan
# ============================================================
bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)

mcp_session:   Optional[ClientSession]    = None
bedrock_tools: List[Dict[str, Any]]       = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    global mcp_session, bedrock_tools
    exit_stack = AsyncExitStack()
    try:
        log.info("Starting MCP Docker image '%s'…", DOCKER_IMAGE)
        server_params = StdioServerParameters(
            command="docker",
            args=["run", "-i", "--rm", "--network", "rihno-network", "--name", "my_rihno_mcp_server", DOCKER_IMAGE],
        )
        read, write = await exit_stack.enter_async_context(stdio_client(server_params))
        mcp_session  = await exit_stack.enter_async_context(ClientSession(read, write))
        await mcp_session.initialize()

        mcp_tools     = await mcp_session.list_tools()
        bedrock_tools = _build_bedrock_tools(mcp_tools)
        log.info(
            "MCP server ready. Model: %s  Tools (%d): %s",
            MODEL_ID,
            len(bedrock_tools),
            [t["toolSpec"]["name"] for t in bedrock_tools],
        )
        yield
    except Exception as exc:
        log.error("Failed to initialise MCP server: %s", exc)
        raise
    finally:
        log.info("Shutting down MCP server…")
        await exit_stack.aclose()


app = FastAPI(title="RIHNO AI Analyst API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # restrict to your frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Pydantic models
# ============================================================
class Message(BaseModel):
    role: str     # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[Message] = []
    email: Optional[str] = None
    model: Optional[str] = None   # alias or full Bedrock model ID; falls back to server default

class ChatResponse(BaseModel):
    reply: str
    error: Optional[str] = None


# ============================================================
# Endpoints
# ============================================================
@app.get("/api/status")
async def get_status():
    if mcp_session is None:
        return {"status": "offline", "tools": 0, "model": MODEL_ID}
    return {
        "status": "online",
        "tools":  len(bedrock_tools),
        "model":  MODEL_ID,
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if mcp_session is None:
        return ChatResponse(reply="", error="MCP Server not connected. Start api.py first.")

    # Build Bedrock message list from clean text history
    bedrock_messages: list[dict] = []

    # Inject email context ONLY at the very start of a fresh conversation
    # (mirrors main.py interactive_repl primer logic — only when no prior history)
    if req.email and len(req.history) == 0:
        bedrock_messages.append({
            "role": "user",
            "content": [{"text": f"The user's email address is '{req.email}'. Remember this for all queries in this session."}]
        })
        bedrock_messages.append({
            "role": "assistant",
            "content": [{"text": f"Understood. I'll use '{req.email}' as the user's email for all queries in this session."}]
        })

    # Append prior conversation turns
    for msg in req.history:
        bedrock_messages.append({
            "role": msg.role,
            "content": [{"text": msg.content}]
        })

    # Append current user query
    bedrock_messages.append({
        "role": "user",
        "content": [{"text": req.message}]
    })

    # Trim to avoid token bloat — mirrors main.py
    bedrock_messages = _trim_history(bedrock_messages, MAX_HISTORY_TURNS)

    # Resolve model: request alias > server default
    effective_model = _resolve_model(req.model) if req.model else MODEL_ID
    log.info("Chat request — model: %s  history_turns: %d", effective_model, len(req.history))

    try:
        reply = await run_agentic_turn(bedrock, mcp_session, bedrock_tools, bedrock_messages, model_id=effective_model)
        return ChatResponse(reply=reply)
    except Exception as exc:
        log.error("Agent turn failed: %s", exc)
        return ChatResponse(reply="", error=str(exc))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8001, reload=True)
