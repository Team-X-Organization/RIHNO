import React, { useState, useEffect, useCallback } from 'react';
import {
    AreaChart, Area, BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useAuth } from 'react-oidc-context';
import { useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { Loader2, ArrowLeft, CalendarDays, TrendingUp, TrendingDown, Minus } from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

// NOTE: Each metric in Analytics.jsx maps to one `metricId` here.
// When navigating from a card's "View More", only that metric is shown.
const METRIC_META = {
    // ── System & Memory (Reds/Blues) ──
    cpu: { label: 'System CPU', unit: '%', chart: 'area', primary: '#ff6b6b', palette: ['#161b22', '#3d0f0f', '#7a1a1a', '#bf2626', '#ff3333'] },
    core_avg: { label: 'Avg Core CPU', unit: '%', chart: 'area', primary: '#f97316', palette: ['#161b22', '#3d1600', '#7a2d00', '#b04400', '#f97316'] },
    cpu_spike: { label: 'CPU Usage Spike', unit: '%', chart: 'bar', primary: '#fb923c', palette: ['#161b22', '#3d1600', '#7a2d00', '#b04400', '#fb923c'] },
    memory: { label: 'System Memory', unit: '%', chart: 'area', primary: '#4a8fff', palette: ['#161b22', '#001845', '#00316a', '#0054b0', '#1a7fff'] },
    swap: { label: 'Swap Used', unit: '%', chart: 'area', primary: '#a78bfa', palette: ['#161b22', '#1e0045', '#3b0089', '#6200d9', '#9c40ff'] },
    mem_spike: { label: 'Memory Spike', unit: '%', chart: 'bar', primary: '#c084fc', palette: ['#161b22', '#1e0045', '#3b0089', '#6200d9', '#c084fc'] },

    // ── Disk I/O (Purples) ──
    disk: { label: 'Disk I/O Rate', unit: ' B/s', chart: 'area', primary: '#c47ef8', palette: ['#161b22', '#250052', '#4b0099', '#7e00d8', '#bf5fff'] },
    disk_rw: { label: 'I/O Read vs Write', unit: ' B/s', chart: 'area', primary: '#34d399', secondary: '#f87171', name1: 'Read', name2: 'Write', palette: ['#161b22', '#003322', '#006644', '#009966', '#34d399'] },
    disk_rw_cnt: { label: 'I/O Read/Write Ops', unit: '', chart: 'line', primary: '#60a5fa', secondary: '#f59e0b', name1: 'Read Cnt', name2: 'Write Cnt', palette: ['#161b22', '#001845', '#00316a', '#0054b0', '#60a5fa'] },

    // ── Network Rates & Errors (Greens) ──
    network: { label: 'Bandwidth TX vs RX', unit: ' B/s', chart: 'area', primary: '#a3e635', secondary: '#2563eb', name1: 'TX', name2: 'RX', palette: ['#161b22', '#1e3300', '#3d6600', '#5c9900', '#a3e635'] },
    net_pkts: { label: 'Packets TX vs RX', unit: ' Pkts/s', chart: 'area', primary: '#facc15', secondary: '#db2777', name1: 'TX', name2: 'RX', palette: ['#161b22', '#332900', '#665200', '#997a00', '#facc15'] },
    net_drops: { label: 'Packet Drops', unit: '', chart: 'bar', primary: '#f43f5e', secondary: '#ef4444', name1: 'Drop In', name2: 'Drop Out', palette: ['#161b22', '#3d001a', '#7a0033', '#b8004d', '#f43f5e'] },
    net_errors: { label: 'Network Errors', unit: '', chart: 'bar', primary: '#991b1b', secondary: '#b91c1c', name1: 'Err In', name2: 'Err Out', palette: ['#161b22', '#3d0000', '#7a0000', '#c20000', '#991b1b'] },

    // ── Connections (Cyans) ──
    connections: { label: 'Total Connections', unit: '', chart: 'line', primary: '#4ecdc4', palette: ['#161b22', '#00293c', '#00547a', '#0094d4', '#00d1ff'] },
    conn_states: { label: 'Connection States', unit: '', chart: 'area', primary: '#2dd4bf', secondary: '#fb923c', name1: 'Established', name2: 'Wait States', palette: ['#161b22', '#003c39', '#007872', '#00b4ab', '#2dd4bf'] },
    conn_proto: { label: 'Protocol Ratio', unit: '', chart: 'line', primary: '#818cf8', secondary: '#34d399', name1: 'TCP', name2: 'UDP', palette: ['#161b22', '#1a1d4b', '#343a96', '#4e57e1', '#818cf8'] },
    conn_churn_rate: { label: 'Connection Churn', unit: '', chart: 'area', primary: '#fbbf24', palette: ['#161b22', '#3d2800', '#7a5500', '#bf8800', '#fbbf24'] },
    conn_fail_ratio: { label: 'Failed Connection Ratio', unit: '', chart: 'bar', primary: '#f43f5e', palette: ['#161b22', '#3d001a', '#7a0033', '#b8004d', '#f43f5e'] },

    // ── IP & Route Analysis (Pinks/Cyans) ──
    unique_ips: { label: 'Unique Routing', unit: '', chart: 'bar', primary: '#c084fc', secondary: '#f472b6', name1: 'Source IPs', name2: 'Dest IPs', palette: ['#161b22', '#30134d', '#60269a', '#9039e7', '#c084fc'] },
    ip_scope: { label: 'Network Scope', unit: '', chart: 'area', primary: '#2dd4bf', secondary: '#fb7185', name1: 'Private IPs', name2: 'Public IPs', palette: ['#161b22', '#003c39', '#007872', '#00b4ab', '#2dd4bf'] },

    // ── Ports Analyzer (Yellows/Greys) ──
    port_types: { label: 'Port Types', unit: '', chart: 'line', primary: '#fb923c', secondary: '#9ca3af', name1: 'Well Known', name2: 'Ephemeral', palette: ['#161b22', '#3d1600', '#7a2d00', '#b04400', '#fb923c'] },
    port_bal: { label: 'Route Balance', unit: '', chart: 'line', primary: '#a3e635', secondary: '#f87171', name1: 'Local Ports', name2: 'Remote Ports', palette: ['#161b22', '#1e3300', '#3d6600', '#5c9900', '#a3e635'] },
    suspicious_ports: { label: 'Suspicious Port Access', unit: '', chart: 'bar', primary: '#dc2626', palette: ['#161b22', '#3d0000', '#7a0000', '#c20000', '#dc2626'] },
    port_scan_ind: { label: 'Port Scan Indicators', unit: '', chart: 'bar', primary: '#ef4444', palette: ['#161b22', '#3d0000', '#7a0000', '#c20000', '#ef4444'] },

    // ── Process Deep Dive (Oranges/Greens) ──
    proc_health: { label: 'Process Health', unit: '', chart: 'area', primary: '#4ade80', secondary: '#166534', name1: 'Healthy', name2: 'Zombie', palette: ['#161b22', '#092d13', '#115a25', '#1a8738', '#4ade80'] },
    proc_hogs: { label: 'Resource Hogs', unit: '', chart: 'bar', primary: '#f87171', secondary: '#c084fc', name1: 'High CPU', name2: 'High Mem', palette: ['#161b22', '#3d0000', '#7a0000', '#c20000', '#f87171'] },
    proc_net: { label: 'Net Active Procs', unit: '', chart: 'line', primary: '#38bdf8', secondary: '#e2e8f0', name1: 'Active', name2: 'Idle', palette: ['#161b22', '#00293c', '#00547a', '#0094d4', '#38bdf8'] },
    avg_conn_per_proc: { label: 'Avg Conns / Proc', unit: '', chart: 'area', primary: '#fbbf24', palette: ['#161b22', '#3d2800', '#7a5500', '#bf8800', '#fbbf24'] },

    // ── Security Advanced Profiles (Reds) ──
    security: { label: 'Overall Threat Score', unit: ' pt', chart: 'area', primary: '#ff0000', palette: ['#161b22', '#3d0000', '#7a0000', '#c20000', '#ff0000'] },
    port_scan: { label: 'Port Scan Score', unit: '', chart: 'area', primary: '#fb7185', palette: ['#161b22', '#3d0010', '#7a0020', '#b80030', '#fb7185'] },
    data_exfil: { label: 'Data Exfil Score', unit: '', chart: 'area', primary: '#f43f5e', palette: ['#161b22', '#3d001a', '#7a0033', '#b8004d', '#f43f5e'] },
    c2: { label: 'C2 Comm Score', unit: '', chart: 'area', primary: '#e11d48', palette: ['#161b22', '#3d0015', '#7a0029', '#b8003e', '#e11d48'] }
};

const TIME_RANGES = [
    { id: '10m', label: '10M', desc: 'Per-minute · last 10 min' },
    { id: '1h', label: '1H', desc: 'Per-minute · last hour' },
    { id: '1d', label: '1D', desc: 'Hourly · last day' },
    { id: '7d', label: '7D', desc: 'Hourly · last 7 days' },
    { id: '30d', label: '30D', desc: 'Daily · last 30 days' },
    { id: '1y', label: '1Y', desc: 'Daily · last year' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtVal(v, unit) {
    if (v === undefined || v === null || isNaN(v)) return '0' + (unit || '');
    if (unit === ' B/s' || unit === ' B') {
        if (v >= 1e9) return (v / 1e9).toFixed(2) + ' GB' + (unit === ' B/s' ? '/s' : '');
        if (v >= 1e6) return (v / 1e6).toFixed(2) + ' MB' + (unit === ' B/s' ? '/s' : '');
        if (v >= 1e3) return (v / 1e3).toFixed(1) + ' KB' + (unit === ' B/s' ? '/s' : '');
        return v.toFixed(0) + ' B' + (unit === ' B/s' ? '/s' : '');
    }
    if (unit === '%') return v.toFixed(2) + '%';
    if (Number.isInteger(v)) return v.toString();
    return v.toFixed(3);
}

function fmtTick(t, rangeId) {
    const d = new Date(t);
    if (isNaN(d)) return t;
    if (rangeId === '10m' || rangeId === '1h') return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (rangeId === '1d' || rangeId === '7d') return d.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric' });
    if (rangeId === 'custom') {
        if (typeof t === 'string' && t.includes(':')) return d.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric' });
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, unit, primary, secondary, name1, name2 }) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ border: '2px solid #000', background: '#fff', fontFamily: 'monospace', boxShadow: '4px 4px 0 #000', padding: '8px 12px' }}>
            <p style={{ fontWeight: 900, marginBottom: 2, fontSize: 12, paddingBottom: 4, borderBottom: '1px solid #eaeaea' }}>{label}</p>
            {payload.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <div style={{ width: 8, height: 8, background: p.color || primary }} />
                    <p style={{ color: p.color || primary, fontWeight: 700, fontSize: 14 }}>
                        {(p.name && p.name !== 'raw' && p.name !== 'raw2') ? `${p.name}: ` : (i === 0 && name1 ? `${name1}: ` : (i === 1 && name2 ? `${name2}: ` : ''))}
                        {fmtVal(typeof p.value === 'number' ? p.value : 0, unit)}
                    </p>
                </div>
            ))}
        </div>
    );
}

