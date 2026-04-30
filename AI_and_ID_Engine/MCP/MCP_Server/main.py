import json
import psycopg2
from psycopg2.extras import RealDictCursor
from mcp.server.fastmcp import FastMCP

# ============================================================
# Server Initialization
# ============================================================
mcp = FastMCP('RIHNO Server')


# ============================================================
# Internal DB Helper
# ============================================================
def _get_connection():
    """Open and return a psycopg2 connection to the RIHNO database."""
    return psycopg2.connect(
        host="my_rihno_db",
        database="rihnodb",
        user="postgres",
        password="5001",
        port="5432"
    )


def _query(sql: str, params: tuple = ()) -> list:
    """
    Execute a SELECT query and return rows as a list of plain dicts.
    Raises psycopg2.Error on failure — callers wrap with try/except.
    """
    conn = _get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def _execute(sql: str, params: tuple = ()) -> int:
    """
    Execute a DML statement (UPDATE/INSERT).
    Returns the number of rows affected.
    Raises psycopg2.Error on failure.
    """
    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            conn.commit()
            return cur.rowcount
    finally:
        conn.close()


def _ok(data) -> str:
    return json.dumps(data, default=str, indent=2)


def _err(e: Exception) -> str:
    return json.dumps({"error": str(e)})


# ============================================================
# Tool 1 – get_agent_data  (original, refactored)
# ============================================================
@mcp.tool()
def get_agent_data(email: str) -> str:
    """
    Retrieve the latest metrics snapshot for every agent registered
    under the given email on the RIHNO intrusion-detection platform.
    Returns one row per agent (the most recent reading).
    """
    sql = """
        WITH ranked AS (
            SELECT *,
                   ROW_NUMBER() OVER (PARTITION BY agent_name ORDER BY time DESC) AS rn
            FROM rihno_metrics
            WHERE email = %s
        )
        SELECT * FROM ranked WHERE rn = 1;
    """
    try:
        rows = _query(sql, (email,))
        for r in rows:
            r.pop("rn", None)
        return _ok(rows) if rows else _ok({"message": f"No agent metrics found for: {email}"})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Tool 2 – list_agents
# ============================================================
@mcp.tool()
def list_agents(email: str) -> str:
    """
    List all agents registered to an email address on the RIHNO platform.
    Returns each agent's id, name, type, OS info, IP address, first/last
    seen timestamps, and whether the agent is currently active.
    Use this tool to discover which agents exist before querying their metrics.
    """
    sql = """
        SELECT agent_id, agent_name, agent_type, os_info, ip_address,
               first_seen, last_seen, is_active
        FROM rihno_agents
        WHERE email = %s
        ORDER BY last_seen DESC;
    """
    try:
        rows = _query(sql, (email,))
        return _ok(rows) if rows else _ok({"message": f"No agents registered for: {email}"})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Tool 3 – get_alerts
# ============================================================
@mcp.tool()
def get_alerts(
    email: str,
    severity: str = "",
    unresolved_only: bool = True,
    limit: int = 50,
) -> str:
    """
    Fetch security alerts generated for agents belonging to the given email.

    Parameters
    ----------
    email          : User email to filter alerts by.
    severity       : Optional filter — one of 'low', 'medium', 'high', 'critical'.
                     Leave blank to return all severities.
    unresolved_only: When True (default) only return alerts not yet resolved.
    limit          : Maximum number of alerts to return (default 50, max 200).

    Each alert includes: alert_type, severity, description, metric_name,
    metric_value, threshold, acknowledged, resolved, and timestamps.
    """
    limit = min(int(limit), 200)
    conditions = ["email = %s"]
    params: list = [email]

    if severity:
        conditions.append("severity = %s")
        params.append(severity.lower())

    if unresolved_only:
        conditions.append("resolved = FALSE")

    where = " AND ".join(conditions)
    sql = f"""
        SELECT id, time, agent_id, agent_name, alert_type, severity,
               description, metric_name, metric_value, threshold,
               acknowledged, resolved, resolved_at
        FROM rihno_alerts
        WHERE {where}
        ORDER BY time DESC
        LIMIT %s;
    """
    params.append(limit)

    try:
        rows = _query(sql, tuple(params))
        return _ok(rows) if rows else _ok({"message": "No alerts found matching the given criteria."})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Tool 4 – acknowledge_alert
