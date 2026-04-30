"""
RIHNO IDS — Bedrock MCP Client
================================
An interactive, multi-turn AI analyst powered by AWS Bedrock (Llama 3)
and the RIHNO MCP server running in Docker.

Usage
-----
    python client.py                                      # interactive REPL
    python client.py --email user@test.com                # pre-fill email context
    python client.py --prompt "Show alerts for user@x.com"  # one-shot
    python client.py --model amazon.nova-pro-v1:0         # pick a different model
    python client.py --list-models                        # print known valid model IDs

Environment Variables (override defaults at the top of this file)
---------------------
    RIHNO_AWS_REGION   AWS region for Bedrock (default: us-east-1)
    RIHNO_MODEL_ID     Bedrock model ID
    RIHNO_DOCKER_IMAGE Docker image name of the RIHNO MCP server
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import textwrap
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# ============================================================
# Configuration  (override via environment variables)
# ============================================================
AWS_REGION   = os.getenv("RIHNO_AWS_REGION",   "us-east-1")
MODEL_ID     = os.getenv("RIHNO_MODEL_ID",      "us.anthropic.claude-sonnet-4-6")
DOCKER_IMAGE = os.getenv("RIHNO_DOCKER_IMAGE",  "rihno_mcp_server")

# Known-good Bedrock model IDs that support the Converse API + tool use.
# Pass a short alias (left column) or the full ID to --model / RIHNO_MODEL_ID.
#
# Prefix guide:
#   us.anthropic.*   = US cross-region inference profile  (CRIS, routes within US)
#   anthropic.*      = single-region endpoint (must match your AWS_REGION exactly)
#
# Run `python client.py --list-models` to print this table.
KNOWN_MODELS: dict[str, str] = {
    # ── Anthropic Claude 4.x  (active, recommended) ───────────────────────
    "claude-sonnet-4.6":  "us.anthropic.claude-sonnet-4-6",          # default — best balance
    "claude-sonnet-4.5":  "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "claude-opus-4.6":    "us.anthropic.claude-opus-4-6-v1",
    "claude-haiku-4.5":   "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    # ── DeepSeek  ────────────────────────────────────────────────────────
    "deepseek-r1":        "us.deepseek.v3.2",
    # ── Meta Llama  ──────────────────────────────────────────────────────
    "llama3-70b":         "us.meta.llama3-3-70b-instruct-v1:0",
    "llama3-8b":          "us.meta.llama3-1-8b-instruct-v1:0",
    # ── Amazon Nova  ─────────────────────────────────────────────────────
    "nova-pro":           "amazon.nova-pro-v1:0",
    "nova-lite":          "amazon.nova-lite-v1:0",
    "nova-micro":         "amazon.nova-micro-v1:0",
    # ── Mistral  ─────────────────────────────────────────────────────────
    "mistral-large":      "mistral.mistral-large-2402-v1:0",
    "mixtral-8x7b":       "mistral.mixtral-8x7b-instruct-v0:1",
}

MAX_TOOL_ITERATIONS = 10   # safety cap on agentic loops
MAX_HISTORY_TURNS   = 20   # prune oldest turns beyond this to avoid token bloat
TOOL_SNIPPET_LEN    = 200  # characters shown in debug log for tool results

# ============================================================
# Logging
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("rihno.client")


# ============================================================
# Model Resolution & Validation
# ============================================================
def resolve_model_id(raw: str) -> str:
    """
    Accept either a short alias (e.g. 'nova-pro') or a full Bedrock model ID.
    Returns the canonical full model ID string.
    """
    return KNOWN_MODELS.get(raw.lower(), raw)


def validate_model_id(bedrock, model_id: str) -> None:
    """
    Do a cheap dry-run against Bedrock to confirm the model ID is valid
    *before* the session starts, so the user gets a clear error immediately
    rather than a cryptic crash on the first real query.

    Raises SystemExit with a friendly message on failure.
    """
    log.info("Validating model ID '%s'…", model_id)
    try:
        bedrock.converse(
            modelId=model_id,
            messages=[{"role": "user", "content": [{"text": "ping"}]}],
            inferenceConfig={"maxTokens": 1},
        )
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code == "ValidationException":
            aliases = "\n  ".join(
                f"{alias:16s} → {full_id}"
                for alias, full_id in KNOWN_MODELS.items()
            )
            print(
                f"\n❌  Invalid model ID: '{model_id}'\n"
                f"   Bedrock said: {exc.response['Error']['Message']}\n\n"
                f"Known aliases you can pass to --model:\n  {aliases}\n\n"
                f"Or set RIHNO_MODEL_ID to any full Bedrock model ID.\n"
            )
            sys.exit(1)
        # Other errors (throttling, access denied) are non-fatal for validation
        log.warning("Model validation skipped — Bedrock returned %s: %s", code, exc)
    except BotoCoreError as exc:
        log.warning("Model validation skipped — boto error: %s", exc)


# ============================================================
# System Prompt
# ============================================================
SYSTEM_PROMPT = [{
    "text": textwrap.dedent("""\
        You are RIHNO Analyst, an expert AI security analyst for the RIHNO
        Intrusion Detection System (IDS).

        Your responsibilities:
        - Answer questions about agents, network connections, alerts, and security scores.
        - Always call the appropriate MCP tool to fetch live data before answering.
        - Never make up metrics — if data is unavailable, say so.
        - After receiving tool data, synthesize it into a clear, human-readable summary.
          Group findings by agent_name. Highlight anomalies, critical scores, or
          unresolved alerts prominently.
        - Never output raw JSON, Python dicts, or tool-call syntax as your final answer.
        - When severity is high or critical, lead with a ⚠️  warning.
        - Be concise but complete. Use bullet points for lists of agents or alerts.
    """)
}]


# ============================================================
# Helpers
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
    """
    if len(messages) <= max_turns * 2:
        return messages
    # Keep first message + most recent (max_turns-1)*2 messages
    return [messages[0]] + messages[-(max_turns - 1) * 2:]