// ─── Chart ───────────────────────────────────────────────────────────────────

function MetricChart({ data, metricId, rangeId }) {
    const meta = METRIC_META[metricId] || METRIC_META.cpu;
    const gradId = `grad_${metricId}`;
    const gradId2 = `grad2_${metricId}`;
    const has2 = !!meta.name2;

    const commonAxes = (
        <>
            <XAxis dataKey="date" tickFormatter={t => fmtTick(t, rangeId)} minTickGap={60}
                tick={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, fill: '#555' }} />
            <YAxis tickFormatter={v => fmtVal(v, meta.unit)} width={80}
                tick={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, fill: '#555' }} />
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <RechartsTooltip content={<CustomTooltip unit={meta.unit} primary={meta.primary} secondary={meta.secondary} name1={meta.name1} name2={meta.name2} />} />
        </>
    );

    if (meta.chart === 'bar') return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                {commonAxes}
                <Bar dataKey="raw" name={meta.name1 || 'Value'} fill={meta.primary} stroke="#000" strokeWidth={1} radius={[3, 3, 0, 0]} />
                {has2 && <Bar dataKey="raw2" name={meta.name2} fill={meta.secondary} stroke="#000" strokeWidth={1} radius={[3, 3, 0, 0]} />}
            </BarChart>
        </ResponsiveContainer>
    );
    if (meta.chart === 'line') return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                {commonAxes}
                <Line dataKey="raw" name={meta.name1 || 'Value'} stroke={meta.primary} strokeWidth={2.5} dot={false} />
                {has2 && <Line dataKey="raw2" name={meta.name2} stroke={meta.secondary} strokeWidth={2.5} dot={false} />}
            </LineChart>
        </ResponsiveContainer>
    );
    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={meta.primary} stopOpacity={0.8} />
                        <stop offset="95%" stopColor={meta.primary} stopOpacity={0.04} />
                    </linearGradient>
                    {has2 && (
                        <linearGradient id={gradId2} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={meta.secondary} stopOpacity={0.8} />
                            <stop offset="95%" stopColor={meta.secondary} stopOpacity={0.04} />
                        </linearGradient>
                    )}
                </defs>
                {commonAxes}
                {has2 && <Area dataKey="raw2" name={meta.name2} type="monotone" stroke="#000" strokeWidth={2} fill={`url(#${gradId2})`} />}
                <Area dataKey="raw" name={meta.name1 || 'Value'} type="monotone" stroke="#000" strokeWidth={2} fill={`url(#${gradId})`} />
            </AreaChart>
        </ResponsiveContainer>
    );
}

