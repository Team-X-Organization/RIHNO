import React, { useState, useEffect, useCallback } from 'react';
import { ResponsiveNetworkCanvas } from '@nivo/network';
import { useAuth } from "react-oidc-context";
import axios from 'axios';
import { backendConfig } from "../authConfig.js";
import { Loader2, MapPin, Cpu, Calendar, Search, Filter, Activity, Server, Maximize2, Minimize2 } from 'lucide-react';

const NetworkMap = () => {
    const auth = useAuth();
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");

    // Stores parsed map graphs per deviceName
    const [maps, setMaps] = useState({});
    const [expanded, setExpanded] = useState({});
    const [fetchingMap, setFetchingMap] = useState({});
    const [agentStatuses, setAgentStatuses] = useState({});

    // Fetch dynamic agent statuses every 10s
    useEffect(() => {
        const email = auth.user?.profile?.email;
        if (!email) return;

        const fetchStatuses = async () => {
            try {
                const { data } = await axios.get(`${backendConfig.dealerURL}/agents/status`, { params: { email } });
                const statusMap = {};
                if (data) {
                    data.forEach(s => statusMap[s.agent_name] = s);
                }
                setAgentStatuses(statusMap);
            } catch (err) { }
        };
        fetchStatuses();
        const id = setInterval(fetchStatuses, 10000);
        return () => clearInterval(id);
    }, [auth.user?.profile?.email]);

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

    const fetchNetworkMap = useCallback(async (deviceName) => {
        const email = auth.user?.profile?.email;
        if (!email) return;

        setFetchingMap(prev => ({ ...prev, [deviceName]: true }));
        try {
            const { data } = await axios.get(`${backendConfig.dealerURL}/metrics/network_map`, {
                params: { email, device_name: deviceName }
            });

            if (!data || !data.connections) {
                setMaps(prev => ({ ...prev, [deviceName]: { nodes: [], links: [] } }));
                return;
            }

            // Parse raw connections into nodes and links
            const nodesMap = new Map();
            const links = [];

            // Add the root agent node first
            nodesMap.set(deviceName, { id: deviceName, radius: 18, color: '#ff6b6b', type: 'agent' });

            data.connections.forEach(conn => {
                const srcId = conn.local_ip;
                const dstId = conn.remote_ip || 'Unknown';

                // Add Local IP node (if not exists)
                if (!nodesMap.has(srcId)) {
                    nodesMap.set(srcId, { id: srcId, radius: 10, color: '#38bdf8', type: 'local' });
                }

                // Add Remote IP node (if not exists)
                if (!nodesMap.has(dstId)) {
                    nodesMap.set(dstId, {
                        id: dstId,
                        radius: 8,
                        color: conn.is_suspicious ? '#ef4444' : (conn.is_private ? '#34d399' : '#fb923c'),
                        type: 'remote'
                    });
                }

                // Link Local IP to Remote IP
                links.push({ source: srcId, target: dstId, distance: conn.is_suspicious ? 100 : 60 });

                // Also link the agent to the Local IP (building a hub/spoke network tree)
                links.push({ source: deviceName, target: srcId, distance: 40 });
            });

            // Convert Map back to array format required by nivo
            setMaps(prev => ({
                ...prev,
                [deviceName]: { nodes: Array.from(nodesMap.values()), links }
            }));

        } catch (err) {
            console.error(err);
            setMaps(prev => ({ ...prev, [deviceName]: { nodes: [], links: [] } }));
        } finally {
            setFetchingMap(prev => ({ ...prev, [deviceName]: false }));
        }
    }, [auth.user?.profile?.email]);

    const toggleExpand = (deviceName) => {
        const isExp = expanded[deviceName];
        if (!isExp && !maps[deviceName]) {
            fetchNetworkMap(deviceName);
        }
        setExpanded(prev => ({ ...prev, [deviceName]: !isExp }));
    };

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

    return (
        <div className="flex flex-col items-center animate-fade-in w-full p-6 min-h-screen bg-white">
            {/* Header */}
            <div className="mb-14">
                <h1 className="text-6xl md:text-8xl font-black uppercase leading-none text-center">
                    NETWORK
                    <span className="block md:inline-block bg-[#FFECA0] border-[4px] border-black px-4 ml-0 md:ml-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                        MAP
                    </span>
                </h1>
            </div>

            {/* Filters */}
            <div className="w-full max-w-6xl mb-10 flex flex-col md:flex-row gap-4">
                <div className="relative flex-grow">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black" size={20} />
                    <input type="text" placeholder="SEARCH AGENT TOPOLOGY..." value={searchTerm}
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

            {/* List */}
            <div className="w-full max-w-6xl">
                {loading ? (
                    <div className="flex items-center justify-center gap-4 p-12 border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                        <Loader2 className="animate-spin" size={32} />
                        <p className="font-mono text-xl font-black uppercase tracking-widest">Constructing Maps…</p>
                    </div>
                ) : filteredServers.length > 0 ? (
                    <div className="space-y-6">
                        {filteredServers.map((server, index) => {
                            const isExp = expanded[server.DeviceName];
                            const isFetching = fetchingMap[server.DeviceName];
                            const mapData = maps[server.DeviceName];
                            const hasGraph = mapData && mapData.nodes && mapData.nodes.length > 0;

                            const statusClasses = server.DisplayStatus === 'Online'
                                ? 'bg-[#CEFFBC] text-black'
                                : server.DisplayStatus === 'Maintenance'
                                    ? 'bg-[#7EA0FD] text-white'
                                    : 'bg-[#FF6B6B] text-white';

                            return (
                                <div key={index} className="border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[10px_10px_0_rgba(0,0,0,1)] transition-all">
                                    {/* Header Row */}
                                    <div className="p-5 border-b-4 border-black flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-3 h-3 rounded-full border-2 border-black ${server.DisplayStatus === 'Online' ? 'bg-green-400 animate-pulse' : server.DisplayStatus === 'Maintenance' ? 'bg-blue-400' : 'bg-red-400'}`} />
                                            <h3 className="text-2xl font-black text-black uppercase">{server.DeviceName}</h3>
                                            <span className={`inline-block px-3 py-0.5 border-2 border-black text-[10px] font-black uppercase shadow-[3px_3px_0_rgba(0,0,0,1)] ${statusClasses}`}>
                                                {server.DisplayStatus}
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => toggleExpand(server.DeviceName)}
                                                className={`font-mono text-xs font-black px-4 py-2 border-2 border-black shadow-[3px_3px_0_#000] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#000] transition-all uppercase flex items-center gap-2 ${isExp ? 'bg-black text-white hover:bg-gray-800' : 'bg-[#e2e8f0] hover:bg-[#cbd5e1]'}`}>
                                                {isExp ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                                                {isExp ? 'Collapse Map' : 'View Network'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Meta Bar */}
                                    <div className="px-5 py-3 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 font-mono text-[11px] font-bold text-gray-600 uppercase bg-gray-50 border-white" style={isExp ? { borderBottom: '4px solid black' } : {}}>
                                        <div className="flex items-center gap-2"><MapPin size={14} /> {server.Location || 'N/A'}</div>
                                        <div className="flex items-center gap-2"><Cpu size={14} /> {server.DeviceType || 'N/A'}</div>
                                        <div className="flex items-center gap-2"><Calendar size={14} /> {server.DateCreated || 'N/A'}</div>
                                    </div>

                                    {/* Expanded Map Container */}
                                    {isExp && (
                                        <div className="w-full relative bg-[#0b0f19]" style={{ height: '600px' }}>
                                            {isFetching ? (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4 bg-[#0b0f19] z-10">
                                                    <Loader2 className="animate-spin" size={36} />
                                                    <p className="font-mono text-sm font-black uppercase">Interrogating Node Graph…</p>
                                                </div>
                                            ) : hasGraph ? (
                                                <>
                                                    {/* Map Legend overlay */}
                                                    <div className="absolute top-4 left-4 z-10 bg-black/80 backdrop-blur-sm border-2 border-gray-700 p-3 flex flex-col gap-2 font-mono text-[10px] text-white uppercase shadow-[4px_4px_0_rgba(0,0,0,1)]">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-full bg-[#ff6b6b] border border-white" /> Agent Node
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-full bg-[#38bdf8] border border-white" /> Local Interface
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-full bg-[#34d399] border border-white" /> Private Remote
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-full bg-[#fb923c] border border-white" /> Public Remote
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-full bg-[#ef4444] border border-white" /> Suspicious Flow
                                                        </div>
                                                    </div>
                                                    {/* Total Nodes summary */}
                                                    <div className="absolute bottom-4 right-4 z-10 bg-[#FFECA0] text-black border-2 border-black p-2 font-mono text-xs font-black uppercase shadow-[4px_4px_0_rgba(0,0,0,1)]">
                                                        Nodes: {mapData.nodes.length} | Links: {mapData.links.length}
                                                    </div>

                                                    <ResponsiveNetworkCanvas
                                                        data={mapData}
                                                        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                                                        linkDistance={e => e.distance}
                                                        centeringStrength={0.5}
                                                        repulsivity={12}
                                                        nodeColor={e => e.color}
                                                        nodeBorderWidth={2}
                                                        nodeBorderColor={{ from: 'color', modifiers: [['darker', 0.8]] }}
                                                        linkThickness={1.5}
                                                        linkColor={e => e.target.color === '#ef4444' ? '#ef4444' : '#475569'}
                                                        motionConfig="gentle"
                                                    />
                                                </>
                                            ) : (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-4 bg-[#0b0f19]">
                                                    <Activity size={36} className="opacity-50" />
                                                    <p className="font-mono text-sm font-black uppercase">No connection geometry detected for this agent.</p>
                                                </div>
                                            )}
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

export default NetworkMap;