# ============================================================
@mcp.tool()
def acknowledge_alert(alert_id: int) -> str:
    """
    Mark a specific RIHNO alert as acknowledged.
    Use get_alerts to find the numeric alert id first.
    Acknowledging means a human has seen the alert; it does not resolve it.

    Parameters
    ----------
    alert_id : The numeric id of the alert (from the 'id' column in rihno_alerts).
    """
    sql = "UPDATE rihno_alerts SET acknowledged = TRUE WHERE id = %s;"
    try:
        affected = _execute(sql, (int(alert_id),))
        if affected:
            return _ok({"message": f"Alert {alert_id} acknowledged successfully."})
        return _ok({"message": f"No alert found with id {alert_id}."})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Tool 5 – resolve_alert
# ============================================================
@mcp.tool()
def resolve_alert(alert_id: int) -> str:
    """
    Mark a specific RIHNO alert as resolved and record the resolution timestamp.
    Use get_alerts to find the numeric alert id first.

    Parameters
    ----------
    alert_id : The numeric id of the alert (from the 'id' column in rihno_alerts).
    """
    sql = """
        UPDATE rihno_alerts
        SET resolved = TRUE, resolved_at = NOW()
        WHERE id = %s;
    """
    try:
        affected = _execute(sql, (int(alert_id),))
        if affected:
            return _ok({"message": f"Alert {alert_id} resolved successfully."})
        return _ok({"message": f"No alert found with id {alert_id}."})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Tool 6 – get_recent_connections
# ============================================================
@mcp.tool()
def get_recent_connections(email: str, agent_name: str, limit: int = 100) -> str:
    """
    Return the most recent network connections observed by a specific agent.

    Parameters
    ----------
    email      : Owner email of the agent.
    agent_name : Name of the agent to query.
    limit      : Number of connections to return (default 100, max 500).

    Each record includes: remote_ip, remote_port, local_ip, local_port,
    protocol, state, process_name, direction (inbound/outbound),
    is_private, is_loopback, is_suspicious.
    """
    limit = min(int(limit), 500)
    sql = """
        SELECT time, remote_ip, remote_port, local_ip, local_port,
               protocol, state, pid, process_name, direction,
               is_private, is_loopback, is_suspicious
        FROM rihno_connections
        WHERE agent_name = %s
        ORDER BY time DESC
        LIMIT %s;
    """
    try:
        rows = _query(sql, (agent_name, limit))
        return _ok(rows) if rows else _ok({"message": f"No connections found for agent: {agent_name}"})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Tool 7 – get_suspicious_connections
# ============================================================
@mcp.tool()
def get_suspicious_connections(email: str, agent_name: str = "", limit: int = 50) -> str:
    """
    Retrieve connections flagged as suspicious across an email's agents.
    Optionally scope to a single agent by providing agent_name.

    Parameters
    ----------
    email      : Owner email — only agents belonging to this email are searched.
    agent_name : Optional. Filter to a single agent by name.
    limit      : Max rows to return (default 50, max 200).

    Suspicious connections are those where is_suspicious = TRUE in rihno_connections.
    Use this tool when investigating active threats or anomalous behaviour.
    """
    limit = min(int(limit), 200)
    conditions = ["c.is_suspicious = TRUE", "a.email = %s"]
    params: list = [email]

    if agent_name:
        conditions.append("c.agent_name = %s")
        params.append(agent_name)

    where = " AND ".join(conditions)
    sql = f"""
        SELECT c.time, c.agent_name, c.remote_ip, c.remote_port,
               c.local_ip, c.local_port, c.protocol, c.state,
               c.process_name, c.direction
        FROM rihno_connections c
        JOIN rihno_agents a ON a.agent_id = c.agent_id
        WHERE {where}
        ORDER BY c.time DESC
        LIMIT %s;
    """
    params.append(limit)

    try:
        rows = _query(sql, tuple(params))
        return _ok(rows) if rows else _ok({"message": "No suspicious connections found."})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Tool 8 – get_metrics_history