def _extract_final_text(response: dict) -> str:
    """Pull all text blocks out of a Bedrock converse response."""
    return "".join(
        block["text"]
        for block in response["output"]["message"].get("content", [])
        if "text" in block
    )


def _print_divider(char: str = "─", width: int = 60) -> None:
    print(char * width)


# ============================================================
# Core agentic loop
# ============================================================
async def run_agentic_turn(
    bedrock,
    session: ClientSession,
    bedrock_tools: list[dict],
    messages: list[dict],
) -> str:
    """
    Send messages to Bedrock and drive the tool-use loop until the model
    produces a final text response.

    Returns the final text string.
    Raises RuntimeError if the safety iteration cap is hit.
    """
    for iteration in range(1, MAX_TOOL_ITERATIONS + 1):
        log.debug("Bedrock call — iteration %d", iteration)

        try:
            response = bedrock.converse(
                modelId=MODEL_ID,
                messages=messages,
                system=SYSTEM_PROMPT,
                toolConfig={"tools": bedrock_tools},
            )
        except (BotoCoreError, ClientError) as exc:
            raise RuntimeError(f"Bedrock API error: {exc}") from exc

        stop_reason = response.get("stopReason")
        usage = response.get("usage", {})
        log.debug(
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

            # Feed results back to Bedrock as a user turn
            messages.append({"role": "user", "content": tool_results})
            log.info("  ↳ Tool results sent back — continuing loop…")
            continue  # next iteration

        # ── Model is done ─────────────────────────────────────────────────
        if stop_reason in ("end_turn", "max_tokens"):
            final_text = _extract_final_text(response)
            return final_text or "(Model returned no text content.)"

        # Unexpected stop reason
        return f"(Unexpected stop reason: {stop_reason})"

    raise RuntimeError(
        f"Agentic loop exceeded {MAX_TOOL_ITERATIONS} iterations without finishing."
    )


# ============================================================
# Interactive REPL
# ============================================================
async def interactive_repl(
    session: ClientSession,
    bedrock,
    bedrock_tools: list[dict],
    initial_email: Optional[str],
    one_shot_prompt: Optional[str],
) -> None:
    """
    Multi-turn interactive chat loop.
    Maintains full conversation history across turns.
    """
    messages: list[dict] = []

    # Greet
    _print_divider("═")
    print("  RIHNO IDS — AI Analyst")
    print(f"  Model  : {MODEL_ID}")
    print(f"  Tools  : {len(bedrock_tools)} loaded")
    if initial_email:
        print(f"  Email  : {initial_email}")
    print("  Type 'exit' or 'quit' to end the session.")
    _print_divider("═")
    print()

    # Helper: inject a user message, call Bedrock, print response
    async def ask(user_text: str) -> None:
        messages.append({"role": "user", "content": [{"text": user_text}]})
        print()
        log.info("Sending to Bedrock…")
        _print_divider()

        try:
            answer = await run_agentic_turn(bedrock, session, bedrock_tools, messages)
        except RuntimeError as exc:
            answer = f"❌  Error: {exc}"
            log.error(exc)

        # Append the final assistant message to history
        messages.append({"role": "assistant", "content": [{"text": answer}]})

        # Trim history to avoid unbounded token growth
        trimmed = _trim_history(messages, MAX_HISTORY_TURNS)
        messages.clear()
        messages.extend(trimmed)

        print(f"\n🤖  RIHNO Analyst\n")
        # Word-wrap long lines for readability in a terminal
        for line in answer.splitlines():
            print(textwrap.fill(line, width=90) if len(line) > 90 else line)
        print()
        _print_divider()

    # ── One-shot mode ─────────────────────────────────────────────────────
    if one_shot_prompt:
        prompt = one_shot_prompt
        if initial_email and initial_email not in prompt:
            prompt = f"[Context: user email is {initial_email}]\n\n{prompt}"
        await ask(prompt)
        return

    # ── REPL mode ─────────────────────────────────────────────────────────
    # Optionally prime the model with the user's email so they don't have
    # to type it in every query.
    if initial_email:
        primer = (
            f"The user's email address is '{initial_email}'. "
            "Remember this for all subsequent queries."
        )
        messages.append({"role": "user",      "content": [{"text": primer}]})
        messages.append({"role": "assistant", "content": [{"text": f"Understood. I'll use '{initial_email}' as the user's email for all queries in this session."}]})

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n\nSession ended.")
            break

        if not user_input:
            continue

        if user_input.lower() in ("exit", "quit", "bye"):
            print("Session ended. Goodbye.")
            break

        if user_input.lower() in ("clear", "reset"):
            messages.clear()
            print("Conversation history cleared.\n")
            continue

        if user_input.lower() in ("help", "?"):
            print(
                "\nAvailable commands:\n"
                "  exit / quit  — end the session\n"
                "  clear / reset — wipe conversation history\n"
                "  help / ?     — show this message\n"
                "\nExample questions:\n"
                "  List all agents for my email\n"
                "  Show unresolved critical alerts\n"
                "  What are the security scores for agent 'web-server-01'?\n"
                "  Show the last 30 minutes of metrics history for 'db-agent'\n"
                "  Get suspicious connections for all my agents\n"
            )
            continue

        await ask(user_input)


# ============================================================
# Entry point
# ============================================================
async def main(
    initial_email: Optional[str] = None,
    one_shot_prompt: Optional[str] = None,
    model_override: Optional[str] = None,
) -> None:
    global MODEL_ID
    if model_override:
        MODEL_ID = resolve_model_id(model_override)
        log.info("Model overridden to: %s", MODEL_ID)

    # Validate before starting the Docker container — fail fast with a clear message
    bedrock = boto3.client("bedrock-runtime", region_name=AWS_REGION)
    validate_model_id(bedrock, MODEL_ID)

    server_params = StdioServerParameters(
        command="docker",
        args=["run", "-i", "--rm", "--network", "rihno-network", "--name", "my_rihno_mcp_server", DOCKER_IMAGE],
    )

    log.info("Connecting to RIHNO MCP server via Docker image '%s'…", DOCKER_IMAGE)

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            mcp_tools     = await session.list_tools()
            bedrock_tools = _build_bedrock_tools(mcp_tools)
            log.info("Loaded %d tool(s): %s", len(bedrock_tools), [t["toolSpec"]["name"] for t in bedrock_tools])

            await interactive_repl(
                session=session,
                bedrock=bedrock,
                bedrock_tools=bedrock_tools,
                initial_email=initial_email,
                one_shot_prompt=one_shot_prompt,
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="RIHNO IDS — Interactive AI analyst powered by AWS Bedrock + MCP"
    )
    parser.add_argument(
        "--email", "-e",
        metavar="EMAIL",
        help="Pre-fill the user email so you don't have to type it each query.",
    )
    parser.add_argument(
        "--prompt", "-p",
        metavar="PROMPT",
        help="Run a single one-shot prompt and exit (non-interactive mode).",
    )
    parser.add_argument(
        "--model", "-m",
        metavar="MODEL",
        help=(
            "Bedrock model ID or short alias to use. "
            "Run --list-models to see valid options. "
            "Overrides the RIHNO_MODEL_ID environment variable."
        ),
    )
    parser.add_argument(
        "--list-models",
        action="store_true",
        help="Print all known model aliases and their full Bedrock IDs, then exit.",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable verbose debug logging.",
    )
    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    if args.list_models:
        print("\nKnown model aliases  (pass to --model or RIHNO_MODEL_ID):\n")
        for alias, full_id in KNOWN_MODELS.items():
            marker = "  ← default" if full_id == MODEL_ID else ""
            print(f"  {alias:16s}  {full_id}{marker}")
        print(
            "\nYou can also pass any full Bedrock model ID directly.\n"
            "Ensure the model is enabled in your AWS account and supports tool use.\n"
        )
        sys.exit(0)

    try:
        asyncio.run(main(
            initial_email=args.email,
            one_shot_prompt=args.prompt,
            model_override=args.model,
        ))
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(0)