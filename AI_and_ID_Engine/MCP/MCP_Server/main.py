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
# Tool 11 – get_top_talkers
# ============================================================
@mcp.tool()
def get_top_talkers(email: str, agent_name: str, hours: int = 1, limit: int = 10) -> str:
    """
    Identify the top remote IPs an agent talked to over a recent window,
    ranked by connection count. Useful for spotting unusual peers,
    beaconing destinations, or potential C2 infrastructure.

    Parameters
    ----------
    email      : Owner email of the agent.
    agent_name : Name of the agent to analyse.
    hours      : Lookback window in hours (default 1, max 24).
    limit      : Max remote IPs to return (default 10, max 50).

    Returns per remote IP: connection_count, distinct_ports, suspicious_count,
    last_seen, primary_protocol, primary_process_name.
    """
    hours = min(int(hours), 24)
    limit = min(int(limit), 50)
    sql = """
        SELECT remote_ip,
               COUNT(*)                          AS connection_count,
               COUNT(DISTINCT remote_port)       AS distinct_ports,
               SUM(CASE WHEN is_suspicious THEN 1 ELSE 0 END) AS suspicious_count,
               MAX(time)                         AS last_seen,
               MODE() WITHIN GROUP (ORDER BY protocol)     AS primary_protocol,
               MODE() WITHIN GROUP (ORDER BY process_name) AS primary_process_name
        FROM rihno_connections c
        JOIN rihno_agents a ON a.agent_id = c.agent_id
        WHERE a.email = %s
          AND c.agent_name = %s
          AND c.time >= NOW() - (%s || ' hours')::INTERVAL
        GROUP BY remote_ip
        ORDER BY connection_count DESC
        LIMIT %s;
    """
    try:
        rows = _query(sql, (email, agent_name, str(hours), limit))
        return _ok(rows) if rows else _ok({"message": f"No connections found for '{agent_name}' in last {hours}h."})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Tool 12 – get_threat_trend
# ============================================================
@mcp.tool()
def get_threat_trend(email: str, agent_name: str = "", hours: int = 6) -> str:
    """
    Aggregate threat scores per hour to show whether risk is climbing,
    falling, or steady. Use this for executive briefings or to confirm
    a remediation has reduced anomaly rates.

    Parameters
    ----------
    email      : Owner email.
    agent_name : Optional. Scope to a single agent; blank = all agents.
    hours      : Lookback window in hours (default 6, max 168 = 7 days).

    Returns per hour bucket: avg_port_scan_score, avg_exfil_score,
    avg_c2_score, max_combined_score, total_suspicious_processes.
    """
    hours = min(int(hours), 168)
    conditions = ["email = %s", "bucket >= NOW() - (%s || ' hours')::INTERVAL"]
    params: list = [email, str(hours)]
    if agent_name:
        conditions.append("agent_name = %s")
        params.append(agent_name)
    where = " AND ".join(conditions)
    sql = f"""
        SELECT date_trunc('hour', bucket) AS hour,
               AVG(max_port_scan_score)        AS avg_port_scan_score,
               AVG(max_exfil_score)            AS avg_exfil_score,
               AVG(max_c2_score)               AS avg_c2_score,
               GREATEST(MAX(max_port_scan_score), MAX(max_exfil_score), MAX(max_c2_score)) AS max_combined_score,
               SUM(total_suspicious_processes) AS total_suspicious_processes
        FROM rihno_metrics_1min
        WHERE {where}
        GROUP BY hour
        ORDER BY hour ASC;
    """
    try:
        rows = _query(sql, tuple(params))
        return _ok(rows) if rows else _ok({"message": "No threat trend data found in window."})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Tool 13 – get_agent_health_summary
# ============================================================
@mcp.tool()
def get_agent_health_summary(email: str) -> str:
    """
    Single-call dashboard: per-agent rollup of system health, threat posture,
    and unresolved alert counts. Best for "what's happening across all my
    agents right now?" type questions.

    Parameters
    ----------
    email : Owner email.

    Returns per agent: agent_name, last_seen, is_active, latest_cpu, latest_memory,
    latest_connections, latest_threat_score (max of port/exfil/c2 scores),
    unresolved_alerts, critical_alerts, suspicious_connections_24h.
    """
    sql = """
        WITH latest AS (
            SELECT m.*,
                   ROW_NUMBER() OVER (PARTITION BY agent_name ORDER BY time DESC) rn
            FROM rihno_metrics m
            WHERE email = %s
        ),
        agents AS (
            SELECT agent_id, agent_name, last_seen, is_active
            FROM rihno_agents WHERE email = %s
        )
        SELECT a.agent_name, a.last_seen, a.is_active,
               l.cpu_usage_percent       AS latest_cpu,
               l.memory_usage_percent    AS latest_memory,
               l.connection_count        AS latest_connections,
               GREATEST(COALESCE(l.port_scanning_score,0),
                        COALESCE(l.data_exfiltration_score,0),
                        COALESCE(l.c2_communication_score,0)) AS latest_threat_score,
               (SELECT COUNT(*) FROM rihno_alerts al
                  WHERE al.agent_name = a.agent_name AND al.email = %s
                    AND al.resolved = FALSE) AS unresolved_alerts,
               (SELECT COUNT(*) FROM rihno_alerts al
                  WHERE al.agent_name = a.agent_name AND al.email = %s
                    AND al.severity = 'critical' AND al.resolved = FALSE) AS critical_alerts,
               (SELECT COUNT(*) FROM rihno_connections c
                  WHERE c.agent_name = a.agent_name
                    AND c.is_suspicious = TRUE
                    AND c.time >= NOW() - INTERVAL '24 hours') AS suspicious_connections_24h
        FROM agents a
        LEFT JOIN latest l ON l.agent_name = a.agent_name AND l.rn = 1
        ORDER BY latest_threat_score DESC NULLS LAST, a.agent_name;
    """
    try:
        rows = _query(sql, (email, email, email, email))
        return _ok(rows) if rows else _ok({"message": f"No agents registered for: {email}"})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Tool 14 – get_alert_correlation
