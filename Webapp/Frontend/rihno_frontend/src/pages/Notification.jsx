import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from "react-oidc-context";
import { backendConfig } from "../authConfig.js";
import { Loader2, Server, ShieldAlert, Cpu, Activity, AlertTriangle, Shield, CheckCircle, XCircle } from 'lucide-react';

function Notification() {
    const auth = useAuth();
    const email = auth.user?.profile?.email || '';

    const [activeTab, setActiveTab] = useState('agents'); // 'agents' | 'threats'
    const [agents, setAgents] = useState([]);
    const [threatData, setThreatData] = useState([]);
    const [agentStatuses, setAgentStatuses] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!email) return;

        const fetchData = async () => {
            try {
                // Fetch Agents
                const agentsRes = await axios.get(`${backendConfig.backendURL}api/list_all_devices`, { params: { email } }).catch(() => ({ data: [] }));
                setAgents(Array.isArray(agentsRes.data) ? agentsRes.data : []);

                // Fetch Dynamic Status
                const statusRes = await axios.get(`${backendConfig.dealerURL}/agents/status`, { params: { email } }).catch(() => ({ data: [] }));
                const statusMap = {};
                if (statusRes.data && Array.isArray(statusRes.data)) {
                    statusRes.data.forEach(s => statusMap[s.agent_name] = s);
                }
                setAgentStatuses(statusMap);

                // Fetch IP Threats
                const threatsRes = await axios.get(`${backendConfig.backendURL}api/ip_threats`, { params: { email } }).catch(() => ({ data: { data: [] } }));
                if (threatsRes.data && threatsRes.data.data) {
                    setThreatData(threatsRes.data.data);
                }
            } catch (err) {
                console.error("Error fetching notification data:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const id = setInterval(fetchData, 10000);
        return () => clearInterval(id);
    }, [email]);

    const enrichedAgents = agents.map(server => {
        let displayStatus = server.Status;
        if (displayStatus !== 'Maintenance') {
            const dynamicStatus = agentStatuses[server.DeviceName];
            displayStatus = (dynamicStatus && dynamicStatus.is_active) ? 'Online' : 'Offline';
        }
        return { ...server, DisplayStatus: displayStatus };
    });

    return (
        <div className="flex flex-col items-center animate-fade-in w-full p-3 sm:p-4 md:p-6 min-h-screen bg-white font-sans text-black">

            {/* Header */}
            <div className="mb-8 sm:mb-10 md:mb-12 w-full max-w-5xl xl:max-w-6xl flex flex-col items-center">
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black uppercase leading-none text-center mb-4 sm:mb-6">
                    OVERVIEW
                    <span className="block md:inline-block bg-[#CEFFBC] border-[3px] sm:border-[4px] border-black px-3 sm:px-4 ml-0 md:ml-4 mt-2 md:mt-0 shadow-[5px_5px_0_#000] sm:shadow-[6px_6px_0_#000] md:shadow-[8px_8px_0_#000]">
                        CENTER
                    </span>
                </h1>

                {/* Tab Navigation */}
                <div className="flex flex-wrap justify-center gap-3 sm:gap-4 mt-3 sm:mt-4">
                    <button
                        onClick={() => setActiveTab('agents')}
                        className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 border-[3px] sm:border-4 border-black font-mono font-black uppercase text-base sm:text-lg md:text-xl transition-all shadow-[4px_4px_0_#000] sm:shadow-[6px_6px_0_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0_#000] sm:hover:shadow-[8px_8px_0_#000] ${activeTab === 'agents' ? 'bg-black text-white' : 'bg-white text-black'}`}>
                        <Server size={20} className="sm:w-6 sm:h-6" />
                        Agent Status
                    </button>
                    <button
                        onClick={() => setActiveTab('threats')}
                        className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 border-[3px] sm:border-4 border-black font-mono font-black uppercase text-base sm:text-lg md:text-xl transition-all shadow-[4px_4px_0_#000] sm:shadow-[6px_6px_0_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0_#000] sm:hover:shadow-[8px_8px_0_#000] ${activeTab === 'threats' ? 'bg-[#FF6B6B] text-white' : 'bg-white text-black'}`}>
                        <ShieldAlert size={20} className="sm:w-6 sm:h-6" />
                        IP Threats
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center gap-4 p-8 sm:p-12 border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                    <Loader2 className="animate-spin text-black" size={36} />
                    <p className="font-mono text-lg sm:text-2xl font-black uppercase tracking-widest">Gathering Telemetry…</p>
                </div>
            ) : (
                <div className="w-full max-w-5xl xl:max-w-6xl">
                    {/* View: Agents */}
                    {activeTab === 'agents' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                            {enrichedAgents.length === 0 ? (
                                <div className="col-span-full p-8 sm:p-12 border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] text-center">
                                    <p className="font-mono text-base sm:text-xl font-black uppercase">No Agents Available.</p>
                                </div>
                            ) : (
                                enrichedAgents.map((agent, idx) => (
                                    <div key={idx} className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] hover:-translate-y-1 hover:shadow-[8px_8px_0_#000] sm:hover:shadow-[10px_10px_0_#000] transition-all flex flex-col h-full">
                                        <div className={`p-4 border-b-4 border-black flex items-center justify-between ${agent.DisplayStatus === 'Online' ? 'bg-[#CEFFBC]' : agent.DisplayStatus === 'Maintenance' ? 'bg-[#7EA0FD]' : 'bg-[#FF6B6B]'}`}>
                                            <div className="flex items-center gap-3">
                                                {agent.DisplayStatus === 'Online' ? <CheckCircle size={28} className="text-black" /> :
                                                    agent.DisplayStatus === 'Maintenance' ? <Activity size={28} className="text-white" /> :
                                                        <XCircle size={28} className="text-white" />}
                                                <h3 className={`font-black text-2xl uppercase ${agent.DisplayStatus === 'Online' ? 'text-black' : 'text-white'}`}>{agent.DeviceName}</h3>
                                            </div>
                                            <span className={`font-mono text-xs font-black uppercase px-2 py-1 border-2 border-black bg-white text-black shadow-[2px_2px_0_#000]`}>
                                                {agent.DisplayStatus}
                                            </span>
                                        </div>
                                        <div className="p-4 flex-grow bg-gray-50">
                                            <div className="font-mono text-sm space-y-3">
                                                <div className="flex justify-between border-b-2 border-dashed border-gray-300 pb-2">
                                                    <span className="font-bold text-gray-500">TYPE</span>
                                                    <span className="font-black">{agent.DeviceType || 'UNKNOWN'}</span>
                                                </div>
                                                <div className="flex justify-between border-b-2 border-dashed border-gray-300 pb-2">
                                                    <span className="font-bold text-gray-500">LOCATION</span>
                                                    <span className="font-black">{agent.Location || 'UNKNOWN'}</span>
                                                </div>
                                                <div className="flex justify-between border-b-2 border-dashed border-gray-300 pb-2">
                                                    <span className="font-bold text-gray-500">CREATED</span>
                                                    <span className="font-black">{new Date(agent.DateCreated).toLocaleDateString() || 'UNKNOWN'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* View: Threats */}
                    {activeTab === 'threats' && (
                        <div className="space-y-4 sm:space-y-6">
                            {/* Aggregated Threat Summary */}
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
                                    <p className="text-4xl sm:text-5xl font-black mt-1">
                                        {threatData.reduce((acc, curr) => acc + (curr.threat_count || 0), 0)}
                                    </p>
                                </div>
                            </div>

                            {/* Threat Detail List */}
                            {threatData.length === 0 ? (
                                <div className="p-8 sm:p-12 border-[3px] sm:border-4 border-black bg-[#CEFFBC] shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] text-center">
                                    <Shield size={48} className="mx-auto mb-4 text-black" />
                                    <p className="font-mono text-lg sm:text-2xl font-black uppercase text-black">Zero IP Threats Detected.</p>
                                </div>
                            ) : (
                                threatData.map((threat, idx) => (
                                    <div key={idx} className="border-[3px] sm:border-4 border-black bg-white shadow-[5px_5px_0_#000] sm:shadow-[8px_8px_0_#000] hover:-translate-y-1 hover:shadow-[8px_8px_0_#000] sm:hover:shadow-[10px_10px_0_#000] transition-all overflow-hidden flex flex-col md:flex-row">
                                        {/* Threat Indicator */}
                                        <div className="w-full md:w-40 lg:w-48 bg-[#FF6B6B] border-b-[3px] sm:border-b-4 md:border-b-0 md:border-r-[3px] md:sm:border-r-4 border-black p-4 sm:p-6 flex flex-col items-center justify-center text-white text-center">
                                            <AlertTriangle size={36} className="sm:w-10 sm:h-10 mb-2" />
                                            <p className="text-3xl sm:text-4xl font-black">{threat.threat_count || 0}</p>
                                            <p className="font-mono text-xs font-black uppercase tracking-widest mt-1">Incidents</p>
                                        </div>

                                        {/* Threat Details */}
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
                                                        <p className="font-black text-lg">{threat.interface ? threat.interface : 'ALL NETWORKS'}</p>
                                                    </div>
                                                    {threat.malicious_ips && Array.isArray(threat.malicious_ips) && threat.malicious_ips.length > 0 && (
                                                        <div>
                                                            <p className="font-bold text-gray-500 uppercase text-xs mb-1">Top Offenders</p>
                                                            <div className="flex flex-wrap gap-2 mt-1">
                                                                {threat.malicious_ips.slice(0, 3).map((item, i) => (
                                                                    <span key={i} className="bg-black text-white px-2 py-1 text-xs border border-transparent hover:border-white transition-all cursor-crosshair">
                                                                        {typeof item === 'object' ? item.ip || JSON.stringify(item) : item}
                                                                    </span>
                                                                ))}
                                                                {threat.malicious_ips.length > 3 && (
                                                                    <span className="bg-gray-300 text-black px-2 py-1 text-xs font-bold border border-black hover:bg-black hover:text-white transition-all">
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
                    )}
                </div>
            )}
        </div>
    );
}

export default Notification;