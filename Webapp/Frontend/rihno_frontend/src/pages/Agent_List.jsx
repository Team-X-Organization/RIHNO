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
    const [agentStatuses, setAgentStatuses] = useState({});

    // Fetch dynamic agent statuses every 10s
    useEffect(() => {
        const email = auth.user?.profile?.email;
        if (!email) return;

        const controller = new AbortController();
        const fetchStatuses = async () => {
            try {
                const { data } = await axios.get(`${backendConfig.dealerURL}/agents/status`, {
                    params: { email },
                    signal: controller.signal,
                });
                const statusMap = {};
                if (data) data.forEach(s => statusMap[s.agent_name] = s);
                setAgentStatuses(statusMap);
            } catch (err) {
                if (!axios.isCancel(err)) {
                    console.warn('[Agent_List] agent status fetch failed:', err.message);
                }
            }
        };
        fetchStatuses();
        const id = setInterval(fetchStatuses, 10000);
        return () => { clearInterval(id); controller.abort(); };
    }, [auth.user?.profile?.email]);

    // Fetch agent list
    useEffect(() => {
        const email = auth.user?.profile?.email;
        if (!email) return;
        setLoading(true);
        const controller = new AbortController();
        axios.get(`${backendConfig.backendURL}api/list_all_devices`, {
            params: { email },
            signal: controller.signal,
        })
            .then(r => setServers(Array.isArray(r.data) ? r.data : []))
            .catch(e => {
                if (!axios.isCancel(e)) console.error('[Agent_List] device list fetch failed:', e.message);
            })
            .finally(() => setLoading(false));
        return () => controller.abort();
    }, [auth.user?.profile?.email]);

    // Fetch full metrics for each agent, refresh every 10 s
    useEffect(() => {
        const email = auth.user?.profile?.email;
        if (!email || servers.length === 0) return;

        let inFlight = false;
        const controller = new AbortController();

        const fetchAll = async () => {
            if (inFlight) return; // skip if previous batch still running
            inFlight = true;
            try {
                const results = await Promise.allSettled(
                    servers.map(s =>
                        axios.get(`${backendConfig.dealerURL}/metrics/latest_full`, {
                            params: { email, device_name: s.DeviceName },
                            signal: controller.signal,
                        }).then(r => ({ name: s.DeviceName, data: r.data }))
                    )
                );
                const update = {};
                let failures = 0;
                results.forEach(r => {
                    if (r.status === 'fulfilled') {
                        update[r.value.name] = r.value.data;
                    } else if (!axios.isCancel(r.reason)) {
                        failures += 1;
                    }
                });
                if (Object.keys(update).length) {
                    setMetrics(prev => ({ ...prev, ...update }));
                }
                if (failures > 0) {
                    console.warn(`[Agent_List] ${failures}/${servers.length} metric fetches failed`);
                }
            } finally {
                inFlight = false;
            }
        };
        fetchAll();
        const id = setInterval(fetchAll, 10000);
        return () => { clearInterval(id); controller.abort(); };
    }, [servers, auth.user?.profile?.email]);

    const enrichedServers = servers.map(server => {
        let displayStatus = server.Status;
        if (displayStatus !== 'Maintenance') {
            const dynamicStatus = agentStatuses[server.DeviceName];
            displayStatus = (dynamicStatus && dynamicStatus.is_active) ? 'Online' : 'Offline';
        }
        return { ...server, DisplayStatus: displayStatus };
    });

    const filteredServers = enrichedServers.filter(s =>
        s.DeviceName.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (statusFilter === 'All' || s.DisplayStatus === statusFilter)
    );

    function goToAnalytics(deviceName) {
        navigate('/dashboard/analytics', { state: { deviceName } });
        window.scrollTo(0, 0);
    }

    return (
        <div className="flex flex-col items-center animate-fade-in w-full p-3 sm:p-4 md:p-6 min-h-screen bg-white">
            {/* Header */}
            <div className="mb-8 sm:mb-10 md:mb-14 w-full">
                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black uppercase leading-none text-center">
                    AGENT
                    <span className="block md:inline-block bg-[#FFECA0] border-[3px] sm:border-[4px] border-black px-3 sm:px-4 ml-0 md:ml-4 mt-2 md:mt-0 shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] sm:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                        LIST
                    </span>
                </h1>
            </div>

            {/* Filters */}
            <div className="w-full max-w-5xl xl:max-w-6xl mb-6 sm:mb-8 md:mb-10 flex flex-col sm:flex-row gap-3 sm:gap-4">
                <div className="relative flex-grow">
                    <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-black" size={18} />
                    <input type="text" placeholder="SEARCH BY AGENT NAME..." value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 border-[3px] sm:border-4 border-black font-mono font-bold uppercase outline-none focus:bg-yellow-50 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all text-sm sm:text-base" />
                </div>
                <div className="relative">
                    <Filter className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-black pointer-events-none" size={18} />
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                        className="appearance-none w-full sm:w-auto pl-10 sm:pl-12 pr-10 py-3 sm:py-4 border-[3px] sm:border-4 border-black font-mono font-black uppercase outline-none bg-white cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:bg-[#7EA0FD] focus:text-white transition-all text-sm sm:text-base">
                        <option value="All">All Status</option>
                        <option value="Online">Online</option>
                        <option value="Maintenance">Maintenance</option>
                        <option value="Offline">Offline</option>
                    </select>
                </div>
            </div>

            {/* Content */}
            <div className="w-full max-w-5xl xl:max-w-6xl">
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

                            const statusClasses = server.DisplayStatus === 'Online'
                                ? 'bg-[#CEFFBC] text-black'
                                : server.DisplayStatus === 'Maintenance'
                                    ? 'bg-[#7EA0FD] text-white'
                                    : 'bg-[#FF6B6B] text-white';

                            return (
                                <div key={index}
                                    className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[10px_10px_0_rgba(0,0,0,1)] transition-all">

                                    {/* Card header */}
                                    <div className="p-3 sm:p-4 md:p-5 border-b-[3px] sm:border-b-4 border-black flex flex-col md:flex-row md:items-center justify-between gap-3">
                                        <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-wrap min-w-0">
                                            <div className={`w-3 h-3 rounded-full border-2 border-black flex-shrink-0 ${server.DisplayStatus === 'Online' ? 'bg-green-400 animate-pulse' : server.DisplayStatus === 'Maintenance' ? 'bg-blue-400' : 'bg-red-400'}`} />
                                            <div className="min-w-0">
                                                <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-black uppercase leading-none break-all">{server.DeviceName}</h3>
                                                <p className="font-mono text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">ID: {server.DeviceType}</p>
                                            </div>
                                            <span className={`inline-block px-2 sm:px-3 py-1 border-2 border-black text-[10px] font-black uppercase shadow-[2px_2px_0_rgba(0,0,0,1)] sm:shadow-[3px_3px_0_rgba(0,0,0,1)] ${statusClasses}`}>
                                                {server.DisplayStatus}
                                            </span>
                                        </div>
                                        <div className="flex gap-2 flex-wrap">
                                            <button onClick={() => setExpanded(prev => ({ ...prev, [server.DeviceName]: !isExp }))}
                                                className="font-mono text-[11px] sm:text-xs font-black px-3 sm:px-4 py-2 border-2 border-black shadow-[2px_2px_0_#000] sm:shadow-[3px_3px_0_#000] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#000] transition-all uppercase bg-white hover:bg-[#FFECA0]">
                                                {isExp ? '▲ Collapse' : '▼ Expand'}
                                            </button>
                                            <button onClick={() => goToAnalytics(server.DeviceName)}
                                                className="font-mono text-[11px] sm:text-xs font-black px-3 sm:px-4 py-2 border-2 border-black shadow-[2px_2px_0_#000] sm:shadow-[3px_3px_0_#000] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#000] transition-all uppercase bg-white hover:bg-[#CEFFBC] flex items-center gap-1 sm:gap-1.5">
                                                <BarChart2 size={12} className="sm:w-[13px] sm:h-[13px]" /> <span className="hidden xs:inline">Deep</span> Analytics
                                            </button>
                                        </div>
                                    </div>

                                    {/* Meta row */}
                                    <div className="px-3 sm:px-4 md:px-5 py-2 sm:py-3 border-b-2 border-black grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 sm:gap-x-6 gap-y-2 font-mono text-[10px] sm:text-[11px] font-bold text-gray-600 uppercase">
                                        <div className="flex items-center gap-2 truncate"><MapPin size={14} className="flex-shrink-0" /> <span className="truncate">{server.Location || 'N/A'}</span></div>
                                        <div className="flex items-center gap-2 truncate"><Cpu size={14} className="flex-shrink-0" /> <span className="truncate">{server.DeviceType || 'N/A'}</span></div>
                                        <div className="flex items-center gap-2 truncate"><Calendar size={14} className="flex-shrink-0" /> <span className="truncate">{server.DateCreated || 'N/A'}</span></div>
                                    </div>

                                    {/* ── 5 mini charts — always visible ── */}
                                    <div className="p-2 sm:p-3 md:p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 md:gap-4 border-b-2 border-black bg-gray-50/50 relative">
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
                                        <div className="p-3 sm:p-4 md:p-5 bg-white">
                                            <h4 className="font-mono font-black uppercase text-xs text-gray-400 mb-3 sm:mb-4 border-b-2 border-black pb-2">Extended Metrics</h4>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
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