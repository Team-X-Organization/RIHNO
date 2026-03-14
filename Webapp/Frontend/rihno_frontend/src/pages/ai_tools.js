// Tool specifications matching the MCP Server tools defined in RIHNO_MCP/MCP_Server/main.py
import { backendConfig } from './../authConfig';

export const bedrockTools = [
    // ── Tool 1: get_agent_data ──────────────────────────────────────────────
    {
        toolSpec: {
            name: "get_agent_data",
            description: "Retrieve the latest metrics snapshot for every agent registered under the given email. Returns one row per agent (the most recent reading).",
            inputSchema: {
                json: {
                    type: "object",
                    properties: {
                        email: { type: "string", description: "Owner email address." }
                    },
                    required: ["email"]
                }
            }
        }
    },

    // ── Tool 2: list_agents ─────────────────────────────────────────────────
    {
        toolSpec: {
            name: "list_agents",
            description: "List all agents registered to an email address. Returns each agent's id, name, type, OS info, IP address, first/last seen timestamps, and whether the agent is currently active. Use this to discover which agents exist before querying their metrics.",
            inputSchema: {
                json: {
                    type: "object",
                    properties: {
                        email: { type: "string", description: "Owner email address." }
                    },
                    required: ["email"]
                }
            }
        }
    },

    // ── Tool 3: get_alerts ──────────────────────────────────────────────────
    {
        toolSpec: {
            name: "get_alerts",
            description: "Fetch security alerts generated for agents belonging to the given email. Each alert includes: alert_type, severity, description, metric_name, metric_value, threshold, acknowledged, resolved, and timestamps.",
            inputSchema: {
                json: {
                    type: "object",
                    properties: {
                        email: { type: "string", description: "User email to filter alerts by." },
                        severity: { type: "string", description: "Optional filter — one of 'low', 'medium', 'high', 'critical'. Leave blank to return all severities." },
                        unresolved_only: { type: "boolean", description: "When true (default) only return alerts not yet resolved." },
                        limit: { type: "integer", description: "Maximum number of alerts to return (default 50, max 200)." }
                    },
                    required: ["email"]
                }
            }
        }
    },

    // ── Tool 4: acknowledge_alert ───────────────────────────────────────────
    {
        toolSpec: {
            name: "acknowledge_alert",
            description: "Mark a specific RIHNO alert as acknowledged. Use get_alerts to find the numeric alert id first. Acknowledging means a human has seen the alert; it does not resolve it.",
            inputSchema: {
                json: {
                    type: "object",
                    properties: {
                        alert_id: { type: "integer", description: "The numeric id of the alert (from the 'id' column in rihno_alerts)." }
                    },
                    required: ["alert_id"]
                }
            }
        }
    },

    // ── Tool 5: resolve_alert ───────────────────────────────────────────────
    {
        toolSpec: {
            name: "resolve_alert",
            description: "Mark a specific RIHNO alert as resolved and record the resolution timestamp. Use get_alerts to find the numeric alert id first.",
            inputSchema: {
                json: {
                    type: "object",
                    properties: {
                        alert_id: { type: "integer", description: "The numeric id of the alert (from the 'id' column in rihno_alerts)." }
                    },
                    required: ["alert_id"]
                }
            }
        }
    },

    // ── Tool 6: get_recent_connections ──────────────────────────────────────
    {
        toolSpec: {
            name: "get_recent_connections",
            description: "Return the most recent network connections observed by a specific agent. Each record includes: remote_ip, remote_port, local_ip, local_port, protocol, state, process_name, direction (inbound/outbound), is_private, is_loopback, is_suspicious.",
            inputSchema: {
                json: {
                    type: "object",
                    properties: {
                        email: { type: "string", description: "Owner email of the agent." },
                        agent_name: { type: "string", description: "Name of the agent to query." },
                        limit: { type: "integer", description: "Number of connections to return (default 100, max 500)." }
                    },
                    required: ["email", "agent_name"]
                }
            }
        }
    },

    // ── Tool 7: get_suspicious_connections ─────────────────────────────────
    {
        toolSpec: {
            name: "get_suspicious_connections",
            description: "Retrieve connections flagged as suspicious across an email's agents. Optionally scope to a single agent. Use this when investigating active threats or anomalous behaviour.",
            inputSchema: {
                json: {
                    type: "object",
                    properties: {
                        email: { type: "string", description: "Owner email — only agents belonging to this email are searched." },
                        agent_name: { type: "string", description: "Optional. Filter to a single agent by name." },
                        limit: { type: "integer", description: "Max rows to return (default 50, max 200)." }
                    },
                    required: ["email"]
                }
            }
        }
    },

    // ── Tool 8: get_metrics_history ─────────────────────────────────────────
    {
        toolSpec: {
            name: "get_metrics_history",
            description: "Return aggregated 1-minute metric buckets for a specific agent over a rolling time window. Columns: avg_cpu, max_cpu, avg_memory, max_memory, avg_connections, max_connections, total_suspicious_ports, total_suspicious_processes, avg_net_send_rate, avg_net_recv_rate, max_port_scan_score, max_exfil_score, max_c2_score, avg_churn_rate, avg_bandwidth_asymmetry, avg_process_count, avg_disk_io_rate.",
            inputSchema: {
                json: {
                    type: "object",
                    properties: {
                        email: { type: "string", description: "Owner email of the agent." },
                        agent_name: { type: "string", description: "Name of the agent to query." },
                        hours: { type: "integer", description: "How many hours of history to return (default 1, max 24)." }
                    },
                    required: ["email", "agent_name"]
                }
            }
        }
    },

    // ── Tool 9: get_security_scores ─────────────────────────────────────────
    {
        toolSpec: {
            name: "get_security_scores",
            description: "Retrieve the latest ML-derived security scores for one or all agents belonging to the given email. Scores: port_scanning_score, data_exfiltration_score, c2_communication_score, connection_churn_rate, connection_density, bandwidth_asymmetry, failed_connection_ratio. Higher values = higher risk.",
            inputSchema: {
                json: {
                    type: "object",
                    properties: {
                        email: { type: "string", description: "Owner email." },
                        agent_name: { type: "string", description: "Optional. Scope to a single agent by name." }
                    },
                    required: ["email"]
                }
            }
        }
    },

    // ── Tool 10: get_network_map ─────────────────────────────────────────────
    {
        toolSpec: {
            name: "get_network_map",
            description: "Retrieve the most recent full network-map snapshot for a specific agent (large JSON blob). Contains every observed host, connection edge, port, and protocol. Use for deep-dive forensic investigation rather than routine monitoring — use get_recent_connections for routine queries instead.",
            inputSchema: {
                json: {
                    type: "object",
                    properties: {
                        email: { type: "string", description: "Owner email of the agent." },
                        agent_name: { type: "string", description: "Name of the agent whose network map you want." }
                    },
                    required: ["email", "agent_name"]
                }
            }
        }
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper to route frontend tool calls to the actual RihnoDealer API endpoints.
// Tools that mutate data (acknowledge_alert, resolve_alert) use POST.
// ─────────────────────────────────────────────────────────────────────────────
export const executeTool = async (toolName, toolArgs) => {
    // Strip trailing slash to avoid double slashes
    const BASE_URL = backendConfig.dealerURL.endsWith('/')
        ? backendConfig.dealerURL.slice(0, -1)
        : backendConfig.dealerURL;

    const email = encodeURIComponent(toolArgs.email || '');

    try {
        switch (toolName) {
            case 'get_agent_data': {
                const res = await fetch(`${BASE_URL}/metrics/latest_full?email=${email}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.text();
            }
            case 'list_agents': {
                const res = await fetch(`${BASE_URL}/agents/status?email=${email}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.text();
            }
            case 'get_alerts': {
                const params = new URLSearchParams({ email: toolArgs.email });
                if (toolArgs.severity) params.set('severity', toolArgs.severity);
                if (toolArgs.unresolved_only !== undefined) params.set('unresolved_only', toolArgs.unresolved_only);
                if (toolArgs.limit) params.set('limit', toolArgs.limit);
                const res = await fetch(`${BASE_URL}/alerts/recent?${params}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.text();
            }
            case 'acknowledge_alert': {
                const res = await fetch(`${BASE_URL}/alerts/${toolArgs.alert_id}/acknowledge`, { method: 'POST' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.text();
            }
            case 'resolve_alert': {
                const res = await fetch(`${BASE_URL}/alerts/${toolArgs.alert_id}/resolve`, { method: 'POST' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.text();
            }
            case 'get_recent_connections': {
                const params = new URLSearchParams({ email: toolArgs.email, agent_name: toolArgs.agent_name });
                if (toolArgs.limit) params.set('limit', toolArgs.limit);
                const res = await fetch(`${BASE_URL}/metrics/network_map?${params}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.text();
            }
            case 'get_suspicious_connections': {
                const params = new URLSearchParams({ email: toolArgs.email });
                if (toolArgs.agent_name) params.set('agent_name', toolArgs.agent_name);
                if (toolArgs.limit) params.set('limit', toolArgs.limit);
                const res = await fetch(`${BASE_URL}/metrics/network_map?${params}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.text();
            }
            case 'get_metrics_history': {
                const params = new URLSearchParams({ email: toolArgs.email, agent_name: toolArgs.agent_name });
                if (toolArgs.hours) params.set('hours', toolArgs.hours);
                const res = await fetch(`${BASE_URL}/metrics/history?${params}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.text();
            }
            case 'get_security_scores': {
                const params = new URLSearchParams({ email: toolArgs.email });
                if (toolArgs.agent_name) params.set('agent_name', toolArgs.agent_name);
                const res = await fetch(`${BASE_URL}/metrics/latest_full?${params}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.text();
            }
            case 'get_network_map': {
                const params = new URLSearchParams({ email: toolArgs.email, agent_name: toolArgs.agent_name });
                const res = await fetch(`${BASE_URL}/metrics/network_map?${params}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.text();
            }
            default:
                return JSON.stringify({ error: `Tool '${toolName}' is not implemented in the frontend proxy.` });
        }
    } catch (error) {
        console.error(`Error executing tool '${toolName}':`, error);
        return JSON.stringify({ error: `Network or Server Error: ${error.message}` });
    }
};
