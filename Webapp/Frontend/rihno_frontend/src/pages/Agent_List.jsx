import React, { useState, useEffect } from 'react';
import { useAuth } from "react-oidc-context";
import axios from 'axios';
import { Loader2, MapPin, Cpu, Calendar, Search, Filter, Activity, BarChart2, HardDrive, Network, Users } from 'lucide-react';
import { backendConfig } from "../authConfig.js";
import { PieChart, Pie, Tooltip, Cell, RadialBarChart, RadialBar } from 'recharts';
import { useNavigate } from "react-router-dom";

// ─── Human-readable formatter ─────────────────────────────────────────────────
function fmt(v, type = 'pct') {
    if (v === undefined || v === null || isNaN(v)) return '—';
    if (type === 'rate') {
        if (v >= 1e6) return (v / 1e6).toFixed(1) + ' MB/s';
        if (v >= 1e3) return (v / 1e3).toFixed(1) + ' KB/s';
        return v.toFixed(0) + ' B/s';
    }
    if (type === 'int') return Math.round(v).toLocaleString();
    return v.toFixed(1) + '%';
}

const TT_STYLE = { border: '2px solid #000', borderRadius: 0, boxShadow: '4px 4px 0 #000', fontFamily: 'monospace', fontSize: 11 };

// ─── Tiny donut chart ──────────────────────────────────────────────────────── 
function MiniDonut({ icon: Icon, data, colors, label, sub }) {
    const isZero = data.every(d => !d.value);
    const chartData = isZero ? [{ name: 'No Data', value: 1, isEmpty: true }] : data;
    return (
        <div className="flex flex-col w-full bg-white border-2 border-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 hover:-translate-x-0.5 hover:shadow-[6px_6px_0_#000] transition-all group">
            <div className="flex items-center justify-between px-2 pt-2 pb-1.5 border-b-2 border-black">
                <span className="font-mono font-black text-[10px] uppercase bg-[#FFECA0] border-2 border-black px-1.5 py-0.5 shadow-[2px_2px_0_#000] truncate max-w-[80%]">{label}</span>
                {Icon && <Icon size={12} strokeWidth={3} className="text-black" />}
            </div>
            <div className="flex flex-col items-center p-2 pt-3 h-full justify-between">
                <PieChart width={80} height={80}>
                    <Pie data={chartData} dataKey="value" cx="50%" cy="50%" innerRadius={22} outerRadius={36} stroke="#000" strokeWidth={1}>
                        {chartData.map((entry, i) => <Cell key={i} fill={entry.isEmpty ? '#f3f4f6' : colors[i % colors.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={TT_STYLE} formatter={(v, n, p) => {
                        if (p.payload && p.payload.isEmpty) return [0, 'No Data'];
                        const nameStr = String(n || '');
                        return [v + (nameStr.includes('%') ? '' : ''), nameStr];
                    }} />
                </PieChart>
                <div className="w-full mt-2 font-mono text-[10px] font-black uppercase text-center bg-transparent border-t-2 border-dashed border-gray-300 pt-1">
                    {sub}
                </div>
            </div>
        </div>
    );
}

// ─── Gauge arc ────────────────────────────────────────────────────────────────
function MiniGauge({ icon: Icon, value, max, color, label, suffix = '' }) {
    const pct = Math.min(100, (value / max) * 100);
    return (
        <div className="flex flex-col w-full bg-white border-2 border-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 hover:-translate-x-0.5 hover:shadow-[6px_6px_0_#000] transition-all group">
            <div className="flex items-center justify-between px-2 pt-2 pb-1.5 border-b-2 border-black">
                <span className="font-mono font-black text-[10px] uppercase bg-[#FFECA0] border-2 border-black px-1.5 py-0.5 shadow-[2px_2px_0_#000] truncate max-w-[80%]">{label}</span>
                {Icon && <Icon size={12} strokeWidth={3} className="text-black" />}
            </div>
            <div className="flex flex-col items-center p-2 pt-6 h-full justify-between">
                <RadialBarChart width={90} height={70} cx="50%" cy="80%" innerRadius={30} outerRadius={45}
                    data={[{ value: pct, fill: color }]} startAngle={180} endAngle={0}>
                    <RadialBar background dataKey="value" cornerRadius={0} />
                </RadialBarChart>
                <p className="font-mono font-black text-[11px] leading-tight break-all uppercase text-center mt-1 border-t-2 border-dashed border-gray-300 w-full pt-1">
                    {value.toFixed ? value.toFixed(max > 10 ? 0 : 2) : value}{suffix}
                </p>
            </div>
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const Agent_List = () => {
    const auth = useAuth();
    const navigate = useNavigate();
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [metrics, setMetrics] = useState({});
    const [expanded, setExpanded] = useState({});

    // Fetch agent list
    useEffect(() => {
        const email = auth.user?.profile?.email;
        if (!email) return;
        setLoading(true);
        axios.get(`${backendConfig.backendURL}api/list_all_devices`, { params: { email } })
            .then(r => setServers(r.data))
            .catch(e => console.error(e))
            .finally(() => setLoading(false));
    }, [auth.user?.profile?.email]);

    // Fetch full metrics for each agent, refresh every 10 s
    useEffect(() => {
        const email = auth.user?.profile?.email;
        if (!email || servers.length === 0) return;

        const fetchAll = () => {
            servers.forEach(async s => {
                try {
                    const { data: d } = await axios.get('http://localhost:8000/metrics/latest_full', {
                        params: { email, device_name: s.DeviceName }
                    });
                    setMetrics(prev => ({ ...prev, [s.DeviceName]: d }));
                } catch {
                    // keep previous or leave empty
                }
            });
        };
        fetchAll();
        const id = setInterval(fetchAll, 10000);
        return () => clearInterval(id);
    }, [servers, auth.user?.profile?.email]);

    const filteredServers = servers.filter(s =>
        s.DeviceName.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (statusFilter === 'All' || s.Status === statusFilter)
    );

    function goToAnalytics(deviceName) {
        navigate('/dashboard/analytics', { state: { deviceName } });
        window.scrollTo(0, 0);
    }

    return (
        <div className="flex flex-col items-center animate-fade-in w-full p-6 min-h-screen bg-white">
            {/* Header */}
            <div className="mb-14">
                <h1 className="text-6xl md:text-8xl font-black uppercase leading-none text-center">
                    AGENT
                    <span className="block md:inline-block bg-[#FFECA0] border-[4px] border-black px-4 ml-0 md:ml-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                        LIST
                    </span>
                </h1>
            </div>

            {/* Filters */}
            <div className="w-full max-w-5xl mb-10 flex flex-col md:flex-row gap-4">
                <div className="relative flex-grow">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black" size={20} />
                    <input type="text" placeholder="SEARCH BY AGENT NAME..." value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 border-4 border-black font-mono font-bold uppercase outline-none focus:bg-yellow-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all" />
                </div>
                <div className="relative">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-black pointer-events-none" size={20} />
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                        className="appearance-none pl-12 pr-10 py-4 border-4 border-black font-mono font-black uppercase outline-none bg-white cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:bg-[#7EA0FD] focus:text-white transition-all">
                        <option value="All">All Status</option>
                        <option value="Online">Online</option>
                        <option value="Maintenance">Maintenance</option>
                        <option value="Offline">Offline</option>
                    </select>
                </div>
            </div>

            {/* Content */}
            <div className="w-full max-w-5xl">
                {loading ? (
                    <div className="flex items-center justify-center gap-4 p-12 border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                        <Loader2 className="animate-spin" size={32} />
                        <p className="font-mono text-xl font-black uppercase tracking-widest">Scanning Agents…</p>
                    </div>
                ) : filteredServers.length > 0 ? (
                    <div className="space-y-6">
                        {filteredServers.map((server, index) => {
                            const d = metrics[server.DeviceName] || {};
                            const isExp = expanded[server.DeviceName];

                            // CPU
                            const cpuUsed = d.system_cpu || 0;
                            // Memory
                            const memUsed = d.system_memory_percent || 0;
                            // Disk
                            const diskRate = d.disk_io_rate || 0;
                            const diskBusy = Math.min(100, diskRate / 5000);
                            // Network
                            const txRate = d.net_send_rate || 0;
                            const rxRate = d.net_recv_rate || 0;
                            const netTotal = (txRate + rxRate) || 1; // Prevent div by 0
                            // Connections
                            const totalConn = d.total_connections || 0;
                            const estConn = d.established_connections || 0;

                            const statusClasses = server.Status === 'Online'
                                ? 'bg-[#CEFFBC] text-black'
                                : server.Status === 'Maintenance'
                                    ? 'bg-[#7EA0FD] text-white'
                                    : 'bg-[#FF6B6B] text-white';

                            return (
                                <div key={index}
                                    className="border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[10px_10px_0_rgba(0,0,0,1)] transition-all">

                                    {/* Card header */}
                                    <div className="p-5 border-b-4 border-black flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-3 h-3 rounded-full border-2 border-black ${server.Status === 'Online' ? 'bg-green-400 animate-pulse' : server.Status === 'Maintenance' ? 'bg-blue-400' : 'bg-red-400'}`} />
                                            <h3 className="text-2xl font-black text-black uppercase">{server.DeviceName}</h3>
                                            <span className={`inline-block px-3 py-0.5 border-2 border-black text-[10px] font-black uppercase shadow-[3px_3px_0_rgba(0,0,0,1)] ${statusClasses}`}>
                                                {server.Status}
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setExpanded(prev => ({ ...prev, [server.DeviceName]: !isExp }))}
                                                className="font-mono text-xs font-black px-4 py-2 border-2 border-black shadow-[3px_3px_0_#000] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#000] transition-all uppercase bg-white hover:bg-[#FFECA0]">
                                                {isExp ? '▲ Collapse' : '▼ Expand'}
                                            </button>
                                            <button onClick={() => goToAnalytics(server.DeviceName)}
                                                className="font-mono text-xs font-black px-4 py-2 border-2 border-black shadow-[3px_3px_0_#000] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#000] transition-all uppercase bg-white hover:bg-[#CEFFBC] flex items-center gap-1.5">
                                                <BarChart2 size={13} /> Deep Analytics
                                            </button>
                                        </div>
                                    </div>

                                    {/* Meta row */}
                                    <div className="px-5 py-3 border-b-2 border-black grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 font-mono text-[11px] font-bold text-gray-600 uppercase">
                                        <div className="flex items-center gap-2"><MapPin size={14} /> {server.Location || 'N/A'}</div>
                                        <div className="flex items-center gap-2"><Cpu size={14} /> {server.DeviceType || 'N/A'}</div>
                                        <div className="flex items-center gap-2"><Calendar size={14} /> {server.DateCreated || 'N/A'}</div>
                                    </div>

                                    {/* ── 5 mini charts — always visible ── */}
                                    <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-4 border-b-2 border-black bg-gray-50/50 relative">
                                        <div className="absolute top-0 left-0 w-full h-1 bg-black opacity-10" />
                                        {/* CPU */}
                                        <MiniDonut
                                            icon={Cpu}
                                            data={[{ name: 'Free', value: +(100 - cpuUsed).toFixed(2) }, { name: 'Used', value: +cpuUsed.toFixed(2) }]}
                                            colors={['#F7B980', '#5A7ACD']}
                                            label="CPU"
                                            sub={fmt(cpuUsed)} />

                                        {/* Memory */}
                                        <MiniDonut
                                            icon={Activity}
                                            data={[{ name: 'Free', value: +(100 - memUsed).toFixed(2) }, { name: 'Used', value: +memUsed.toFixed(2) }]}
                                            colors={['#ACBAC4', '#7EA0FD']}
                                            label="Memory"
                                            sub={fmt(memUsed)} />

                                        {/* Disk */}
                                        <MiniDonut
                                            icon={HardDrive}
                                            data={[{ name: 'Idle', value: +(100 - diskBusy).toFixed(2) }, { name: 'Active', value: +diskBusy.toFixed(2) }]}
                                            colors={['#eebdff', '#ad4be0']}
                                            label="Disk"
                                            sub={fmt(diskRate, 'rate')} />

                                        {/* Network TX/RX */}
                                        <MiniDonut
                                            icon={Network}
                                            data={[{ name: 'TX', value: txRate }, { name: 'RX', value: rxRate }]}
                                            colors={['#69cc45', '#3b62d4']}
                                            label="Network"
                                            sub={fmt(txRate + rxRate, 'rate')} />

                                        {/* Connections */}
                                        <MiniDonut
                                            icon={Users}
                                            data={[{ name: 'Established', value: estConn }, { name: 'Other', value: Math.max(0, totalConn - estConn) }]}
                                            colors={['#4ecdc4', '#1da098']}
                                            label="Connections"
                                            sub={fmt(totalConn, 'int')} />
                                    </div>

                                    {/* ── Expanded detail section ── */}
                                    {isExp && (
                                        <div className="p-5 bg-white">
                                            <h4 className="font-mono font-black uppercase text-xs text-gray-400 mb-4 border-b-2 border-black pb-2">Extended Metrics</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                {/* Swap */}
                                                <MiniDonut
                                                    data={[{ name: 'Free', value: +(100 - (d.swap_used_percent || 0)).toFixed(2) }, { name: 'Used', value: +(d.swap_used_percent || 0).toFixed(2) }]}
                                                    colors={['#BBE0EF', '#FF7DB0']} label="Swap" sub={fmt(d.swap_used_percent || 0)} />

                                                {/* Process count */}
                                                <MiniDonut
                                                    data={[{ name: 'Headroom', value: Math.max(0, 500 - (d.process_count || 0)) }, { name: 'Running', value: d.process_count || 0 }]}
                                                    colors={['#ebedf0', '#fbbf24']} label="Processes" sub={fmt(d.process_count || 0, 'int')} />

                                                {/* Disk read vs write rate */}
                                                <MiniDonut
                                                    data={[{ name: 'Read', value: d.disk_read_rate || 0 }, { name: 'Write', value: d.disk_write_rate || 0 }]}
                                                    colors={['#f59e0b', '#ef4444']} label="Disk R/W" sub={`${fmt(d.disk_read_rate || 0, 'rate')} / ${fmt(d.disk_write_rate || 0, 'rate')}`} />

                                                {/* TX vs RX bytes cumulative */}
                                                <MiniDonut
                                                    data={[{ name: 'Sent', value: d.net_bytes_sent || 0 }, { name: 'Recv', value: d.net_bytes_recv || 0 }]}
                                                    colors={['#22d3ee', '#0284c7']} label="Net Bytes" sub="TX vs RX" />

                                                {/* Bandwidth asymmetry */}
                                                <MiniGauge value={d.bandwidth_asymmetry || 0} max={1} color="#a3e635" label="Bw Asym." />
                                            </div>

                                            {/* Quick stat pills */}
                                            <div className="mt-5 flex flex-wrap gap-2">
                                                {[
                                                    { label: 'Threads', val: fmt(d.total_threads || 0, 'int') },
                                                    { label: 'Zombies', val: fmt(d.zombie_process_count || 0, 'int') },
                                                    { label: 'Suspicious Procs', val: fmt(d.suspicious_process_names || 0, 'int') },
                                                    { label: 'Unique IPs', val: fmt(d.unique_source_ips || 0, 'int') },
                                                    { label: 'Established Conns', val: fmt(d.established_connections || 0, 'int') },
                                                    { label: 'CPU Spike', val: fmt(Math.abs(d.cpu_usage_spike || 0)) },
                                                    { label: 'Mem Spike', val: fmt(Math.abs(d.memory_usage_spike || 0)) },
                                                ].map(s => (
                                                    <div key={s.label} className="flex items-center border-2 border-black shadow-[2px_2px_0_#000]">
                                                        <span className="font-mono text-xs font-black uppercase px-2 py-1 bg-[#FFECA0] border-r-2 border-black">{s.label}</span>
                                                        <span className="font-mono text-xs font-bold px-3 py-1 bg-white">{s.val}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="p-16 border-4 border-black bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] text-center">
                        <Activity className="mx-auto mb-4 opacity-10 text-black" size={80} />
                        <p className="font-black uppercase text-2xl text-gray-300 italic">No Matching Nodes Found</p>
                        <button onClick={() => { setSearchTerm(""); setStatusFilter("All"); }}
                            className="mt-4 font-mono text-xs font-black underline uppercase hover:text-[#7EA0FD]">
                            Reset Filters
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Agent_List;