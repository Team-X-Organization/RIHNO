import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

// Hex used for the left accent stripe — kept separate from LEVEL_BG so we can
// drive `border-left` via inline style (Tailwind cannot interpolate hex).
const LEVEL_ACCENT_HEX = {
    normal: '#CEFFBC',
    low: '#CEFFBC',
    medium: '#FFECA0',
    high: '#FF6B6B',
    critical: '#FF6B6B',
};

// Pull a 1-line headline out of a multi-sentence Bedrock summary.
function aiHeadline(text) {
    if (!text) return '';
    const firstStop = text.indexOf('. ');
    const head = firstStop > 0 ? text.slice(0, firstStop + 1) : text;
    return head.replace(/\s+/g, ' ').trim().slice(0, 110);
}

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
    const [sseConnected, setSseConnected] = useState(false);
    const esRef = useRef(null);

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
            const [agentsRes, statusRes, ipRes, recRes] = await Promise.all([
                safeGet('devices', api('api/list_all_devices'), { email }, []),
                safeGet('agent_status', `${backendConfig.dealerURL}/agents/status`, { email }, []),
                safeGet('ip_threats', api('api/ip_threats'), { email }, { data: [] }),
                safeGet('recipients', api('api/notify/recipients'), { email }, null),
            ]);

            setAgents(Array.isArray(agentsRes.data) ? agentsRes.data : []);

            const map = {};
            if (Array.isArray(statusRes.data)) statusRes.data.forEach(s => { map[s.agent_name] = s; });
            setAgentStatuses(map);

            setIpThreatData(ipRes.data?.data || []);

            if (recRes.data) {
                setRecipients(recRes.data.recipients || []);
                if (recRes.data.settings) {
                    // Merge: preserve local agent_thresholds if server doesn't return them
                    // (guards against polling overwriting per-agent overrides mid-session)
                    setSettings(prev => ({
                        ...recRes.data.settings,
                        agent_thresholds: recRes.data.settings.agent_thresholds ?? prev.agent_thresholds,
                    }));
                }
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

    // ── SSE — real-time threat stream ────────────────────────────────────
    useEffect(() => {
        if (!email) return;

        const url = `${backendConfig.backendURL}api/ai/threat_stream?email=${encodeURIComponent(email)}`;
        const es = new EventSource(url);
        esRef.current = es;

        es.addEventListener('threat', (evt) => {
            try {
                const agent = JSON.parse(evt.data);
                setSseConnected(true);
                setLoading(false);

                setAiSummary(prev => {
                    const agents = [...(prev.agents || [])];
                    const idx = agents.findIndex(a => a.agent_name === agent.agent_name);
                    const updated = {
                        agent_id: agent.agent_id,
                        agent_name: agent.agent_name,
                        email: agent.email,
                        last_assessment: {
                            threat_level: agent.threat_level,
                            final_score: agent.final_score,
                            timestamp: agent.timestamp,
                            layer_contributions: agent.layer_contributions || {},
                            anomalous_features: agent.anomalous_features || [],
                            critical_alerts: agent.critical_alerts || [],
                            network_alerts: agent.network_alerts || [],
                            system_status: agent.system_status || {},
                        },
                        stream_length: agent.stream_length || 0,
                        last_metric_ts: agent.timestamp || agent.last_metric_ts,
                        status: {
                            samples_processed: agent.system_status?.total_samples || 0,
                            layers: { hybrid: { active: agent.system_status?.hybrid_active } },
                        },
                        recent_alerts: idx >= 0 ? (agents[idx].recent_alerts || []) : [],
                    };
                    if (idx >= 0) agents[idx] = updated;
                    else agents.push(updated);
                    return { ...prev, agents, agent_count: agents.length };
                });
            } catch (e) {
                console.warn('[SSE] parse error', e);
            }
        });

        es.onerror = () => setSseConnected(false);

        return () => {
            es.close();
            esRef.current = null;
            setSseConnected(false);
        };
    }, [email]);

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

    const updateAgentThreshold = async (agentName, level) => {
        // Compute inside functional setter to read latest state — avoids stale closure
        // when two agents update rapidly (second would overwrite first otherwise).
        let newThresholds;
        setSettings(prev => {
            const prevThresholds = prev.agent_thresholds || {};
            newThresholds = level === null
                ? Object.fromEntries(Object.entries(prevThresholds).filter(([k]) => k !== agentName))
                : { ...prevThresholds, [agentName]: level };
            return { ...prev, agent_thresholds: newThresholds };
        });
        try {
            await axios.put(api('api/notify/settings'), { agent_thresholds: newThresholds }, { params: { email } });
            showMsg('ok', level ? `${agentName} → ${level.toUpperCase()}.` : `${agentName} reset to global.`);
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
    // Merge Bedrock ai_summary text from notification engine into each agent card.
    const summaryAgents = aiSummary?.agents || [];
    const notifyAgentMap = useMemo(() => {
        const m = {};
        for (const a of (aiThreats?.agents || [])) {
            if (a.agent_id) m[a.agent_id] = a.ai_summary || '';
        }
        return m;
    }, [aiThreats]);

    const aiAgents = useMemo(() => {
        if (summaryAgents.length > 0) {
            return summaryAgents.map(a => ({
                ...a,
                ai_summary: a.ai_summary || notifyAgentMap[a.agent_name] || notifyAgentMap[a.agent_id] || '',
            }));
        }
        return aiThreats?.agents || [];
    }, [summaryAgents, aiThreats, notifyAgentMap]);

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

                <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2.5 h-2.5 rounded-full border-2 border-black ${sseConnected ? 'bg-[#CEFFBC] animate-pulse' : 'bg-gray-300'}`} />
                    <span className="font-mono text-xs font-bold uppercase text-gray-500">
                        {sseConnected ? 'Live' : 'Connecting…'}
                    </span>
                </div>

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
                        <ThreatsView overallLevel={overallLevel} aiAgents={aiAgents} autoDetector={autoDetector} hasSummary={summaryAgents.length > 0} enrichedAgents={enrichedAgents} />
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
                            updateAgentThreshold={updateAgentThreshold}
                            actionLoading={actionLoading}
                            agents={enrichedAgents}
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

function ThreatsView({ overallLevel, aiAgents, autoDetector, hasSummary, enrichedAgents }) {
    const levelLabel = (overallLevel || 'normal').toUpperCase();
    const isCritical = THREAT_RANK[overallLevel] >= 3;

    const agentStatusMap = useMemo(() => {
        const m = {};
        for (const a of (enrichedAgents || [])) m[a.DeviceName] = a.DisplayStatus;
        return m;
    }, [enrichedAgents]);

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
                    {[...aiAgents]
                        .sort((a, b) => {
                            const la = a.last_assessment?.threat_level || a.threat_level || 'normal';
                            const lb = b.last_assessment?.threat_level || b.threat_level || 'normal';
                            return (THREAT_RANK[lb] || 0) - (THREAT_RANK[la] || 0);
                        })
                        .map((t, idx) => (
                            hasSummary
                                ? <AgentThreatCard key={idx} agent={t} dealerStatus={agentStatusMap[t.agent_name]} />
                                : <LegacyThreatCard key={idx} t={t} />
                        ))}
                </div>
            )}
        </div>
    );
}

function AiSummaryBlock({ summary }) {
    if (!summary) return null;
    return (
        <div className="pt-2 border-t-2 border-dashed border-gray-300">
            <p className="font-black uppercase text-gray-700 mb-1 flex items-center gap-1">
                <BrainCircuit size={14} /> AI Analyst Summary
                <span className="ml-1 text-[10px] font-mono font-bold text-gray-400 normal-case">AWS Nova Lite</span>
            </p>
            <div className="bg-[#f4f0ff] border-2 border-black p-2 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                {summary}
            </div>
        </div>
    );
}

function AgentThreatCard({ agent, dealerStatus }) {
    const last = agent.last_assessment || {};
    const level = last.threat_level || 'normal';
    const layers = last.layer_contributions || {};
    const recentAlerts = agent.recent_alerts || [];
    const status = agent.status || {};
    const samples = status.samples_processed || 0;
    const layerStatus = status.layers || {};
    const aiSummary = agent.ai_summary || last.ai_summary || '';
    const headline = aiHeadline(aiSummary);

    const isOffline = dealerStatus && dealerStatus !== 'Online';
    const lastMetricAge = agent.last_metric_ts
        ? Math.floor((Date.now() - new Date(agent.last_metric_ts).getTime()) / 1000)
        : null;
    const isStale = isOffline || (lastMetricAge !== null && lastMetricAge > 120);

    const getLayerInfo = (lyr) => {
        const v = layers[lyr];
        if (!v || typeof v !== 'object') return { score: 0, contribution: 0, active: false };
        return {
            score: Math.max(0, Math.min(1, v.score || 0)),
            contribution: Math.max(0, Math.min(1, v.contribution || 0)),
            active: v.active !== false,
        };
    };

    const hybridInfo = getLayerInfo('hybrid');
    const hybridLS = layerStatus.hybrid || {};
    const hybridActive = hybridInfo.active && hybridLS.active !== false;

    // Use live hybrid score — avoids static final_score from backend
    const score = hybridActive
        ? hybridInfo.score
        : (typeof last.final_score === 'number' ? last.final_score : 0);
    const scorePct = Math.round(score * 100);

    const warmupNeeded = !hybridActive && hybridLS.needed
        ? Math.max(0, hybridLS.needed - (hybridLS.samples || samples || 0))
        : 0;

    const scoreBarColor =
        THREAT_RANK[level] >= 3 ? 'bg-[#FF6B6B]' :
        THREAT_RANK[level] >= 2 ? 'bg-[#FFECA0]' : 'bg-[#CEFFBC]';

    return (
        <div
            className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] flex flex-col"
            style={{ borderLeftWidth: '12px', borderLeftColor: LEVEL_ACCENT_HEX[level] }}
        >
            {/* ── Header ── */}
            <div className={`p-4 border-b-4 border-black ${LEVEL_BG[level]} ${LEVEL_TEXT[level]}`}>
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <AlertTriangle size={24} className="shrink-0 mt-0.5" />
                        <div className="min-w-0">
                            <h3 className="font-black uppercase text-lg sm:text-xl truncate">{agent.agent_name}</h3>
                            <p className="font-mono text-xs uppercase opacity-80 mt-0.5">{level}</p>
                        </div>
                    </div>
                    <div className="shrink-0 text-right bg-black/20 border-2 border-black/40 px-3 py-1.5">
                        <p className="font-mono text-[10px] uppercase opacity-70">Hybrid AI</p>
                        <p className="font-black text-2xl leading-none mt-0.5">{scorePct}%</p>
                    </div>
                </div>
                {headline && (
                    <p className="mt-3 font-mono text-xs sm:text-sm font-bold leading-snug border-t-2 border-black/30 pt-2 opacity-90">
                        ▸ {headline}
                    </p>
                )}
            </div>

            {/* ── Hybrid AI Engine Block ── */}
            <div className="p-4 border-b-4 border-black">
                <div className="flex items-center justify-between mb-2">
                    <span className="font-black uppercase text-xs flex items-center gap-1.5 text-gray-700">
                        <BrainCircuit size={14} /> Hybrid AI Engine
                    </span>
                    {hybridActive ? (
                        <span className="px-2 py-0.5 border-2 border-black bg-[#CEFFBC] font-mono text-[10px] font-black uppercase">
                            ACTIVE · RL ε {(hybridLS.rl_epsilon || 0).toFixed(3)}
                        </span>
                    ) : warmupNeeded > 0 ? (
                        <span className="px-2 py-0.5 border-2 border-black bg-[#FFECA0] font-mono text-[10px] font-black uppercase">
                            WARMUP — {warmupNeeded} more samples
                        </span>
                    ) : (
                        <span className="px-2 py-0.5 border-2 border-black bg-gray-200 font-mono text-[10px] font-black uppercase">
                            IDLE
                        </span>
                    )}
                </div>

                {/* Score bar */}
                <div className="h-7 border-2 border-black bg-gray-100 relative overflow-hidden">
                    <div
                        className={`h-full transition-all duration-700 ${scoreBarColor}`}
                        style={{ width: `${scorePct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center font-black font-mono text-xs text-black">
                        {scorePct}% threat confidence
                    </span>
                </div>

                {/* Metrics row */}
                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t-2 border-dashed border-gray-200">
                    <Stat label="Samples" value={samples.toLocaleString()} stale={isStale} />
                    <Stat label="Stream" value={(agent.stream_length || 0).toLocaleString()} stale={isStale} />
                    <Stat label="Last seen" value={agent.last_metric_ts ? new Date(agent.last_metric_ts).toLocaleTimeString() : '—'} />
                </div>
                {isStale && (
                    <div className="mt-2 flex items-center gap-2 px-2 py-1 border-2 border-black bg-gray-200 font-mono text-[10px] font-black uppercase text-gray-600">
                        <span className="w-2 h-2 rounded-full bg-gray-500 shrink-0" />
                        {isOffline ? `Agent ${dealerStatus?.toUpperCase() || 'OFFLINE'} — metrics frozen` : 'No data >2 min — metrics frozen'}
                    </div>
                )}
            </div>

            {/* ── Recent Detections ── */}
            {recentAlerts.length > 0 && (
                <div className="p-4 border-b-4 border-black">
                    <p className="font-black uppercase text-xs text-gray-600 mb-2 flex items-center gap-1.5">
                        <Activity size={12} /> Recent Detections ({recentAlerts.length})
                    </p>
                    <ul className="space-y-1.5 max-h-32 overflow-auto">
                        {recentAlerts.slice(0, 5).map((al, i) => {
                            const alLevel = al.threat_level || 'low';
                            const alScore = Math.round((al.final_score || 0) * 100);
                            return (
                                <li key={i} className={`flex items-center gap-2 px-2 py-1 border-2 border-black ${LEVEL_BG[alLevel]} ${LEVEL_TEXT[alLevel]}`}>
                                    <span className="font-black uppercase text-xs w-16 shrink-0">{alLevel}</span>
                                    <div className="flex-1 h-2 bg-black/20 border border-black/30 overflow-hidden">
                                        <div className="h-full bg-black/50" style={{ width: `${alScore}%` }} />
                                    </div>
                                    <span className="font-mono text-xs font-bold w-10 text-right shrink-0">{alScore}%</span>
                                    <span className="font-mono text-[10px] opacity-70 shrink-0 hidden sm:block">
                                        {al.timestamp ? new Date(al.timestamp).toLocaleTimeString() : '—'}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {/* ── AI Analyst (collapsible) ── */}
            {aiSummary && (
                <details className="p-4 group">
                    <summary className="cursor-pointer font-black uppercase text-xs text-gray-600 select-none flex items-center justify-between hover:text-black">
                        <span className="flex items-center gap-1.5">
                            <BrainCircuit size={12} /> AI Analyst Summary
                            <span className="font-mono font-normal normal-case text-[10px] text-gray-400 ml-1">AWS Nova Lite</span>
                        </span>
                        <span className="font-mono text-[10px] text-gray-500 group-open:hidden">expand ▼</span>
                        <span className="font-mono text-[10px] text-gray-500 hidden group-open:inline">collapse ▲</span>
                    </summary>
                    <div className="mt-3 bg-[#f4f0ff] border-2 border-black p-3 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                        {aiSummary}
                    </div>
                </details>
            )}
        </div>
    );
}


function Stat({ label, value, stale }) {
    return (
        <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-gray-500">{label}</span>
            <span className={`font-black truncate ${stale ? 'text-gray-400' : ''}`}>{value}</span>
        </div>
    );
}

function LegacyThreatCard({ t }) {
    const level = t.threat_level || 'normal';
    const aiSummary = t.ai_summary || '';
    const headline = aiHeadline(aiSummary);
    return (
        <div
            className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000]"
            style={{ borderLeftWidth: '12px', borderLeftColor: LEVEL_ACCENT_HEX[level] }}
        >
            <div className={`p-4 border-b-4 border-black ${LEVEL_BG[level]} ${LEVEL_TEXT[level]}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={24} />
                        <h3 className="font-black uppercase text-lg sm:text-xl">{level}</h3>
                    </div>
                    <span className="font-mono text-xs font-black uppercase px-2 py-1 border-2 border-black bg-white text-black">
                        Score {(t.final_score || 0).toFixed(2)}
                    </span>
                </div>
                {headline && (
                    <p className="mt-3 font-mono text-xs sm:text-sm font-bold leading-snug border-t-2 border-black/40 pt-2">
                        ▸ {headline}
                    </p>
                )}
            </div>
            <div className="p-4 font-mono text-sm space-y-2">
                <div className="flex justify-between border-b-2 border-dashed border-gray-300 pb-2">
                    <span className="font-bold text-gray-500 uppercase">Agent</span>
                    <span className="font-black truncate ml-2">{t.agent_id}</span>
                </div>
                <div className="flex justify-between border-b-2 border-dashed border-gray-300 pb-2">
                    <span className="font-bold text-gray-500 uppercase">Time</span>
                    <span className="font-black">{t.timestamp || '—'}</span>
                </div>
                <AiSummaryBlock summary={aiSummary} />
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
                threatData.map((threat, idx) => {
                    // Go service returns threats_found + safe_ips (not malicious_ips)
                    const maliciousIps = Array.isArray(threat.threats_found) ? threat.threats_found
                        : Array.isArray(threat.malicious_ips) ? threat.malicious_ips : [];
                    const safeIps = Array.isArray(threat.safe_ips) ? threat.safe_ips : [];
                    const scanned = threat.total_ips_scanned || threat.ips_analyzed || threat.scanned_count
                        || (maliciousIps.length + safeIps.length) || 0;
                    const blocked = threat.blocked_ips || threat.blocked_count || 0;
                    const threatRate = scanned > 0 ? ((maliciousIps.length / scanned) * 100).toFixed(1) : null;
                    const agentLabel = threat.agent_name || threat.device_name || threat.DeviceName || threat.hostname || threat.interface || 'UNKNOWN AGENT';
                    return (
                        <div key={idx} className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] overflow-hidden">
                            {/* Agent header */}
                            <div className="flex flex-col md:flex-row">
                                <div className="w-full md:w-36 lg:w-44 bg-[#FF6B6B] border-b-[3px] md:border-b-0 md:border-r-4 border-black p-4 sm:p-6 flex flex-col items-center justify-center text-white text-center shrink-0">
                                    <AlertTriangle size={32} className="mb-2" />
                                    <p className="text-4xl font-black">{threat.threat_count || 0}</p>
                                    <p className="font-mono text-xs font-black uppercase tracking-widest mt-1">Incidents</p>
                                    {maliciousIps.length > 0 && (
                                        <p className="font-mono text-xs mt-2 bg-black/20 px-2 py-0.5 font-bold">{maliciousIps.length} Malicious IPs</p>
                                    )}
                                </div>
                                <div className="p-4 sm:p-6 flex-grow space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <h3 className="text-xl sm:text-2xl font-black uppercase flex items-center gap-2">
                                            <Cpu size={20} className="text-gray-400 shrink-0" />
                                            {agentLabel}
                                        </h3>
                                        <div className="flex flex-wrap gap-2 shrink-0">
                                            {threat.threat_count > 0 && (
                                                <span className="px-3 py-1.5 border-4 border-black bg-[#FFECA0] font-mono text-xs font-black uppercase shadow-[3px_3px_0_#000]">
                                                    RISK: HIGH
                                                </span>
                                            )}
                                            {blocked > 0 && (
                                                <span className="px-3 py-1.5 border-4 border-black bg-[#CEFFBC] font-mono text-xs font-black uppercase shadow-[3px_3px_0_#000]">
                                                    {blocked} Blocked
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Stats grid */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                                        <div className="bg-[#FF6B6B]/10 border-2 border-black p-2 text-center">
                                            <p className="text-[10px] uppercase font-bold text-gray-500">Malicious IPs</p>
                                            <p className="text-xl font-black text-[#FF6B6B]">{maliciousIps.length}</p>
                                        </div>
                                        <div className="bg-[#CEFFBC]/40 border-2 border-black p-2 text-center">
                                            <p className="text-[10px] uppercase font-bold text-gray-500">Safe IPs</p>
                                            <p className="text-xl font-black">{safeIps.length}</p>
                                        </div>
                                        <div className="bg-gray-100 border-2 border-black p-2 text-center">
                                            <p className="text-[10px] uppercase font-bold text-gray-500">Total Scanned</p>
                                            <p className="text-xl font-black">{scanned > 0 ? scanned.toLocaleString() : '0'}</p>
                                        </div>
                                        <div className="bg-[#FFECA0]/60 border-2 border-black p-2 text-center">
                                            <p className="text-[10px] uppercase font-bold text-gray-500">Threat Rate</p>
                                            <p className="text-xl font-black">{scanned > 0 ? `${threatRate}%` : '—'}</p>
                                        </div>
                                    </div>

                                    {/* Scope + network */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-sm">
                                        <div className="border-2 border-black p-3 bg-gray-50">
                                            <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Source Scope</p>
                                            <p className="font-black">{threat.interface || 'ALL NETWORKS'}</p>
                                        </div>
                                        <div className="border-2 border-black p-3 bg-gray-50">
                                            <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Network</p>
                                            <p className="font-black">{threat.network || 'DEFAULT'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Malicious IPs list */}
                            {maliciousIps.length > 0 && (
                                <details className="border-t-4 border-black group">
                                    <summary className="p-3 sm:p-4 cursor-pointer font-black uppercase text-xs flex items-center justify-between bg-gray-50 hover:bg-gray-100 select-none">
                                        <span className="flex items-center gap-2">
                                            <ShieldAlert size={14} className="text-[#FF6B6B]" />
                                            Malicious IP List ({maliciousIps.length})
                                        </span>
                                        <span className="font-mono text-[10px] text-gray-500 group-open:hidden">expand ▼</span>
                                        <span className="font-mono text-[10px] text-gray-500 hidden group-open:inline">collapse ▲</span>
                                    </summary>
                                    <div className="p-3 sm:p-4 border-t-2 border-black bg-white">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-auto">
                                            {maliciousIps.map((item, i) => {
                                                const ip = typeof item === 'object' ? (item.ip || JSON.stringify(item)) : item;
                                                const count = typeof item === 'object' ? item.count : null;
                                                const severity = typeof item === 'object' ? item.severity : null;
                                                return (
                                                    <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 border-2 border-black bg-gray-50 font-mono text-xs">
                                                        <span className="font-black truncate">{ip}</span>
                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                            {count !== null && (
                                                                <span className="bg-black text-white px-1.5 py-0.5 text-[10px] font-bold">×{count}</span>
                                                            )}
                                                            {severity && (
                                                                <span className={`px-1.5 py-0.5 text-[10px] font-black uppercase border border-black ${LEVEL_BG[severity] || 'bg-gray-200'} ${LEVEL_TEXT[severity] || 'text-black'}`}>
                                                                    {severity}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </details>
                            )}

                            {/* Footer */}
                            <div className="px-4 py-3 border-t-2 border-dashed border-gray-300 flex flex-wrap gap-4 text-xs font-mono font-bold text-gray-500 uppercase bg-gray-50">
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-black block" />
                                    Last: {threat.last_updated ? new Date(threat.last_updated).toLocaleString() : new Date().toLocaleString()}
                                </span>
                                {threat.first_seen && (
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-gray-400 block" />
                                        First: {new Date(threat.first_seen).toLocaleString()}
                                    </span>
                                )}
                                {threat.port && (
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-gray-400 block" />
                                        Port: {threat.port}
                                    </span>
                                )}
                                {threat.protocol && (
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-gray-400 block" />
                                        Proto: {threat.protocol}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}

// ── Recipients View ─────────────────────────────────────────────────────

function RecipientsView({
    recipients, settings, recipientForm, setRecipientForm,
    addRecipient, deleteRecipient, toggleRecipient, sendTest,
    updateMinLevel, updateAgentThreshold, actionLoading, agents,
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

            {/* Global threshold control */}
            <div className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] p-4 sm:p-6 space-y-3">
                <h3 className="font-black uppercase text-lg sm:text-xl flex items-center gap-2">
                    <SlidersHorizontal size={22} /> Global Notify Threshold
                </h3>
                <p className="font-mono text-xs sm:text-sm text-gray-600 uppercase font-bold">
                    Default for all agents — overridden per-agent below.
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

            {/* Per-agent threshold overrides */}
            {agents && agents.length > 0 && (
                <div className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] p-4 sm:p-6 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className="font-black uppercase text-lg sm:text-xl flex items-center gap-2">
                            <Server size={22} /> Per-Agent Thresholds
                        </h3>
                        <span className="font-mono text-xs text-gray-500 uppercase font-bold border-2 border-gray-300 px-2 py-1">
                            Global default: {settings.min_threat_level?.toUpperCase()}
                        </span>
                    </div>
                    <p className="font-mono text-xs text-gray-600 uppercase font-bold">
                        Override alert sensitivity per agent. Custom badge = overridden.
                    </p>
                    <div className="space-y-2">
                        {agents.map((agent, idx) => {
                            const agentName = agent.DeviceName;
                            const override = settings.agent_thresholds?.[agentName];
                            const effective = override || settings.min_threat_level;
                            return (
                                <div key={agentName || idx} className="border-2 border-black p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${agent.DisplayStatus === 'Online' ? 'bg-[#CEFFBC] border-2 border-black' : agent.DisplayStatus === 'Maintenance' ? 'bg-[#7EA0FD] border-2 border-black' : 'bg-[#FF6B6B] border-2 border-black'}`} />
                                        <span className="font-black uppercase truncate text-sm">{agentName}</span>
                                        <span className="font-mono text-[10px] text-gray-500 uppercase hidden sm:inline">{agent.DisplayStatus}</span>
                                        {override ? (
                                            <span className="text-[10px] font-mono font-black bg-[#7EA0FD] text-white px-1.5 py-0.5 border border-black uppercase shrink-0">CUSTOM</span>
                                        ) : (
                                            <span className="text-[10px] font-mono font-bold bg-gray-200 text-gray-600 px-1.5 py-0.5 border border-gray-300 uppercase shrink-0">GLOBAL</span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {THREAT_LEVELS.map(lvl => (
                                            <button
                                                key={lvl}
                                                onClick={() => updateAgentThreshold(agentName, lvl)}
                                                className={`px-3 py-1 border-2 border-black font-mono font-black uppercase text-xs shadow-[2px_2px_0_#000] transition-all hover:-translate-y-0.5
                                                    ${effective === lvl
                                                        ? `${LEVEL_BG[lvl]} ${LEVEL_TEXT[lvl]}`
                                                        : 'bg-white text-black'}`}
                                            >
                                                {lvl}
                                            </button>
                                        ))}
                                        {override && (
                                            <button
                                                onClick={() => updateAgentThreshold(agentName, null)}
                                                className="px-3 py-1 border-2 border-black bg-white text-gray-500 font-mono font-black uppercase text-xs shadow-[2px_2px_0_#000] hover:-translate-y-0.5 transition-all"
                                            >
                                                ↺ Reset
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

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
