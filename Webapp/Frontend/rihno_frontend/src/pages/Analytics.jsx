import React, { useState, useEffect } from 'react';
import { Calendar, Cpu, Loader2, Network, HardDrive, Activity, Shield, Users, Zap, Terminal, Server, MapPin, Search, AlertTriangle, AlertCircle } from 'lucide-react';
import { Cell, Pie, PieChart, Tooltip, RadialBarChart, RadialBar, BarChart, Bar, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import axios from 'axios';

// ─── Formatting Helper ────────────────────────────────────────────────────────
function fmt(v, type = 'pct') {
    if (v === undefined || v === null || isNaN(v)) return '—';
    if (type === 'bytes') {
        if (v >= 1e9) return (v / 1e9).toFixed(2) + ' GB';
        if (v >= 1e6) return (v / 1e6).toFixed(2) + ' MB';
        if (v >= 1e3) return (v / 1e3).toFixed(1) + ' KB';
        return v.toFixed(0) + ' B';
    }
    if (type === 'rate') {
        if (v >= 1e9) return (v / 1e9).toFixed(2) + ' GB/s';
        if (v >= 1e6) return (v / 1e6).toFixed(2) + ' MB/s';
        if (v >= 1e3) return (v / 1e3).toFixed(1) + ' KB/s';
        return v.toFixed(0) + ' B/s';
    }
    if (type === 'int') return Math.round(v).toLocaleString();
    if (type === 'score') return v.toFixed(3);
    if (type === 'time') return v.toFixed(0) + 's';
    return v.toFixed(1) + '%';
}

// ─── Shared Components ────────────────────────────────────────────────────────
const TOOLTIP_STYLE = { border: '2px solid #000', borderRadius: 0, boxShadow: '4px 4px 0 #000', fontFamily: 'monospace', fontSize: 11, backgroundColor: '#fff' };

// Standard Pie Card
function PieCard({ title, tooltip, slices, colors, viewMetric, deviceName, idx, hovered, onHover }) {
    return (
        <div className="bg-white border-4 border-black hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 hover:-translate-x-1 transition-all flex flex-col group">
            <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b-2 border-black">
                <span className="font-mono font-black text-xs uppercase bg-[#FFECA0] border-2 border-black px-2 py-0.5 shadow-[2px_2px_0_#000] truncate max-w-[80%]">{title}</span>
                <div className="relative z-10">
                    <button onMouseEnter={() => onHover(idx)} onMouseLeave={() => onHover(null)}
                        className="w-5 h-5 rounded-full border-2 border-black font-black text-xs flex items-center justify-center shadow-[2px_2px_0_#000]" style={{ background: colors[0] }}>i</button>
                    {hovered === idx && <div className="absolute right-0 bottom-7 w-48 border-2 border-black bg-white font-mono text-xs font-bold px-3 py-2 shadow-[4px_4px_0_#000]">{tooltip}</div>}
                </div>
            </div>
            <div className="flex flex-col items-center flex-1 px-2 py-2">
                <PieChart width={160} height={160}>
                    <Pie data={slices.every(s => !s.value) ? [{ name: 'No Data', value: 1, isEmpty: true }] : slices} cx="50%" cy="50%" innerRadius={35} outerRadius={60} stroke="#000" strokeWidth={2} dataKey="value">
                        {(slices.every(s => !s.value) ? [{ name: 'No Data', value: 1, isEmpty: true }] : slices).map((entry, index) => <Cell key={`cell-${index}`} fill={entry.isEmpty ? '#f3f4f6' : colors[index % colors.length]} />)}
                    </Pie>
                    <Tooltip content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            const p = payload[0];
                            if (p.payload && p.payload.isEmpty) {
                                return (
                                    <div className="bg-white border-2 border-black font-mono text-[11px] font-bold px-2 py-1 shadow-[4px_4px_0_#000] z-50 whitespace-nowrap">
                                        No Data: 0
                                    </div>
                                );
                            }
                            const labelText = p.payload.label || `${Number(p.value).toFixed(1)}`;
                            return (
                                <div className="bg-white border-2 border-black font-mono text-[11px] font-bold px-2 py-1 shadow-[4px_4px_0_#000] z-50 whitespace-nowrap">
                                    {p.name}: {labelText}
                                </div>
                            );
                        }
                        return null;
                    }} />
                </PieChart>
                <div className="w-full flex flex-col gap-1 mt-1 font-mono text-[10px] font-bold">
                    {slices.map((s, i) => (
                        <div key={i} className="flex items-center justify-between px-2 py-1 border-2 border-black" style={{ background: i === 0 ? '#f8f9fa' : '#fff' }}>
                            <div className="flex items-center gap-1.5 truncate">
                                <div className="w-2.5 h-2.5 border border-black" style={{ background: colors[i % colors.length] }} />
                                <span className="truncate">{s.name}</span>
                            </div>
                            <span className="ml-2 font-black whitespace-nowrap">{s.label}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="px-3 pb-3 pt-1 mt-auto">
                <hr className="border-t-2 border-black mb-2" />
                <Link to="/dashboard/analytics/timestamp_view" state={{ deviceName, defaultMetric: viewMetric }}
                    className="flex items-center justify-center gap-2 w-full font-mono font-black text-[11px] uppercase border-2 border-black py-1.5 bg-white hover:bg-[#CEFFBC] shadow-[2px_2px_0_#000] hover:shadow-[4px_4px_0_#000] transition-all">
                    <Calendar size={12} /> View History
                </Link>
            </div>
        </div>
    );
}

// Gauge Score Card
function ScoreCard({ title, value, max, color, tooltip, viewMetric, deviceName, idx, hovered, onHover, suffix = '' }) {
    const pct = Math.min(100, (value / max) * 100);
    return (
        <div className="bg-white border-4 border-black hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 transition-all flex flex-col">
            <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b-2 border-black">
                <span className="font-mono font-black text-xs uppercase bg-[#FFECA0] border-2 border-black px-2 py-0.5 shadow-[2px_2px_0_#000] truncate max-w-[80%]">{title}</span>
                <div className="relative z-10">
                    <button onMouseEnter={() => onHover(idx)} onMouseLeave={() => onHover(null)}
                        className="w-5 h-5 rounded-full border-2 border-black font-black text-xs flex items-center justify-center shadow-[2px_2px_0_#000]" style={{ background: color }}>i</button>
                    {hovered === idx && <div className="absolute right-0 bottom-7 w-48 border-2 border-black bg-white font-mono text-xs font-bold px-3 py-2 shadow-[4px_4px_0_#000]">{tooltip}</div>}
                </div>
            </div>
            <div className="flex flex-col items-center flex-1 p-2 pt-4">
                <RadialBarChart width={150} height={120} cx="50%" cy="80%" innerRadius={45} outerRadius={75} data={[{ value: pct, fill: color }]} startAngle={180} endAngle={0}>
                    <RadialBar background dataKey="value" cornerRadius={0} />
                </RadialBarChart>
                <p className="font-mono font-black text-xl -mt-4">{typeof value === 'number' ? value.toFixed(max > 10 ? 0 : 3) : value}{suffix}</p>
                <p className="font-mono text-[10px] text-gray-500 font-bold mt-1 uppercase">{pct.toFixed(1)}% of limit {max}</p>
            </div>
            <div className="px-3 pb-3 pt-1 mt-auto">
                <hr className="border-t-2 border-black mb-2" />
                <Link to="/dashboard/analytics/timestamp_view" state={{ deviceName, defaultMetric: viewMetric }}
                    className="flex items-center justify-center gap-2 w-full font-mono font-black text-[11px] uppercase border-2 border-black py-1.5 bg-white hover:bg-[#CEFFBC] shadow-[2px_2px_0_#000] hover:shadow-[4px_4px_0_#000] transition-all">
                    <Calendar size={12} /> View History
                </Link>
            </div>
        </div>
    );
}

// Mini Stat Box for raw numbers
function StatBox({ title, value, unit, icon: Icon, color }) {
    return (
        <div className="flex items-center gap-3 p-3 border-4 border-black bg-white shadow-[4px_4px_0_#000]">
            <div className="w-10 h-10 border-2 border-black flex items-center justify-center shadow-[2px_2px_0_#000]" style={{ backgroundColor: color }}>
                <Icon size={20} />
            </div>
            <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase font-bold text-gray-500">{title}</span>
                <span className="font-mono text-lg font-black leading-tight">{value} {unit && <span className="text-xs ml-1">{unit}</span>}</span>
            </div>
        </div>
    );
}

// Section Header
function SH({ icon: Icon, text }) {
    return (
        <div className="mt-12 mb-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white font-mono font-black uppercase text-sm border-2 border-black shadow-[4px_4px_0_rgba(0,0,0,0.2)]">
                <Icon size={16} /> {text}
            </div>
            <hr className="border-black border-2 mt-[-2px] relative -z-10" />
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function Analytics() {
    const auth = useAuth();
    const location = useLocation();
    const deviceName = location.state?.deviceName || '';
    const email = auth.user?.profile?.email || '';

    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState({});
    const [hovered, setHovered] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!email || !deviceName) { setLoading(false); return; }
        const fetchMetrics = async () => {
            if (!deviceName || !email) return;
            try {
                const { data } = await axios.get(`${backendConfig.dealerURL}/metrics/latest_full`, { params: { email, device_name: deviceName } });
                setMetrics(data);
                setError(null);
            } catch (err) { console.error(err); } finally { setLoading(false); }
        };
        fetchMetrics(); const id = setInterval(fetchMetrics, 10000); return () => clearInterval(id);
    }, [email, deviceName]);

    if (!deviceName) return (
        <div className="flex flex-col items-center justify-center h-screen">
            <div className="p-12 border-4 border-black bg-white shadow-[12px_12px_0_#000] text-center">
                <p className="font-black uppercase text-2xl mb-4">No Agent Selected</p>
                <Link to="/dashboard" className="font-mono text-xs font-black p-3 border-2 border-black bg-[#FFECA0] shadow-[4px_4px_0_#000] uppercase">Dashboard</Link>
            </div>
        </div>
    );

    // Helpers
    const pPie = (used, lbl, type = 'pct') => [
        { name: `Free/Avail`, value: Math.max(0, 100 - (used || 0)), label: fmt(100 - (used || 0), type) },
        { name: `${lbl} Used`, value: used || 0, label: fmt(used || 0, type) },
    ];
    const vs = (a, b, na, nb, type = 'int') => [
        { name: na, value: a || 0, label: fmt(a || 0, type) },
        { name: nb, value: b || 0, label: fmt(b || 0, type) },
    ];

    return (
        <div className="animate-fade-in w-full max-w-7xl mx-auto px-6 pb-16">
            <div className="my-10 text-center">
                <h1 className="text-5xl font-black uppercase tracking-tight">
                    DEEP <span className="bg-[#CEFFBC] border-4 border-black px-3 py-1 shadow-[6px_6px_0_#000] inline-block -rotate-1">ANALYSIS</span>
                </h1>
                <p className="mt-6 font-mono font-bold text-gray-500 uppercase flex items-center justify-center gap-2">
                    <Server size={14} /> Agent: <span className="text-black bg-yellow-100 px-2 border border-black">{deviceName}</span>
                </p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center gap-4 p-12 border-4 border-black bg-white shadow-[8px_8px_0_#000]">
                    <Loader2 className="animate-spin" size={32} />
                    <p className="font-mono font-black uppercase">Scanning Deep Metrics…</p>
                </div>
            ) : (
                <div className="space-y-4">

                    {/* ── 1. CORE SYSTEM ── */}
                    <SH icon={Cpu} text="Core System & Memory" />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <PieCard title="System CPU" tooltip="Overall CPU usage." slices={pPie(m.system_cpu, 'CPU')} colors={['#F7B980', '#5A7ACD']} viewMetric="cpu" deviceName={deviceName} idx={101} hovered={hovered} onHover={setHovered} />
                        <PieCard title="Core Avg CPU" tooltip="Average load across all cores." slices={pPie(m.avg_core_cpu, 'Core')} colors={['#94A378', '#2D3C59']} viewMetric="core_avg" deviceName={deviceName} idx={102} hovered={hovered} onHover={setHovered} />
                        <PieCard title="System RAM" tooltip="Physical Memory usage." slices={pPie(m.system_memory_percent, 'RAM')} colors={['#ACBAC4', '#E1D9BC']} viewMetric="memory" deviceName={deviceName} idx={103} hovered={hovered} onHover={setHovered} />
                        <PieCard title="Swap Usage" tooltip="Virtual Memory usage." slices={pPie(m.swap_used_percent, 'Swap')} colors={['#BBE0EF', '#FF7DB0']} viewMetric="swap" deviceName={deviceName} idx={104} hovered={hovered} onHover={setHovered} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                        <StatBox title="System Uptime" value={fmt(m.system_uptime || 0, 'time')} icon={Activity} color="#CEFFBC" />
                        <StatBox title="Logged In Users" value={fmt(m.logged_in_users || 0, 'int')} icon={Users} color="#FFECA0" />
                        <StatBox title="Total RAM" value={fmt(m.system_memory_total || 0, 'bytes')} icon={HardDrive} color="#E1D9BC" />
                        <StatBox title="CPU Spike" value={fmt(Math.abs(m.cpu_usage_spike || 0), 'pct')} icon={Zap} color="#FF7DB0" />
                    </div>

                    {/* ── 2. DISK INTEGRITY ── */}
                    <SH icon={HardDrive} text="Disk Operations" />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <PieCard title="I/O Read/Write" tooltip="Disk data transfer rate." slices={vs(m.disk_read_rate, m.disk_write_rate, 'Read', 'Write', 'rate')} colors={['#34d399', '#f87171']} viewMetric="disk_rw" deviceName={deviceName} idx={201} hovered={hovered} onHover={setHovered} />
                        <PieCard title="I/O Activity Count" tooltip="Number of read/write operations." slices={vs(m.disk_read_count, m.disk_write_count, 'Read Cnt', 'Write Cnt', 'int')} colors={['#60a5fa', '#f59e0b']} viewMetric="disk_rw_cnt" deviceName={deviceName} idx={202} hovered={hovered} onHover={setHovered} />
                        <ScoreCard title="Disk I/O Rate" value={m.disk_io_rate || 0} max={100000} color="#a78bfa" tooltip="Combined Disk I/O Rate." viewMetric="disk" deviceName={deviceName} idx={203} hovered={hovered} onHover={setHovered} suffix=" B/s" />
                        <div className="border-4 border-black bg-white p-4 shadow-[4px_4px_0_#000] flex flex-col justify-center">
                            <p className="font-mono text-xs font-bold text-gray-500 uppercase mb-2 border-b-2 border-black pb-1">Total Disk Volume</p>
                            <p className="font-mono text-sm leading-tight mb-1">Reads: <span className="font-black">{fmt(m.disk_read_bytes || 0, 'bytes')}</span></p>
                            <p className="font-mono text-sm leading-tight">Writes: <span className="font-black">{fmt(m.disk_write_bytes || 0, 'bytes')}</span></p>
                        </div>
                    </div>

                    {/* ── 3. NETWORK FLOW & ERRORS ── */}
                    <SH icon={Network} text="Network Flow & Health" />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <PieCard title="Bandwidth Usage" tooltip="TX vs RX Rate." slices={vs(m.net_send_rate, m.net_recv_rate, 'TX', 'RX', 'rate')} colors={['#a3e635', '#2563eb']} viewMetric="network" deviceName={deviceName} idx={301} hovered={hovered} onHover={setHovered} />
                        <PieCard title="Packets/Sec" tooltip="Packet Transmission Rate." slices={vs(m.net_packet_send_rate, m.net_packet_recv_rate, 'TX Pkts', 'RX Pkts', 'int')} colors={['#facc15', '#db2777']} viewMetric="net_pkts" deviceName={deviceName} idx={302} hovered={hovered} onHover={setHovered} />
                        <PieCard title="Packet Drops" tooltip="Dropped packets on interfaces." slices={vs(m.net_drops_in, m.net_drops_out, 'Drop In', 'Drop Out', 'int')} colors={['#f43f5e', '#ef4444']} viewMetric="net_drops" deviceName={deviceName} idx={303} hovered={hovered} onHover={setHovered} />
                        <PieCard title="Network Errors" tooltip="Network interface errors." slices={vs(m.net_errors_in, m.net_errors_out, 'Err In', 'Err Out', 'int')} colors={['#991b1b', '#b91c1c']} viewMetric="net_errors" deviceName={deviceName} idx={304} hovered={hovered} onHover={setHovered} />
                    </div>

                    {/* ── 4. CONNECTION INTELLIGENCE ── */}
                    <SH icon={Terminal} text="Connection Deep Dive" />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <PieCard title="State Breakdown" tooltip="Est vs Wait states." slices={vs(m.established_connections, (m.time_wait_connections || 0) + (m.close_wait_connections || 0), 'Est', 'Wait', 'int')} colors={['#2dd4bf', '#fb923c']} viewMetric="conn_states" deviceName={deviceName} idx={401} hovered={hovered} onHover={setHovered} />
                        <PieCard title="Protocol Ratio" tooltip="TCP vs UDP Connections." slices={vs(m.tcp_connections, m.udp_connections, 'TCP', 'UDP', 'int')} colors={['#818cf8', '#34d399']} viewMetric="conn_proto" deviceName={deviceName} idx={402} hovered={hovered} onHover={setHovered} />
                        <ScoreCard title="Connection Churn" value={m.connection_churn_rate || 0} max={100} color="#fbbf24" tooltip="Rate of established vs terminated." viewMetric="conn_churn_rate" deviceName={deviceName} idx={403} hovered={hovered} onHover={setHovered} />
                        <ScoreCard title="Failed Conn Ratio" value={m.failed_connection_ratio || 0} max={1} color="#f43f5e" tooltip="Ratio of failed connections." viewMetric="conn_fail_ratio" deviceName={deviceName} idx={404} hovered={hovered} onHover={setHovered} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-4 font-mono text-[10px] uppercase font-bold">
                        {['Total', 'Listen', 'SYN Sent', 'SYN Recv', 'TIME Wait', 'CLOSE Wait'].map((l, i) => {
                            const keys = ['total_connections', 'listen_connections', 'syn_sent_connections', 'syn_recv_connections', 'time_wait_connections', 'close_wait_connections'];
                            return (
                                <div key={l} className="border-2 border-black bg-white p-2 shadow-[2px_2px_0_#000] text-center flex flex-col">
                                    <span className="text-gray-500 border-b border-gray-200 pb-1 mb-1">{l}</span>
                                    <span className="text-sm font-black">{fmt(m[keys[i]] || 0, 'int')}</span>
                                </div>
                            )
                        })}
                    </div>

                    {/* ── 5. IP & PEER ROUTING ── */}
                    <SH icon={MapPin} text="IP Intelligence" />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <PieCard title="Unique Routing" tooltip="Unique Src vs Dst IPs." slices={vs(m.unique_source_ips, m.unique_dest_ips, 'Source', 'Dest', 'int')} colors={['#c084fc', '#f472b6']} viewMetric="unique_ips" deviceName={deviceName} idx={501} hovered={hovered} onHover={setHovered} />
                        <PieCard title="Network Scope" tooltip="Internal vs Public IPs." slices={vs(m.private_ip_connections, m.public_ip_connections, 'Private', 'Public', 'int')} colors={['#2dd4bf', '#fb7185']} viewMetric="ip_scope" deviceName={deviceName} idx={502} hovered={hovered} onHover={setHovered} />
                        <StatBox title="New Source IPs" value={fmt(m.new_source_ips || 0, 'int')} icon={Search} color="#E1D9BC" />
                        <StatBox title="External IPs" value={fmt(m.external_ip_count || 0, 'int')} icon={Network} color="#FFECA0" />
                    </div>

                    {/* ── 6. PORTS & SERVICES ── */}
                    <SH icon={Server} text="Port & Services Analysis" />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <PieCard title="Port Types" tooltip="Well Known vs Ephemeral." slices={vs(m.well_known_port_connections, m.ephemeral_port_connections, 'WellKnown', 'Ephemeral', 'int')} colors={['#fb923c', '#9ca3af']} viewMetric="port_types" deviceName={deviceName} idx={601} hovered={hovered} onHover={setHovered} />
                        <PieCard title="Route Balance" tooltip="Unique Local vs Remote Ports." slices={vs(m.unique_local_ports, m.unique_remote_ports, 'Local', 'Remote', 'int')} colors={['#a3e635', '#f87171']} viewMetric="port_bal" deviceName={deviceName} idx={602} hovered={hovered} onHover={setHovered} />
                        <ScoreCard title="Suspicious Ports" value={m.suspicious_port_connections || 0} max={10} color="#dc2626" tooltip="Connections on unusual high-risk ports." viewMetric="suspicious_ports" deviceName={deviceName} idx={603} hovered={hovered} onHover={setHovered} />
                        <ScoreCard title="Port Scan Indic." value={m.port_scan_indicators || 0} max={5} color="#ef4444" tooltip="Behavior indicating scanning activity." viewMetric="port_scan_ind" deviceName={deviceName} idx={604} hovered={hovered} onHover={setHovered} />
                    </div>

                    {/* ── 7. PROCESS DEEP DIVE ── */}
                    <SH icon={Activity} text="Process Analysis" />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <PieCard title="Process Health" tooltip="Total vs Zombie." slices={vs((m.process_count || 0) - (m.zombie_process_count || 0), m.zombie_process_count, 'Healthy', 'Zombie', 'int')} colors={['#4ade80', '#166534']} viewMetric="proc_health" deviceName={deviceName} idx={701} hovered={hovered} onHover={setHovered} />
                        <PieCard title="Resource Hogs" tooltip="High CPU vs High Mem Procs." slices={vs(m.high_cpu_process_count, m.high_mem_process_count, 'High CPU', 'High Mem', 'int')} colors={['#f87171', '#c084fc']} viewMetric="proc_hogs" deviceName={deviceName} idx={702} hovered={hovered} onHover={setHovered} />
                        <StatBox title="Root Processes" value={fmt(m.root_process_count || 0, 'int')} icon={Shield} color="#ffb3b3" />
                        <StatBox title="Total Threads" value={fmt(m.total_threads || 0, 'int')} icon={Activity} color="#d9f2d9" />
                    </div>

                    {/* ── 8. PROCESS NETWORK ACTIVITY ── */}
                    <SH icon={Network} text="Process Network Footprint" />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <PieCard title="Net Active Procs" tooltip="Procs with net vs without." slices={vs(m.processes_with_net_activity, Math.max(0, (m.process_count || 0) - (m.processes_with_net_activity || 0)), 'Active', 'Idle', 'int')} colors={['#38bdf8', '#e2e8f0']} viewMetric="proc_net" deviceName={deviceName} idx={801} hovered={hovered} onHover={setHovered} />
                        <ScoreCard title="Avg Conn / Proc" value={m.avg_connections_per_process || 0} max={50} color="#fbbf24" tooltip="Average connections per network active process." viewMetric="avg_conn_per_proc" deviceName={deviceName} idx={802} hovered={hovered} onHover={setHovered} />
                        <StatBox title="File Descriptors" value={fmt(m.total_file_descriptors || 0, 'int')} icon={HardDrive} color="#e0e7ff" />
                        <StatBox title="Suspicious Proc Names" value={fmt(m.suspicious_process_names || 0, 'int')} icon={AlertTriangle} color="#fee2e2" />
                    </div>

                    {/* ── 9. ADVANCED SECURITY THREATS ── */}
                    <SH icon={Shield} text="Advanced Threat Profiling" />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <ScoreCard title="C2 Score" value={m.c2_communication_score || 0} max={1} color="#e11d48" tooltip="Command and Control heuristic." viewMetric="c2" deviceName={deviceName} idx={901} hovered={hovered} onHover={setHovered} />
                        <ScoreCard title="Data Exfil Score" value={m.data_exfiltration_score || 0} max={1} color="#f43f5e" tooltip="Data Exfiltration patterns." viewMetric="data_exfil" deviceName={deviceName} idx={902} hovered={hovered} onHover={setHovered} />
                        <ScoreCard title="Port Scan Score" value={m.port_scanning_score || 0} max={1} color="#fb7185" tooltip="Port probe heuristics." viewMetric="port_scan" deviceName={deviceName} idx={903} hovered={hovered} onHover={setHovered} />
                        <PieCard title="Overall Threat" tooltip="Cumulative Threat Score." slices={vs(
                            (m.c2_communication_score || 0) + (m.data_exfiltration_score || 0) + (m.port_scanning_score || 0),
                            Math.max(0, 3 - ((m.c2_communication_score || 0) + (m.data_exfiltration_score || 0) + (m.port_scanning_score || 0))),
                            'Threat', 'Safe', 'score'
                        )} colors={['#b91c1c', '#10b981']} viewMetric="security" deviceName={deviceName} idx={904} hovered={hovered} onHover={setHovered} />
                    </div>

                    {(m.c2_communication_score > 0.5 || m.data_exfiltration_score > 0.5 || m.port_scanning_score > 0.5) && (
                        <div className="mt-6 border-4 border-red-600 bg-red-100 p-4 shadow-[8px_8px_0_#dc2626] flex items-center justify-center gap-4 animate-pulse">
                            <AlertCircle size={32} className="text-red-700" />
                            <p className="font-mono text-xl font-black text-red-700 uppercase leading-none">High Threat Score Detected — Deep investigation recommended</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}