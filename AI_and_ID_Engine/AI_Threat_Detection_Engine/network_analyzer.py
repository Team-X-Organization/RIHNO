"""
network_analyzer.py

Network Connection Analyzer (rule-based, always active)
  - Suspicious port detection (4444, 6667, 31337, etc.)
  - SYN flood / port scan detection
  - Outbound diversity monitoring
  - C2 beaconing detection (consistent IP across snapshots)
"""

from typing import Dict, List
from collections import Counter
import ipaddress

SUSPICIOUS_PORTS = {
    4444, 5555, 6666, 6667, 6668, 6669,   # Metasploit, IRC
    8443, 8888, 9999, 1337, 31337,         # Common backdoors
    3389, 5900, 5901,                       # RDP, VNC
    25, 587, 53,                            # SMTP, DNS (if unusual)
}


class NetworkAnalyzer:
    """Analyze network connections for threat patterns."""

    def __init__(self):
        self.connection_history: List[Dict] = []
        self.max_history = 100

    def analyze(self, network_features: dict) -> Dict:
        """Analyze connections and return threat assessment."""
        connections = network_features.get("connections_list", [])
        self.connection_history.append(network_features)
        if len(self.connection_history) > self.max_history:
            self.connection_history.pop(0)

        threats = {"score": 0.0, "alerts": [], "patterns": [], "layer": "network_analyzer"}
        if not connections:
            return threats

        # ── Pattern 1: Suspicious port usage ─────────────────────────
        for conn in connections:
            rport = conn.get("remote_port", 0)
            rip = conn.get("remote_ip", "")
            try:
                is_lb = ipaddress.ip_address(rip).is_loopback
            except ValueError:
                is_lb = False
            if rport in SUSPICIOUS_PORTS and not is_lb:
                threats["alerts"].append({
                    "type": "suspicious_ports", "severity": "high",
                    "details": f"{conn.get('process_name', '?')} -> {rip}:{rport}",
                })
                threats["score"] += 0.15

        # ── Pattern 2: Outbound diversity ────────────────────────────
        public_ips = set()
        for c in connections:
            rip = c.get("remote_ip", "")
            try:
                ip = ipaddress.ip_address(rip)
                if not ip.is_private and not ip.is_loopback and c.get("direction") == "outgoing":
                    public_ips.add(rip)
            except ValueError:
                pass
        if len(public_ips) > 10:
            threats["alerts"].append({
                "type": "high_outbound_diversity", "severity": "medium",
                "details": f"{len(public_ips)} unique public IPs contacted",
            })
            threats["score"] += 0.15

        # ── Pattern 3: SYN flood / port scan ─────────────────────────
        states = Counter(c.get("state", "") for c in connections)
        total = max(len(connections), 1)
        syn_ratio = states.get("SYN_SENT", 0) / total
        if syn_ratio > 0.3:
            threats["alerts"].append({
                "type": "port_scan_indicator", "severity": "high",
                "details": f"SYN_SENT ratio: {syn_ratio:.0%}",
            })
            threats["score"] += 0.3

        # ── Pattern 4: Beaconing detection ───────────────────────────
        if len(self.connection_history) >= 5:
            ip_appearances = Counter()
            n = min(len(self.connection_history), 10)
            for snapshot in self.connection_history[-n:]:
                seen = set()
                for conn in snapshot.get("connections_list", []):
                    rip = conn.get("remote_ip", "")
                    try:
                        ip = ipaddress.ip_address(rip)
                        if not ip.is_private and not ip.is_loopback:
                            seen.add(rip)
                    except ValueError:
                        pass
                for ip in seen:
                    ip_appearances[ip] += 1
            for ip, count in ip_appearances.items():
                if count >= n * 0.8:
                    threats["patterns"].append({
                        "type": "possible_beaconing", "ip": ip,
                        "frequency": f"{count}/{n}",
                    })

        threats["score"] = min(threats["score"], 1.0)
        return threats