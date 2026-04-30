"""
feature_extractor.py

Parses the raw agent JSON metric payload and extracts:
  - A flat numpy vector of 81 numerical features (for ML models)
  - Network connection graph features (for rule-based analysis)
  - Metadata (email, agent_name, timestamp)
  - An online normalizer using Welford's algorithm (works from sample 1)
"""

import numpy as np
from typing import Dict, List


# ── Feature groups (ordered by detection relevance) ──────────────────────────

FEATURE_GROUPS = {
    "process": [
        "process_count", "process_creation_rate", "process_termination_rate",
        "high_cpu_process_count", "high_mem_process_count",
        "avg_process_cpu", "avg_process_memory", "avg_process_rss",
        "total_threads", "zombie_process_count", "root_process_count",
        "avg_process_age_seconds", "process_with_many_threads",
        "suspicious_process_names", "total_file_descriptors",
    ],
    "system": [
        "system_cpu", "avg_core_cpu", "system_memory_percent",
        "system_memory_used", "system_memory_available",
        "swap_used_percent", "swap_used",
        "disk_read_rate", "disk_write_rate", "disk_io_rate",
        "cpu_usage_spike", "memory_usage_spike",
        "logged_in_users", "system_uptime",
    ],
    "network_volume": [
        "total_connections", "tcp_connections", "udp_connections",
        "established_connections", "listen_connections",
        "time_wait_connections", "syn_sent_connections",
        "syn_recv_connections", "close_wait_connections",
        "fin_wait_connections",
        "net_bytes_sent", "net_bytes_recv",
        "net_send_rate", "net_recv_rate",
        "net_packet_send_rate", "net_packet_recv_rate",
        "net_errors_in", "net_errors_out",
        "net_drops_in", "net_drops_out",
    ],
    "network_topology": [
        "unique_source_ips", "unique_dest_ips", "new_source_ips",
        "private_ip_connections", "public_ip_connections",
        "top_source_ip_count",
        "unique_local_ports", "unique_remote_ports",
        "well_known_port_connections", "ephemeral_port_connections",
        "suspicious_port_connections", "port_scan_indicators",
    ],
    "network_ratios": [
        "tcp_ratio", "udp_ratio", "tcp_udp_ratio",
        "processes_with_net_activity", "avg_connections_per_process",
        "connection_creation_rate", "connection_termination_rate",
        "connection_churn_rate", "connection_density",
        "bandwidth_asymmetry", "failed_connection_ratio",
    ],
    "threat_scores": [
        "port_scanning_score", "data_exfiltration_score",
        "c2_communication_score",
        "external_ip_count", "loopback_connections",
        "total_incoming_connections", "total_outgoing_connections",
        "unique_incoming_ips", "unique_outgoing_ips",
    ],
}

# Flat ordered list of all 81 features
ALL_FEATURES: List[str] = []
for _group in FEATURE_GROUPS.values():
    ALL_FEATURES.extend(_group)


# ── Extraction functions ─────────────────────────────────────────────────────

def extract_features(metric_json: dict) -> np.ndarray:
    """Extract a flat 81-element feature vector from agent JSON."""
    metrics = metric_json.get("metrics", {})
    vector = []
    for feat in ALL_FEATURES:
        val = metrics.get(feat, 0.0)
        vector.append(float(val) if val is not None else 0.0)
    return np.array(vector, dtype=np.float64)


def extract_network_features(metric_json: dict) -> dict:
    """Extract network connection graph features for rule-based analysis."""
    network_map = metric_json.get("network_map", {})
    connections = network_map.get("connections", [])

    unique_remote_ips = set()
    outgoing = incoming = suspicious = closed = established = 0
    processes = set()
    ports = set()

    for conn in connections:
        unique_remote_ips.add(conn.get("remote_ip", ""))
        if conn.get("direction") == "outgoing":
            outgoing += 1
        else:
            incoming += 1
        if conn.get("is_suspicious", False):
            suspicious += 1
        if conn.get("state") == "CLOSED":
            closed += 1
        elif conn.get("state") == "ESTABLISHED":
            established += 1
        processes.add(conn.get("process_name", ""))
        ports.add(conn.get("remote_port", 0))

    total = max(len(connections), 1)
    return {
        "unique_remote_ips": len(unique_remote_ips),
        "outgoing_ratio": outgoing / total,
        "incoming_ratio": incoming / total,
        "suspicious_connections": suspicious,
        "closed_ratio": closed / total,
        "established_ratio": established / total,
        "unique_processes": len(processes),
        "unique_ports": len(ports),
        "total_connections": len(connections),
        "connections_list": connections,
    }


def extract_metadata(metric_json: dict) -> dict:
    """Extract non-numeric metadata fields."""
    return {
        "timestamp": metric_json.get("timestamp", ""),
        "email": metric_json.get("email", ""),
        "agent_name": metric_json.get("agent_name", ""),
        "agent_type": metric_json.get("agent_type", ""),
    }


def make_agent_key(email: str, agent_name: str) -> str:
    """Create a consistent agent key from email + agent_name."""
    return f"{email}:{agent_name}"


# ── Online Normalizer (Welford's algorithm) ──────────────────────────────────

class OnlineNormalizer:
    """
    Incremental mean/variance computation using Welford's algorithm.
    Works from sample 1 — no batch fitting required.
    """

    def __init__(self, n_features: int):
        self.n = 0
        self.mean = np.zeros(n_features)
        self.M2 = np.zeros(n_features)
        self.min_vals = np.full(n_features, np.inf)
        self.max_vals = np.full(n_features, -np.inf)

    def update(self, x: np.ndarray):
        """Update running statistics with a new sample."""
        self.n += 1
        delta = x - self.mean
        self.mean += delta / self.n
        delta2 = x - self.mean
        self.M2 += delta * delta2
        self.min_vals = np.minimum(self.min_vals, x)
        self.max_vals = np.maximum(self.max_vals, x)

    @property
    def variance(self) -> np.ndarray:
        if self.n < 2:
            return np.ones_like(self.mean)
        return self.M2 / (self.n - 1)

    @property
    def std(self) -> np.ndarray:
        return np.sqrt(np.maximum(self.variance, 1e-10))

    def z_score(self, x: np.ndarray) -> np.ndarray:
        """Compute z-score using running statistics."""
        return (x - self.mean) / self.std