// ─── GitHub Heatmap ───────────────────────────────────────────────────────────

function GithubHeatmap({ data, metricId }) {
    const meta = METRIC_META[metricId] || METRIC_META.cpu;
    const palette = meta.palette;

    const map = {};
    (data || []).forEach(d => { map[d.date] = d; });

    const today = new Date();
    const start = new Date(today);
    start.setFullYear(start.getFullYear() - 1);
    start.setHours(0, 0, 0, 0);

    // Align to Sunday
    const cur = new Date(start);
    if (cur.getDay() !== 0) cur.setDate(cur.getDate() - cur.getDay());

    const weeks = [];
    let week = [];
    while (cur <= today) {
        const iso = cur.toISOString().slice(0, 10);
        const pt = map[iso];
        week.push({ date: iso, level: pt ? pt.level : 0, raw: pt ? pt.raw : 0 });
        if (week.length === 7) { weeks.push(week); week = []; }
        cur.setDate(cur.getDate() + 1);
    }
    if (week.length) {
        while (week.length < 7) week.push({ date: '', level: -1, raw: 0 });
        weeks.push(week);
    }

    // Month labels
    const monthLabels = [];
    let lastMonth = -1;
    weeks.forEach((w, wi) => {
        const fd = w.find(d => d.date)?.date;
        if (!fd) return;
        const m = new Date(fd).getMonth();
        if (m !== lastMonth) {
            monthLabels.push({ wi, label: new Date(fd).toLocaleDateString('en-US', { month: 'short' }) });
            lastMonth = m;
        }
    });

    const SZ = 13, GAP = 3, LW = 36;
    const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div style={{ overflowX: 'auto', background: '#0d1117', border: '2px solid #30363d', padding: '14px 18px', borderRadius: 6 }}>
            {/* Month row */}
            <div style={{ display: 'flex', marginLeft: LW + 4, marginBottom: 4 }}>
                {(() => {
                    const els = []; let prev = 0;
                    monthLabels.forEach(ml => {
                        const gap = ml.wi - prev;
                        if (gap > 0) els.push(<div key={`g${ml.wi}`} style={{ width: gap * (SZ + GAP) }} />);
                        els.push(<div key={ml.wi} style={{ fontFamily: 'monospace', fontSize: 11, color: '#8b949e', minWidth: 28 }}>{ml.label}</div>);
                        prev = ml.wi + 1;
                    });
                    return els;
                })()}
            </div>
            <div style={{ display: 'flex', gap: 0 }}>
                {/* Day labels */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, marginRight: 4, width: LW }}>
                    {DAY_LABELS.map((d, i) => (
                        <div key={d} style={{ height: SZ, fontSize: 9, color: '#8b949e', fontFamily: 'monospace', display: 'flex', alignItems: 'center', opacity: [1, 3, 5].includes(i) ? 1 : 0 }}>{d}</div>
                    ))}
                </div>
                {/* Grid */}
                <div style={{ display: 'flex', gap: GAP }}>
                    {weeks.map((w, wi) => (
                        <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                            {w.map((cell, di) => (
                                <div key={di}
                                    title={cell.date ? `${cell.date}: ${fmtVal(cell.raw || 0, meta.unit)}` : ''}
                                    style={{
                                        width: SZ, height: SZ, borderRadius: 2,
                                        background: cell.level < 0 ? 'transparent' : (palette[cell.level] || palette[0]),
                                        border: cell.level > 0 ? '1px solid rgba(255,255,255,0.07)' : '1px solid #21262d',
                                        cursor: cell.date ? 'pointer' : 'default',
                                    }}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10, marginLeft: LW + 4, justifyContent: 'flex-end' }}>
                <span style={{ color: '#8b949e', fontSize: 10, fontFamily: 'monospace' }}>Less</span>
                {palette.map((c, i) => <div key={i} style={{ width: SZ, height: SZ, background: c, border: '1px solid #30363d', borderRadius: 2 }} />)}
                <span style={{ color: '#8b949e', fontSize: 10, fontFamily: 'monospace' }}>More</span>
            </div>
        </div>
    );
}

// ─── Main View ───────────────────────────────────────────────────────────────

function MetricTimestampView() {
    const auth = useAuth();
    const location = useLocation();
    const deviceName = location.state?.deviceName || '';
    const email = auth.user?.profile?.email || '';
    // The specific metric passed from Analytics card's "View More"
    const metricId = location.state?.defaultMetric || 'cpu';
    const meta = METRIC_META[metricId] || METRIC_META.cpu;

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('1y');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [useCustomDate, setUseCustomDate] = useState(false);
    const [error, setError] = useState('');

    const fetchData = useCallback(async () => {
        if (!email || !deviceName) { setLoading(false); return; }
        setLoading(true);
        setError('');
        try {
            const params = { email, device_name: deviceName, metric: metricId };
            if (useCustomDate && dateFrom && dateTo) {
                params.date_from = dateFrom;
                params.date_to = dateTo;
            } else {
                params.time_range = timeRange;
            }
            const res = await axios.get('http://localhost:8000/metrics/history', { params });
            setData(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setError('Failed to fetch data from server.');
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [email, deviceName, metricId, timeRange, useCustomDate, dateFrom, dateTo]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Stats
    const raws1 = data.map(d => d.raw).filter(v => typeof v === 'number' && !isNaN(v));
    const raws2 = data.map(d => d.raw2).filter(v => typeof v === 'number' && !isNaN(v));
    const avg1 = raws1.length ? raws1.reduce((a, b) => a + b, 0) / raws1.length : 0;
    const peak1 = raws1.length ? Math.max(...raws1) : 0;
    const min1 = raws1.length ? Math.min(...raws1) : 0;
    const latest1 = raws1[raws1.length - 1] || 0;
    const avg2 = raws2.length ? raws2.reduce((a, b) => a + b, 0) / raws2.length : 0;
    const peak2 = raws2.length ? Math.max(...raws2) : 0;
    const min2 = raws2.length ? Math.min(...raws2) : 0;
    const latest2 = raws2[raws2.length - 1] || 0;
    const trend = raws1.length > 2 ? (raws1[raws1.length - 1] > raws1[0] ? 'up' : raws1[raws1.length - 1] < raws1[0] ? 'down' : 'flat') : 'flat';

    const trCfg = TIME_RANGES.find(t => t.id === timeRange) || TIME_RANGES[5];
    const showHeatmap = !useCustomDate && timeRange === '1y';

    if (!deviceName) return (
        <div className="flex flex-col items-center justify-center h-screen">
            <div className="p-12 border-4 border-black bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] text-center">
                <p className="font-black uppercase text-2xl mb-4">No Agent Selected</p>
                <Link to="/dashboard" className="font-mono text-xs font-black p-3 border-2 border-black bg-[#FFECA0] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] uppercase">Return to Dashboard</Link>
            </div>
        </div>
    );

    return (
        <div className="w-full min-h-screen pb-16" style={{ padding: '1.5rem 2rem', background: '#f7f7f7' }}>

            {/* Back nav */}
            <Link to="/dashboard/analytics" state={{ deviceName }}
                className="inline-flex items-center gap-2 font-mono text-xs font-black px-4 py-2 border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:-translate-x-0.5 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all uppercase mb-6">
                <ArrowLeft size={14} /> Back to Analytics
            </Link>

            {/* Main card */}
            <div className="border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">

                {/* Header */}
                <div className="p-6 border-b-4 border-black" style={{ borderLeft: `8px solid ${meta.primary}` }}>
                    <div className="flex flex-col lg:flex-row justify-between gap-6">
                        <div>
                            <p className="font-mono text-xs font-black uppercase text-gray-400 mb-1">{deviceName}</p>
                            <h1 className="font-mono font-black uppercase text-3xl text-black">{meta.label}</h1>
                            <p className="font-mono text-xs text-gray-400 mt-1">Showing historical data for this metric only</p>
                        </div>

                        {/* Controls column */}
                        <div className="flex flex-col gap-3 items-end">
                            {/* Time range pills */}
                            {!useCustomDate && (
                                <div className="flex font-mono text-xs font-black border-2 border-black divide-x-2 divide-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                                    {TIME_RANGES.map(tr => (
                                        <button key={tr.id} onClick={() => setTimeRange(tr.id)}
                                            className={`px-3 py-2 uppercase ${timeRange === tr.id ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}>
                                            {tr.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Calendar toggle + date pickers */}
                            <div className="flex items-center gap-3">
                                <button onClick={() => { setUseCustomDate(!useCustomDate); setDateFrom(''); setDateTo(''); }}
                                    className={`flex items-center gap-1.5 font-mono text-xs font-black px-3 py-2 border-2 border-black shadow-[3px_3px_0_#000] transition-all uppercase ${useCustomDate ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}>
                                    <CalendarDays size={13} /> {useCustomDate ? 'Using Calendar' : 'Pick Dates'}
                                </button>

                                {useCustomDate && (
                                    <div className="flex items-center gap-2">
                                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                                            className="font-mono text-xs border-2 border-black px-2 py-1.5 shadow-[2px_2px_0_#000] focus:outline-none focus:shadow-[4px_4px_0_#000] transition-all" />
                                        <span className="font-mono text-xs font-black">to</span>
                                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                                            className="font-mono text-xs border-2 border-black px-2 py-1.5 shadow-[2px_2px_0_#000] focus:outline-none focus:shadow-[4px_4px_0_#000] transition-all" />
                                        <button onClick={fetchData}
                                            className="font-mono text-xs font-black px-4 py-2 border-2 border-black bg-black text-white hover:opacity-90 uppercase">
                                            Go
                                        </button>
                                    </div>
                                )}
                            </div>

                            {!useCustomDate && (
                                <p className="font-mono text-xs text-gray-400">{trCfg.desc}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Stats row */}
                {!loading && data.length > 0 && (
                    <div className="flex flex-col border-b-4 border-black">
                        <div className="grid grid-cols-4">
                            {[
                                { label: 'Latest', value: meta.name2 ? `${fmtVal(latest1, meta.unit)} / ${fmtVal(latest2, meta.unit)}` : fmtVal(latest1, meta.unit) },
                                { label: 'Average', value: meta.name2 ? `${fmtVal(avg1, meta.unit)} / ${fmtVal(avg2, meta.unit)}` : fmtVal(avg1, meta.unit) },
                                { label: 'Peak', value: meta.name2 ? `${fmtVal(peak1, meta.unit)} / ${fmtVal(peak2, meta.unit)}` : fmtVal(peak1, meta.unit) },
                                { label: 'Minimum', value: meta.name2 ? `${fmtVal(min1, meta.unit)} / ${fmtVal(min2, meta.unit)}` : fmtVal(min1, meta.unit) },
                            ].map((s, i) => (
                                <div key={i} className={`p-4 text-center ${i < 3 ? 'border-r-2 border-black' : ''}`}
                                    style={{ background: i === 0 ? meta.primary + '22' : 'white' }}>
                                    <p className="font-mono text-xs font-black uppercase text-gray-400">{s.label}</p>
                                    <p className="font-mono text-xl font-black mt-1 break-all">{s.value}</p>
                                </div>
                            ))}
                        </div>
                        {meta.name2 && (
                            <div className="text-center py-2 bg-[#f7f7f7] border-t-[1px] border-dashed border-gray-400">
                                <p className="font-mono text-[11px] font-bold text-gray-500 uppercase">
                                    Format: {meta.name1} / {meta.name2}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Chart */}
                <div className="p-6">
                    {loading ? (
                        <div className="flex items-center justify-center gap-4 py-20 border-2 border-dashed border-gray-300 bg-gray-50">
                            <Loader2 className="animate-spin text-gray-400" size={28} />
                            <p className="font-mono text-base font-black uppercase text-gray-400">Loading {meta.label}…</p>
                        </div>
                    ) : error ? (
                        <div className="p-8 border-2 border-red-400 bg-red-50 text-center">
                            <p className="font-mono font-black text-red-600 uppercase">{error}</p>
                        </div>
                    ) : data.length > 0 ? (
                        <>
                            {/* Main chart */}
                            <div className="border-2 border-black mb-6" style={{ height: 360, background: '#fafafa' }}>
                                <div className="flex justify-between items-center px-4 pt-3 pb-1 border-b-2 border-black">
                                    <h3 className="font-mono text-xs font-black uppercase text-gray-500">{meta.label} over time</h3>
                                    <div className="flex items-center gap-2">
                                        {trend === 'up' && <TrendingUp size={14} className="text-red-500" />}
                                        {trend === 'down' && <TrendingDown size={14} className="text-green-500" />}
                                        {trend === 'flat' && <Minus size={14} className="text-gray-400" />}
                                        <span className="font-mono text-xs font-black" style={{ color: meta.primary }}>
                                            {data.length} pts
                                        </span>
                                    </div>
                                </div>
                                <div style={{ height: 300, padding: '8px 4px 4px 0' }}>
                                    <MetricChart data={data} metricId={metricId} rangeId={useCustomDate ? 'custom' : timeRange} />
                                </div>
                            </div>

                            {/* Heatmap */}
                            {showHeatmap ? (
                                <div>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="w-4 h-4 border-2 border-black inline-block" style={{ background: meta.primary }} />
                                        <h3 className="font-mono font-black uppercase text-sm">{meta.label} — Activity Heatmap (Last 365 Days)</h3>
                                    </div>
                                    <GithubHeatmap data={data} metricId={metricId} />
                                </div>
                            ) : (
                                <div className="border-2 border-dashed border-gray-300 p-4 text-center bg-gray-50">
                                    <p className="font-mono text-sm font-black text-gray-400 uppercase">
                                        Switch to <span className="border-2 border-black px-2 bg-black text-white">1Y</span> for the activity heatmap
                                    </p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-black bg-gray-50">
                            <p className="font-mono font-black uppercase text-xl text-gray-400 mb-2">No Data Found</p>
                            <p className="font-mono text-sm text-gray-500">Try a longer time range or check if the agent is sending data.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default MetricTimestampView;