# ============================================================
@mcp.tool()
def get_metrics_history(email: str, agent_name: str, hours: int = 1) -> str:
    """
    Return aggregated 1-minute metric buckets for a specific agent over a
    rolling time window. Uses the rihno_metrics_1min continuous aggregate
    for fast retrieval without scanning raw data.

    Parameters
    ----------
    email      : Owner email of the agent.
    agent_name : Name of the agent to query.
    hours      : How many hours of history to return (default 1, max 24).

    Returned columns per bucket: avg_cpu, max_cpu, avg_memory, max_memory,
    avg_connections, max_connections, total_suspicious_ports,
    total_suspicious_processes, avg_net_send_rate, avg_net_recv_rate,
    max_port_scan_score, max_exfil_score, max_c2_score,
    avg_churn_rate, avg_bandwidth_asymmetry, avg_process_count, avg_disk_io_rate.
    """
    hours = min(int(hours), 24)
    sql = """
        SELECT bucket, avg_cpu, max_cpu, avg_memory, max_memory,
               avg_connections, max_connections,
               total_suspicious_ports, total_suspicious_processes,
               avg_net_send_rate, avg_net_recv_rate,
               max_port_scan_score, max_exfil_score, max_c2_score,
               avg_churn_rate, avg_bandwidth_asymmetry,
               avg_process_count, avg_disk_io_rate
        FROM rihno_metrics_1min
        WHERE email = %s
          AND agent_name = %s
          AND bucket >= NOW() - (%s || ' hours')::INTERVAL
        ORDER BY bucket ASC;
    """
    try:
        rows = _query(sql, (email, agent_name, str(hours)))
        return _ok(rows) if rows else _ok({"message": f"No metric history found for agent '{agent_name}' in the last {hours}h."})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Tool 9 – get_security_scores
# ============================================================
@mcp.tool()
def get_security_scores(email: str, agent_name: str = "") -> str:
    """
    Retrieve the latest ML-derived security scores for one or all agents
    belonging to the given email. Scores are pre-computed each collection
    cycle and stored in the rihno_metrics table.

    Parameters
    ----------
    email      : Owner email.
    agent_name : Optional. Scope to a single agent by name.

    Returned scores per agent:
      - port_scanning_score    : Likelihood of active port scanning behaviour.
      - data_exfiltration_score: Likelihood of outbound data exfiltration.
      - c2_communication_score : Likelihood of command-and-control beaconing.
      - connection_churn_rate  : How rapidly connections open/close.
      - connection_density     : Number of unique IPs per connection count.
      - bandwidth_asymmetry    : Send/receive imbalance (high = potential exfil).
      - failed_connection_ratio: Ratio of failed to total connections.

    All scores are DOUBLE PRECISION; higher values indicate higher risk.
    """
    conditions = ["email = %s"]
    params: list = [email]

    if agent_name:
        conditions.append("agent_name = %s")
        params.append(agent_name)

    where = " AND ".join(conditions)
    sql = f"""
        WITH latest AS (
            SELECT *,
                   ROW_NUMBER() OVER (PARTITION BY agent_name ORDER BY time DESC) AS rn
            FROM rihno_metrics
            WHERE {where}
        )
        SELECT agent_name, time,
               port_scanning_score,
               data_exfiltration_score,
               c2_communication_score,
               connection_churn_rate,
               connection_density,
               bandwidth_asymmetry,
               failed_connection_ratio
        FROM latest
        WHERE rn = 1
        ORDER BY agent_name;
    """
    try:
        rows = _query(sql, tuple(params))
        return _ok(rows) if rows else _ok({"message": "No security scores found."})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Tool 10 – get_network_map
# ============================================================
@mcp.tool()
def get_network_map(email: str, agent_name: str) -> str:
    """
    Retrieve the most recent full network-map snapshot for a specific agent.
    Network maps are large JSON blobs (~10-100 KB) captured each collection
    cycle and stored in rihno_network_maps. They contain every observed host,
    connection edge, port, and protocol at the time of capture.

    Use this tool for deep-dive forensic investigation rather than routine
    monitoring (use get_recent_connections for routine queries instead).

    Parameters
    ----------
    email      : Owner email of the agent.
    agent_name : Name of the agent whose network map you want.
    """
    sql = """
        SELECT n.time, n.agent_name, n.network_map_json
        FROM rihno_network_maps n
        JOIN rihno_agents a ON a.agent_id = n.agent_id
        WHERE a.email = %s
          AND n.agent_name = %s
        ORDER BY n.time DESC
        LIMIT 1;
    """
    try:
        rows = _query(sql, (email, agent_name))
        return _ok(rows[0]) if rows else _ok({"message": f"No network map found for agent: {agent_name}"})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Entrypoint
# ============================================================
if __name__ == "__main__":
    print("Starting RIHNO MCP Server…")
    mcp.run(transport="stdio")