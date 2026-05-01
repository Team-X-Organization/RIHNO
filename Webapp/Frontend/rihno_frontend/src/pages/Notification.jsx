import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from "react-oidc-context";
import { backendConfig } from "../authConfig.js";
import {
    Loader2, Server, ShieldAlert, Cpu, Activity, AlertTriangle, Shield,
    CheckCircle, XCircle, Mail, Phone, Bell, Plus, Trash2, Send,
    SlidersHorizontal, BrainCircuit
} from 'lucide-react';

const THREAT_LEVELS = ['low', 'medium', 'high', 'critical'];
const THREAT_RANK = { normal: 0, low: 1, medium: 2, high: 3, critical: 4 };

const LEVEL_BG = {
    normal: 'bg-[#CEFFBC]',
    low: 'bg-[#CEFFBC]',
    medium: 'bg-[#FFECA0]',
    high: 'bg-[#FF6B6B]',
    critical: 'bg-[#FF6B6B]',
};

const LEVEL_TEXT = {
    normal: 'text-black',
    low: 'text-black',
    medium: 'text-black',
    high: 'text-white',
    critical: 'text-white',
};

function api(path) {
    return `${backendConfig.backendURL}${path.replace(/^\//, '')}`;
}

function Notification() {
    const auth = useAuth();
    const email = auth.user?.profile?.email || '';

    const [activeTab, setActiveTab] = useState('threats'); // 'threats' | 'agents' | 'ip' | 'recipients'

    // Existing data
    const [agents, setAgents] = useState([]);
    const [agentStatuses, setAgentStatuses] = useState({});
    const [ipThreatData, setIpThreatData] = useState([]);

    // AI threat data
    const [aiThreats, setAiThreats] = useState({ summary: { max_level: 'normal', total_agents: 0 }, agents: [] });
    const [aiSummary, setAiSummary] = useState({ agents: [], agent_count: 0, auto_detector: null });

    // Recipients
    const [recipients, setRecipients] = useState([]);
    const [settings, setSettings] = useState({ min_threat_level: 'medium', mute_until: 0 });
    const [recipientForm, setRecipientForm] = useState({ type: 'email', value: '', label: '' });
    const [actionMsg, setActionMsg] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);

    const [loading, setLoading] = useState(true);
    const [fetchErrors, setFetchErrors] = useState([]);

    const showMsg = (kind, text) => {
        setActionMsg({ kind, text });
        setTimeout(() => setActionMsg(null), 3500);
    };

    // ── Fetchers ─────────────────────────────────────────────────────────

    const fetchCore = useCallback(async () => {
        if (!email) return;
        const failures = [];
        const safeGet = (label, url, params, fallback) =>
            axios.get(url, { params }).catch(err => {
                const code = err.response?.status || err.code || 'ERR';
                console.warn(`[Notification] ${label} fetch failed (${code}):`, err.message);
                failures.push(`${label} (${code})`);
                return { data: fallback };
            });

        try {
            const [agentsRes, statusRes, ipRes, aiRes, aiSumRes, recRes] = await Promise.all([
                safeGet('devices', api('api/list_all_devices'), { email }, []),
                safeGet('agent_status', `${backendConfig.dealerURL}/agents/status`, { email }, []),
                safeGet('ip_threats', api('api/ip_threats'), { email }, { data: [] }),
                safeGet('ai_threats', api('api/notify/threats'), { email }, null),
                safeGet('ai_summary', api('api/ai/threat_summary'), { email }, null),
                safeGet('recipients', api('api/notify/recipients'), { email }, null),
            ]);

            setAgents(Array.isArray(agentsRes.data) ? agentsRes.data : []);

            const map = {};
            if (Array.isArray(statusRes.data)) statusRes.data.forEach(s => { map[s.agent_name] = s; });
            setAgentStatuses(map);

            setIpThreatData(ipRes.data?.data || []);

            if (aiRes.data) setAiThreats(aiRes.data);
            if (aiSumRes.data) setAiSummary(aiSumRes.data);

            if (recRes.data) {
                setRecipients(recRes.data.recipients || []);
                if (recRes.data.settings) setSettings(recRes.data.settings);
            }

            setFetchErrors(failures);
        } catch (err) {
            console.error("notification fetch failed", err);
            setFetchErrors(['unknown error']);
        } finally {
            setLoading(false);
        }
    }, [email]);

    useEffect(() => {
        fetchCore();
        const id = setInterval(fetchCore, 10000);
        return () => clearInterval(id);
    }, [fetchCore]);

    // ── Recipient Actions ────────────────────────────────────────────────

    const addRecipient = async (e) => {
        e.preventDefault();
        const value = recipientForm.value.trim();
        if (!value) return;

        // Client-side validation
        if (recipientForm.type === 'email') {
            const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!EMAIL_RE.test(value)) {
                showMsg('err', 'Invalid email format.');
                return;
            }
        } else if (recipientForm.type === 'sms') {
            const PHONE_RE = /^\+?[1-9]\d{6,14}$/;
            if (!PHONE_RE.test(value.replace(/[\s-()]/g, ''))) {
                showMsg('err', 'Phone must be E.164 format (e.g. +15551234567).');
                return;
            }
        }

        setActionLoading(true);
        try {
            const res = await axios.post(api('api/notify/recipients'), {
                type: recipientForm.type,
                value,
                label: recipientForm.label.trim() || value,
            }, { params: { email } });
            setRecipients(prev => [...prev, res.data]);
            setRecipientForm({ type: recipientForm.type, value: '', label: '' });
            showMsg('ok', 'Recipient added.');
        } catch (err) {
            const msg = err.response?.data?.details || err.response?.data?.message || err.message;
            showMsg('err', `Add failed: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
        } finally {
            setActionLoading(false);
        }
    };

    const deleteRecipient = async (rec) => {
        try {
            await axios.delete(api(`api/notify/recipients/${rec.id}`), { params: { email } });
            setRecipients(prev => prev.filter(r => r.id !== rec.id));
            showMsg('ok', `${rec.label || rec.value} removed.`);
        } catch (err) {
            showMsg('err', `Delete failed: ${err.message}`);
        }
    };

    const toggleRecipient = async (rec) => {
        try {
            const res = await axios.patch(api(`api/notify/recipients/${rec.id}`), {
                enabled: !rec.enabled,
            }, { params: { email } });
            setRecipients(prev => prev.map(r => r.id === rec.id ? res.data : r));
        } catch (err) {
            showMsg('err', `Toggle failed: ${err.message}`);
        }
    };

    const sendTest = async (rec) => {
        setActionLoading(true);
        try {
            const res = await axios.post(api('api/notify/test'), {
                type: rec.type, value: rec.value,
            }, { params: { email } });
            if (res.data?.ok) showMsg('ok', `Test sent to ${rec.value}.`);
            else showMsg('err', `Test failed: ${res.data?.info || 'unknown'}`);
        } catch (err) {
            showMsg('err', `Test failed: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    };

    const updateMinLevel = async (level) => {
        setSettings(s => ({ ...s, min_threat_level: level }));
        try {
            await axios.put(api('api/notify/settings'), { min_threat_level: level }, { params: { email } });
            showMsg('ok', `Threshold set to ${level.toUpperCase()}.`);
        } catch (err) {
            showMsg('err', `Update failed: ${err.message}`);
        }
    };

    // ── Derived ──────────────────────────────────────────────────────────

    const enrichedAgents = useMemo(() => agents.map(server => {
        let displayStatus = server.Status;
        if (displayStatus !== 'Maintenance') {
            const dyn = agentStatuses[server.DeviceName];
            displayStatus = (dyn && dyn.is_active) ? 'Online' : 'Offline';
        }
        return { ...server, DisplayStatus: displayStatus };
    }), [agents, agentStatuses]);

    // Prefer the direct AI engine summary (per-agent last_assessment).
    // Fall back to notification engine view when not yet available.
    const summaryAgents = aiSummary?.agents || [];
    const aiAgents = summaryAgents.length > 0 ? summaryAgents : (aiThreats?.agents || []);

    const overallLevel = useMemo(() => {
        if (summaryAgents.length === 0) return aiThreats?.summary?.max_level || 'normal';
        let max = 'normal';
        for (const a of summaryAgents) {
            const lvl = a.last_assessment?.threat_level || 'normal';
            if (THREAT_RANK[lvl] > THREAT_RANK[max]) max = lvl;
        }
        return max;
    }, [summaryAgents, aiThreats]);

    const autoDetector = aiSummary?.auto_detector || null;

    // ── Render ───────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col items-center animate-fade-in w-full p-3 sm:p-4 md:p-6 min-h-screen bg-white font-sans text-black">

            <div className="mb-8 sm:mb-10 md:mb-12 w-full max-w-5xl xl:max-w-6xl flex flex-col items-center">
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black uppercase leading-none text-center mb-4 sm:mb-6">
                    OVERVIEW
                    <span className="block md:inline-block bg-[#CEFFBC] border-[3px] sm:border-[4px] border-black px-3 sm:px-4 ml-0 md:ml-4 mt-2 md:mt-0 shadow-[5px_5px_0_#000] sm:shadow-[6px_6px_0_#000] md:shadow-[8px_8px_0_#000]">
                        CENTER
                    </span>
                </h1>

                <div className="flex flex-wrap justify-center gap-3 sm:gap-4 mt-3 sm:mt-4">
                    <TabBtn active={activeTab === 'threats'} onClick={() => setActiveTab('threats')} icon={<BrainCircuit size={20} />} color="bg-[#FFECA0]">
                        AI Threats
                    </TabBtn>
                    <TabBtn active={activeTab === 'agents'} onClick={() => setActiveTab('agents')} icon={<Server size={20} />} color="bg-black text-white">
                        Agent Status
                    </TabBtn>
                    <TabBtn active={activeTab === 'ip'} onClick={() => setActiveTab('ip')} icon={<ShieldAlert size={20} />} color="bg-[#FF6B6B] text-white">
                        IP Threats
                    </TabBtn>
                    <TabBtn active={activeTab === 'recipients'} onClick={() => setActiveTab('recipients')} icon={<Bell size={20} />} color="bg-[#7EA0FD] text-white">
                        Recipients
                    </TabBtn>
                </div>
            </div>

            {actionMsg && (
                <div className={`mb-6 px-4 py-3 border-4 border-black font-mono font-black uppercase shadow-[4px_4px_0_#000] ${actionMsg.kind === 'ok' ? 'bg-[#CEFFBC] text-black' : 'bg-[#FF6B6B] text-white'}`}>
                    {actionMsg.text}
                </div>
            )}

            {fetchErrors.length > 0 && (
                <div className="mb-6 px-4 py-3 border-4 border-black bg-[#FFECA0] text-black font-mono text-xs sm:text-sm font-bold uppercase shadow-[4px_4px_0_#000] max-w-5xl w-full">
                    <span className="font-black">⚠ Partial data:</span> {fetchErrors.join(', ')} unavailable. Showing cached values.
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center gap-4 p-8 sm:p-12 border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                    <Loader2 className="animate-spin text-black" size={36} />
                    <p className="font-mono text-lg sm:text-2xl font-black uppercase tracking-widest">Gathering Telemetry…</p>
                </div>
            ) : (
                <div className="w-full max-w-5xl xl:max-w-6xl">

                    {activeTab === 'threats' && (
                        <ThreatsView overallLevel={overallLevel} aiAgents={aiAgents} autoDetector={autoDetector} hasSummary={summaryAgents.length > 0} />
                    )}

                    {activeTab === 'agents' && (
                        <AgentsView enrichedAgents={enrichedAgents} />
                    )}

                    {activeTab === 'ip' && (
                        <IpThreatsView threatData={ipThreatData} />
                    )}

                    {activeTab === 'recipients' && (
                        <RecipientsView
                            recipients={recipients}
                            settings={settings}
                            recipientForm={recipientForm}
                            setRecipientForm={setRecipientForm}
                            addRecipient={addRecipient}
                            deleteRecipient={deleteRecipient}
                            toggleRecipient={toggleRecipient}
                            sendTest={sendTest}
                            updateMinLevel={updateMinLevel}
                            actionLoading={actionLoading}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

// ── Reusable Pieces ─────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon, color, children }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 border-[3px] sm:border-4 border-black font-mono font-black uppercase text-base sm:text-lg md:text-xl transition-all shadow-[4px_4px_0_#000] sm:shadow-[6px_6px_0_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0_#000] sm:hover:shadow-[8px_8px_0_#000] ${active ? color : 'bg-white text-black'}`}
        >
            {icon}{children}
        </button>
    );
}

// ── Threats View (AI engine) ────────────────────────────────────────────

function ThreatsView({ overallLevel, aiAgents, autoDetector, hasSummary }) {
    const levelLabel = (overallLevel || 'normal').toUpperCase();
    const isCritical = THREAT_RANK[overallLevel] >= 3;

    return (
        <div className="space-y-4 sm:space-y-6">
            <div className={`p-4 sm:p-6 md:p-8 border-[3px] sm:border-4 border-black ${LEVEL_BG[overallLevel]} ${LEVEL_TEXT[overallLevel]} shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6`}>
                <div className="flex items-center gap-3 sm:gap-4">
                    <BrainCircuit size={48} className={`sm:w-16 sm:h-16 ${isCritical ? 'animate-pulse' : ''}`} />
                    <div>
                        <h2 className="text-2xl sm:text-3xl md:text-5xl font-black uppercase">AI Threat Status</h2>
                        <p className="font-mono text-base sm:text-lg md:text-xl font-bold uppercase mt-1">
                            Zero-Day Detection Engine
                        </p>
                    </div>
                </div>
                <div className="bg-black text-white px-6 sm:px-8 py-3 sm:py-4 border-[3px] sm:border-4 border-white shadow-[4px_4px_0_#fff] sm:shadow-[6px_6px_0_#fff] text-center">
                    <p className="font-mono text-xs sm:text-sm font-bold uppercase">Current Level</p>
                    <p className="text-3xl sm:text-4xl font-black mt-1">{levelLabel}</p>
                </div>
            </div>

            {autoDetector && (
                <div className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] p-4 flex flex-wrap items-center gap-4 font-mono text-xs sm:text-sm">
                    <span className={`px-2 py-1 border-2 border-black font-black uppercase ${autoDetector.running ? 'bg-[#CEFFBC]' : 'bg-[#FF6B6B] text-white'}`}>
                        Detector {autoDetector.running ? 'RUNNING' : 'DOWN'}
                    </span>
                    <span className="font-bold uppercase">Interval {autoDetector.poll_interval}s</span>
                    <span className="font-bold uppercase">Iters {autoDetector.iterations}</span>
                    <span className="font-bold uppercase">Tracked {autoDetector.tracked_agents}</span>
                </div>
            )}

            {aiAgents.length === 0 ? (
                <div className="p-8 sm:p-12 border-[3px] sm:border-4 border-black bg-[#CEFFBC] shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] text-center">
                    <Shield size={48} className="mx-auto mb-4 text-black" />
                    <p className="font-mono text-lg sm:text-2xl font-black uppercase text-black">All systems normal — no AI alerts.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    {aiAgents.map((t, idx) => (
                        hasSummary
                            ? <AgentThreatCard key={idx} agent={t} />
                            : <LegacyThreatCard key={idx} t={t} />
                    ))}
                </div>
            )}
        </div>
    );
}

function AgentThreatCard({ agent }) {
    const last = agent.last_assessment || {};
    const level = last.threat_level || 'normal';
    const score = typeof last.final_score === 'number' ? last.final_score : 0;
    const layers = last.layer_contributions || {};
    const recentAlerts = agent.recent_alerts || [];
    const status = agent.status || {};
    const samples = status.samples_processed || 0;
    const layerStatus = status.layers || {};

    // layer_contributions = { name: { score, weight, contribution, active } }
    const layerInfo = (lyr) => {
        const v = layers[lyr];
        if (!v || typeof v !== 'object') return { score: 0, contribution: 0, active: false };
        return {
            score: Math.max(0, Math.min(1, v.score || 0)),
            contribution: Math.max(0, Math.min(1, v.contribution || 0)),
            active: v.active !== false,
        };
    };

    return (
        <div className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000]">
            <div className={`p-4 border-b-4 border-black flex items-center justify-between ${LEVEL_BG[level]} ${LEVEL_TEXT[level]}`}>
                <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle size={24} className="shrink-0" />
                    <div className="min-w-0">
                        <h3 className="font-black uppercase text-lg sm:text-xl truncate">{agent.agent_name}</h3>
                        <p className="font-mono text-xs uppercase opacity-80">{level}</p>
                    </div>
                </div>
                <span className="font-mono text-xs font-black uppercase px-2 py-1 border-2 border-black bg-white text-black shrink-0">
                    Score {score.toFixed(3)}
                </span>
            </div>

            <div className="p-4 space-y-3 font-mono text-xs sm:text-sm">
                <div className="space-y-2">
                    <p className="font-black uppercase text-gray-700">Layer Scores</p>
                    {[
                        ['Statistical', 'statistical', layerStatus.statistical],
                        ['Iso. Forest', 'isolation_forest', layerStatus.isolation_forest],
                        ['Autoencoder', 'autoencoder', layerStatus.autoencoder],
                        ['Network', 'network_analyzer', layerStatus.network_analyzer],
                    ].map(([label, key, st]) => {
                        const info = layerInfo(key);
                        return (
                            <LayerBar
                                key={key}
                                label={label}
                                value={info.score}
                                active={info.active && (st?.active !== false)}
                            />
                        );
                    })}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-dashed border-gray-300">
                    <Stat label="Samples" value={samples} />
                    <Stat label="Stream" value={agent.stream_length || 0} />
                    <Stat label="Alerts" value={recentAlerts.length} />
                    <Stat label="Last" value={agent.last_metric_ts ? new Date(agent.last_metric_ts).toLocaleTimeString() : '—'} />
                </div>

                {recentAlerts.length > 0 && (
                    <div className="pt-2 border-t-2 border-dashed border-gray-300">
                        <p className="font-black uppercase text-gray-700 mb-2">Recent Alerts</p>
                        <ul className="space-y-1 max-h-40 overflow-auto">
                            {recentAlerts.slice(0, 5).map((al, i) => (
                                <li key={i} className={`flex items-center justify-between gap-2 px-2 py-1 border-2 border-black ${LEVEL_BG[al.threat_level || 'low']} ${LEVEL_TEXT[al.threat_level || 'low']}`}>
                                    <span className="font-black uppercase truncate">{al.threat_level}</span>
                                    <span className="font-mono">{(al.final_score || 0).toFixed(2)}</span>
                                    <span className="font-mono opacity-80 truncate">{al.timestamp ? new Date(al.timestamp).toLocaleTimeString() : '—'}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

function LayerBar({ label, value, active }) {
    const pct = Math.round(value * 100);
    return (
        <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 font-bold uppercase">{label}</span>
            <div className="flex-1 h-3 border-2 border-black bg-white relative">
                <div
                    className={`h-full ${active ? 'bg-black' : 'bg-gray-300'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="w-10 text-right font-black">{pct}%</span>
            {!active && <span className="font-mono text-[10px] uppercase text-gray-500">idle</span>}
        </div>
    );
}

function Stat({ label, value }) {
    return (
        <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-500">{label}</span>
            <span className="font-black truncate">{value}</span>
        </div>
    );
}

function LegacyThreatCard({ t }) {
    const level = t.threat_level || 'normal';
    return (
        <div className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000]">
            <div className={`p-4 border-b-4 border-black flex items-center justify-between ${LEVEL_BG[level]} ${LEVEL_TEXT[level]}`}>
                <div className="flex items-center gap-2">
                    <AlertTriangle size={24} />
                    <h3 className="font-black uppercase text-lg sm:text-xl">{level}</h3>
                </div>
                <span className="font-mono text-xs font-black uppercase px-2 py-1 border-2 border-black bg-white text-black">
                    Score {(t.final_score || 0).toFixed(2)}
                </span>
            </div>
            <div className="p-4 font-mono text-sm space-y-2">
                <div className="flex justify-between border-b-2 border-dashed border-gray-300 pb-2">
                    <span className="font-bold text-gray-500 uppercase">Agent</span>
                    <span className="font-black truncate ml-2">{t.agent_id}</span>
                </div>
                <div className="flex justify-between">
                    <span className="font-bold text-gray-500 uppercase">Time</span>
                    <span className="font-black">{t.timestamp || '—'}</span>
                </div>
            </div>
        </div>
    );
}

// ── Agents View ─────────────────────────────────────────────────────────

function AgentsView({ enrichedAgents }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {enrichedAgents.length === 0 ? (
                <div className="col-span-full p-8 sm:p-12 border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] text-center">
                    <p className="font-mono text-base sm:text-xl font-black uppercase">No Agents Available.</p>
                </div>
            ) : (
                enrichedAgents.map((agent, idx) => (
                    <div key={idx} className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] hover:-translate-y-1 transition-all flex flex-col h-full">
                        <div className={`p-4 border-b-4 border-black flex items-center justify-between ${agent.DisplayStatus === 'Online' ? 'bg-[#CEFFBC]' : agent.DisplayStatus === 'Maintenance' ? 'bg-[#7EA0FD]' : 'bg-[#FF6B6B]'}`}>
                            <div className="flex items-center gap-3">
                                {agent.DisplayStatus === 'Online' ? <CheckCircle size={28} className="text-black" /> :
                                    agent.DisplayStatus === 'Maintenance' ? <Activity size={28} className="text-white" /> :
                                        <XCircle size={28} className="text-white" />}
                                <h3 className={`font-black text-2xl uppercase ${agent.DisplayStatus === 'Online' ? 'text-black' : 'text-white'}`}>{agent.DeviceName}</h3>
                            </div>
                            <span className="font-mono text-xs font-black uppercase px-2 py-1 border-2 border-black bg-white text-black shadow-[2px_2px_0_#000]">
                                {agent.DisplayStatus}
                            </span>
                        </div>
                        <div className="p-4 flex-grow bg-gray-50">
                            <div className="font-mono text-sm space-y-3">
                                <Row label="TYPE" value={agent.DeviceType || 'UNKNOWN'} />
                                <Row label="LOCATION" value={agent.Location || 'UNKNOWN'} />
                                <Row label="CREATED" value={agent.DateCreated ? new Date(agent.DateCreated).toLocaleDateString() : 'UNKNOWN'} />
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}

function Row({ label, value }) {
    return (
        <div className="flex justify-between border-b-2 border-dashed border-gray-300 pb-2">
            <span className="font-bold text-gray-500">{label}</span>
            <span className="font-black truncate ml-2">{value}</span>
        </div>
    );
}

// ── IP Threats View ─────────────────────────────────────────────────────

function IpThreatsView({ threatData }) {
    const total = threatData.reduce((acc, c) => acc + (c.threat_count || 0), 0);
    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="p-4 sm:p-6 md:p-8 border-[3px] sm:border-4 border-black bg-[#FF6B6B] text-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6">
                <div className="flex items-center gap-3 sm:gap-4">
                    <ShieldAlert size={48} className="sm:w-16 sm:h-16 animate-pulse" />
                    <div>
                        <h2 className="text-2xl sm:text-3xl md:text-5xl font-black uppercase">Threat Radar</h2>
                        <p className="font-mono text-base sm:text-lg md:text-xl font-bold uppercase mt-1">Cross-Agent IP Analysis</p>
                    </div>
                </div>
                <div className="bg-black text-white px-6 sm:px-8 py-3 sm:py-4 border-[3px] sm:border-4 border-white shadow-[4px_4px_0_#fff] sm:shadow-[6px_6px_0_#fff] text-center">
                    <p className="font-mono text-xs sm:text-sm font-bold uppercase">Total Threats</p>
                    <p className="text-4xl sm:text-5xl font-black mt-1">{total}</p>
                </div>
            </div>

            {threatData.length === 0 ? (
                <div className="p-8 sm:p-12 border-[3px] sm:border-4 border-black bg-[#CEFFBC] shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] text-center">
                    <Shield size={48} className="mx-auto mb-4 text-black" />
                    <p className="font-mono text-lg sm:text-2xl font-black uppercase text-black">Zero IP Threats Detected.</p>
                </div>
            ) : (
                threatData.map((threat, idx) => (
                    <div key={idx} className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] hover:-translate-y-1 transition-all overflow-hidden flex flex-col md:flex-row">
                        <div className="w-full md:w-40 lg:w-48 bg-[#FF6B6B] border-b-[3px] sm:border-b-4 md:border-b-0 md:border-r-[3px] md:sm:border-r-4 border-black p-4 sm:p-6 flex flex-col items-center justify-center text-white text-center">
                            <AlertTriangle size={36} className="sm:w-10 sm:h-10 mb-2" />
                            <p className="text-3xl sm:text-4xl font-black">{threat.threat_count || 0}</p>
                            <p className="font-mono text-xs font-black uppercase tracking-widest mt-1">Incidents</p>
                        </div>
                        <div className="p-4 sm:p-6 flex-grow flex flex-col justify-between space-y-3 sm:space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                                <h3 className="text-xl sm:text-2xl md:text-3xl font-black uppercase flex items-center gap-2 sm:gap-3">
                                    <Cpu size={22} className="sm:w-7 sm:h-7 text-gray-400" />
                                    {threat.agent_name || threat.device_name || threat.DeviceName || threat.hostname || threat.interface || 'UNKNOWN AGENT'}
                                </h3>
                                {threat.threat_count > 0 && (
                                    <span className="inline-block px-4 py-2 border-4 border-black bg-[#FFECA0] font-mono text-sm font-black text-black uppercase shadow-[4px_4px_0_#000]">
                                        RISK: HIGH
                                    </span>
                                )}
                            </div>

                            <div className="bg-gray-100 p-4 border-2 border-black font-mono text-sm">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <p className="font-bold text-gray-500 uppercase text-xs mb-1">Source Scope</p>
                                        <p className="font-black text-lg">{threat.interface || 'ALL NETWORKS'}</p>
                                    </div>
                                    {Array.isArray(threat.malicious_ips) && threat.malicious_ips.length > 0 && (
                                        <div>
                                            <p className="font-bold text-gray-500 uppercase text-xs mb-1">Top Offenders</p>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {threat.malicious_ips.slice(0, 3).map((item, i) => (
                                                    <span key={i} className="bg-black text-white px-2 py-1 text-xs">
                                                        {typeof item === 'object' ? item.ip || JSON.stringify(item) : item}
                                                    </span>
                                                ))}
                                                {threat.malicious_ips.length > 3 && (
                                                    <span className="bg-gray-300 text-black px-2 py-1 text-xs font-bold border border-black">
                                                        +{threat.malicious_ips.length - 3} MORE
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 text-xs font-mono font-bold text-gray-500 uppercase mt-2 pt-4 border-t-2 border-dashed border-gray-300">
                                <p className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-black block" />
                                    Last Activity: {threat.last_updated ? new Date(threat.last_updated).toLocaleString() : new Date().toLocaleString()}
                                </p>
                                <p className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-black block" />
                                    Network: {threat.network || 'DEFAULT'}
                                </p>
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}

// ── Recipients View ─────────────────────────────────────────────────────

function RecipientsView({
    recipients, settings, recipientForm, setRecipientForm,
    addRecipient, deleteRecipient, toggleRecipient, sendTest,
    updateMinLevel, actionLoading,
}) {
    return (
        <div className="space-y-6">
            {/* Header banner */}
            <div className="p-4 sm:p-6 border-[3px] sm:border-4 border-black bg-[#7EA0FD] text-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] flex items-center gap-4">
                <Bell size={36} className="sm:w-12 sm:h-12" />
                <div>
                    <h2 className="text-xl sm:text-2xl md:text-3xl font-black uppercase">Notification Recipients</h2>
                    <p className="font-mono text-xs sm:text-sm font-bold uppercase mt-1">
                        Email + SMS endpoints alerted when intrusion detected.
                    </p>
                </div>
            </div>

            {/* Add form */}
            <form onSubmit={addRecipient} className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] p-4 sm:p-6 space-y-4">
                <h3 className="font-black uppercase text-lg sm:text-xl flex items-center gap-2">
                    <Plus size={22} /> Add Recipient
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <select
                        value={recipientForm.type}
                        onChange={e => setRecipientForm(f => ({ ...f, type: e.target.value }))}
                        className="md:col-span-3 border-4 border-black bg-white p-3 font-mono font-black uppercase shadow-[3px_3px_0_#000]"
                    >
                        <option value="email">Email</option>
                        <option value="sms">SMS / Phone</option>
                    </select>
                    <input
                        required
                        type="text"
                        placeholder={recipientForm.type === 'email' ? 'name@example.com' : '+15551234567'}
                        value={recipientForm.value}
                        onChange={e => setRecipientForm(f => ({ ...f, value: e.target.value }))}
                        className="md:col-span-5 border-4 border-black bg-white p-3 font-mono font-bold shadow-[3px_3px_0_#000] placeholder-gray-400"
                    />
                    <input
                        type="text"
                        placeholder="Label (optional)"
                        value={recipientForm.label}
                        onChange={e => setRecipientForm(f => ({ ...f, label: e.target.value }))}
                        className="md:col-span-2 border-4 border-black bg-white p-3 font-mono font-bold shadow-[3px_3px_0_#000] placeholder-gray-400"
                    />
                    <button
                        disabled={actionLoading}
                        type="submit"
                        className="md:col-span-2 bg-black text-[#FFECA0] border-4 border-black p-3 font-black uppercase shadow-[3px_3px_0_#000] hover:-translate-y-1 hover:shadow-[5px_5px_0_#FF6B6B] transition-all disabled:opacity-50"
                    >
                        {actionLoading ? <Loader2 size={18} className="mx-auto animate-spin" /> : 'Add'}
                    </button>
                </div>
            </form>

            {/* Threshold control */}
            <div className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] p-4 sm:p-6 space-y-3">
                <h3 className="font-black uppercase text-lg sm:text-xl flex items-center gap-2">
                    <SlidersHorizontal size={22} /> Notify Threshold
                </h3>
                <p className="font-mono text-xs sm:text-sm text-gray-600 uppercase font-bold">
                    Only fire alerts at this level or above.
                </p>
                <div className="flex flex-wrap gap-2">
                    {THREAT_LEVELS.map(lvl => (
                        <button
                            key={lvl}
                            onClick={() => updateMinLevel(lvl)}
                            className={`px-4 py-2 border-4 border-black font-mono font-black uppercase shadow-[3px_3px_0_#000] transition-all hover:-translate-y-1
                                ${settings.min_threat_level === lvl
                                    ? `${LEVEL_BG[lvl]} ${LEVEL_TEXT[lvl]}`
                                    : 'bg-white text-black'}`}
                        >
                            {lvl}
                        </button>
                    ))}
                </div>
            </div>

            {/* Recipients list */}
            <div className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000]">
                <div className="p-4 sm:p-6 border-b-4 border-black bg-black text-[#FFECA0] flex items-center justify-between">
                    <h3 className="font-black uppercase text-lg sm:text-xl">Active Recipients</h3>
                    <span className="font-mono text-sm font-black">{recipients.length} TOTAL</span>
                </div>

                {recipients.length === 0 ? (
                    <div className="p-6 sm:p-8 text-center">
                        <p className="font-mono font-black uppercase text-gray-500">No recipients yet — add one above.</p>
                    </div>
                ) : (
                    <ul className="divide-y-4 divide-black">
                        {recipients.map(rec => (
                            <li key={rec.id} className="p-4 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className={`w-10 h-10 border-4 border-black flex items-center justify-center shadow-[3px_3px_0_#000] ${rec.type === 'email' ? 'bg-[#CEFFBC]' : 'bg-[#FFECA0]'}`}>
                                        {rec.type === 'email' ? <Mail size={20} /> : <Phone size={20} />}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="font-black uppercase truncate">{rec.label || rec.value}</p>
                                        <p className="font-mono text-xs text-gray-600 truncate">{rec.value}</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`px-2 py-1 border-2 border-black font-mono text-xs font-black uppercase ${rec.enabled ? 'bg-[#CEFFBC]' : 'bg-gray-200'}`}>
                                        {rec.enabled ? 'ON' : 'OFF'}
                                    </span>
                                    <button
                                        onClick={() => toggleRecipient(rec)}
                                        className="px-3 py-1.5 border-4 border-black bg-white font-mono font-black uppercase text-xs shadow-[3px_3px_0_#000] hover:-translate-y-1 transition-all"
                                    >
                                        {rec.enabled ? 'Disable' : 'Enable'}
                                    </button>
                                    <button
                                        onClick={() => sendTest(rec)}
                                        disabled={actionLoading}
                                        className="flex items-center gap-1 px-3 py-1.5 border-4 border-black bg-[#7EA0FD] text-white font-mono font-black uppercase text-xs shadow-[3px_3px_0_#000] hover:-translate-y-1 transition-all disabled:opacity-50"
                                    >
                                        <Send size={14} /> Test
                                    </button>
                                    <button
                                        onClick={() => deleteRecipient(rec)}
                                        className="flex items-center gap-1 px-3 py-1.5 border-4 border-black bg-[#FF6B6B] text-white font-mono font-black uppercase text-xs shadow-[3px_3px_0_#000] hover:-translate-y-1 transition-all"
                                    >
                                        <Trash2 size={14} /> Delete
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default Notification;