# ============================================================
@mcp.tool()
def get_alert_correlation(email: str, hours: int = 24, limit: int = 50) -> str:
    """
    Find alert clusters: groups of alerts that fire close together in time
    and may indicate a coordinated attack across multiple agents or types.
    Bucket size is 5 minutes.

    Parameters
    ----------
    email : Owner email.
    hours : Lookback window in hours (default 24, max 168).
    limit : Max correlation buckets to return (default 50, max 200).

    Returns per 5-min bucket: bucket_time, alert_count, distinct_agents,
    distinct_severities, severities_list, agents_list.
    """
    hours = min(int(hours), 168)
    limit = min(int(limit), 200)
    sql = """
        SELECT date_trunc('minute', time) - (EXTRACT(MINUTE FROM time)::int %% 5) * INTERVAL '1 minute' AS bucket_time,
               COUNT(*)                              AS alert_count,
               COUNT(DISTINCT agent_name)            AS distinct_agents,
               COUNT(DISTINCT severity)              AS distinct_severities,
               ARRAY_AGG(DISTINCT severity)          AS severities_list,
               ARRAY_AGG(DISTINCT agent_name)        AS agents_list
        FROM rihno_alerts
        WHERE email = %s
          AND time >= NOW() - (%s || ' hours')::INTERVAL
        GROUP BY bucket_time
        HAVING COUNT(*) > 1
        ORDER BY alert_count DESC, bucket_time DESC
        LIMIT %s;
    """
    try:
        rows = _query(sql, (email, str(hours), limit))
        return _ok(rows) if rows else _ok({"message": "No correlated alert clusters found."})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Tool 15 – get_active_threats
# ============================================================
@mcp.tool()
def get_active_threats(email: str, min_severity: str = "high") -> str:
    """
    One-shot summary of every currently-active (unresolved) high or critical
    severity alert across an email's agents. Use to triage what to investigate
    first.

    Parameters
    ----------
    email        : Owner email.
    min_severity : 'medium', 'high', or 'critical' — default 'high'.

    Returns per agent grouping: agent_name, total_active, by_severity (counts),
    most_recent_alert, oldest_unresolved_alert.
    """
    rank_map = {"medium": ["medium", "high", "critical"], "high": ["high", "critical"], "critical": ["critical"]}
    sevs = rank_map.get(min_severity.lower(), ["high", "critical"])
    sql = """
        SELECT agent_name,
               COUNT(*)                                   AS total_active,
               SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) AS critical_count,
               SUM(CASE WHEN severity='high'     THEN 1 ELSE 0 END) AS high_count,
               SUM(CASE WHEN severity='medium'   THEN 1 ELSE 0 END) AS medium_count,
               MAX(time)                                  AS most_recent_alert,
               MIN(time)                                  AS oldest_unresolved_alert
        FROM rihno_alerts
        WHERE email = %s
          AND resolved = FALSE
          AND severity = ANY(%s)
        GROUP BY agent_name
        ORDER BY critical_count DESC, high_count DESC, total_active DESC;
    """
    try:
        rows = _query(sql, (email, sevs))
        return _ok(rows) if rows else _ok({"message": f"No active {min_severity}+ threats for {email}."})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Tool 16 – get_port_scan_report
# ============================================================
@mcp.tool()
def get_port_scan_report(email: str, agent_name: str, hours: int = 1) -> str:
    """
    Forensic report on possible port-scanning activity by or against an agent:
    distinct remote ports contacted per remote IP, time of first/last contact,
    and protocol distribution. Helps confirm whether a high port_scanning_score
    is real reconnaissance or false-positive.

    Parameters
    ----------
    email      : Owner email.
    agent_name : Agent to investigate.
    hours      : Lookback window in hours (default 1, max 24).

    Returns per remote IP: distinct_ports_touched, ports_sample (first 20),
    first_contact, last_contact, total_attempts, tcp_count, udp_count.
    """
    hours = min(int(hours), 24)
    sql = """
        SELECT remote_ip,
               COUNT(DISTINCT remote_port)               AS distinct_ports_touched,
               (ARRAY_AGG(DISTINCT remote_port))[1:20]   AS ports_sample,
               MIN(time)                                 AS first_contact,
               MAX(time)                                 AS last_contact,
               COUNT(*)                                  AS total_attempts,
               SUM(CASE WHEN protocol='tcp' THEN 1 ELSE 0 END) AS tcp_count,
               SUM(CASE WHEN protocol='udp' THEN 1 ELSE 0 END) AS udp_count
        FROM rihno_connections c
        JOIN rihno_agents a ON a.agent_id = c.agent_id
        WHERE a.email = %s
          AND c.agent_name = %s
          AND c.time >= NOW() - (%s || ' hours')::INTERVAL
        GROUP BY remote_ip
        HAVING COUNT(DISTINCT remote_port) >= 3
        ORDER BY distinct_ports_touched DESC
        LIMIT 50;
    """
    try:
        rows = _query(sql, (email, agent_name, str(hours)))
        return _ok(rows) if rows else _ok({"message": f"No port-scan-like patterns found for '{agent_name}' in last {hours}h."})
    except psycopg2.Error as e:
        return _err(e)


# ============================================================
# Entrypoint
# ============================================================
if __name__ == "__main__":
    print("Starting RIHNO MCP Server…")
    mcp.run(transport="stdio")