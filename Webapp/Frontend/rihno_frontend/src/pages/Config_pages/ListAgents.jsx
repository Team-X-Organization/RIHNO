import React, { useEffect, useState } from 'react';
import { useAuth } from "react-oidc-context";
import axios from "axios";
import {
    Loader2,
    Copy,
    CheckCircle2,
    Key,
    Monitor,
    Search,
    Filter
} from 'lucide-react';
import { backendConfig } from "../../authConfig.js";

function ListAgents() {
    const auth = useAuth();
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [copiedId, setCopiedId] = useState(null);

    // Filter States
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");

    useEffect(() => {
        const fetchDevices = async () => {
            const email = auth.user?.profile?.email;
            if (!email) return;
            try {
                setLoading(true);
                const response = await axios.get(`${backendConfig.backendURL}api/list_all_devices`, {
                    params: { email: email }
                });
                setServers(response.data);
            } catch (error) {
                console.error("Error fetching devices:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchDevices();
    }, [auth.user?.profile?.email]);

    // Filtering Logic
    const filteredServers = servers.filter(server => {
        const matchesSearch = server.DeviceName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === "All" || server.Status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const handleCopy = (apiKey, index) => {
        if (!apiKey) return;
        navigator.clipboard.writeText(apiKey).then(() => {
            setCopiedId(index);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    return (
        <div className="max-w-4xl mx-auto p-6 animate-fade-in bg-white min-h-screen">
            <h2 className="text-3xl font-black uppercase mb-8 border-b-4 border-black pb-2 text-black">List Agents</h2>


            {/* --- FILTER BAR --- */}
            <div className="flex flex-col md:flex-row gap-4 mb-10">
                <div className="relative flex-grow">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black" size={20} />
                    <input
                        type="text"
                        placeholder="SEARCH INVENTORY..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 border-4 border-black font-mono font-bold uppercase outline-none focus:bg-yellow-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all"
                    />
                </div>
                <div className="relative">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-black pointer-events-none" size={20} />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="appearance-none pl-12 pr-10 py-4 border-4 border-black font-mono font-black uppercase outline-none bg-white cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:bg-[#7EA0FD] focus:text-white transition-all"
                    >
                        <option value="All">All Status</option>
                        <option value="Online">Online</option>
                        <option value="Maintenance">Maintenance</option>
                        <option value="Offline">Offline</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-4 p-12 border-4 border-dashed border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                    <Loader2 className="animate-spin text-black" size={32} />
                    <p className="font-mono font-black uppercase tracking-tighter text-xl text-black">Scanning Frequency...</p>
                </div>
            ) : filteredServers.length > 0 ? (
                <div className="space-y-6">
                    {filteredServers.map((server, index) => (
                        <div
                            key={index}
                            className="flex flex-col md:flex-row md:items-center justify-between p-6 border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                        >
                            {/* Device Identification */}
                            <div className="mb-4 md:mb-0">
                                <div className="flex items-center gap-3 mb-3">
                                    <h3 className="text-2xl font-black leading-none text-black">{server.DeviceName}</h3>
                                    <span className={`px-3 py-1 border-2 border-black text-[10px] font-black uppercase shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${server.Status === 'Online' ? 'bg-[#CEFFBC] text-black' :
                                            server.Status === 'Maintenance' ? 'bg-[#7EA0FD] text-white' : 'bg-[#FF6B6B] text-white'
                                        }`}>
                                        {server.Status}
                                    </span>
                                </div>
                                <div className="font-mono text-xs font-bold text-gray-400 uppercase tracking-tight">
                                    {server.Location || 'Unknown'} // {server.DeviceType || 'Generic'} // {server.DateCreated || 'N/A'}
                                </div>
                            </div>

                            {/* Utility Actions */}
                            <div className="flex items-center gap-4 border-t-2 border-black md:border-none pt-4 md:pt-0">
                                <button
                                    onClick={() => handleCopy(server.DeviceAPI, index)}
                                    className={`flex items-center gap-2 px-6 py-3 border-2 border-black font-black uppercase text-sm shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all ${copiedId === index ? 'bg-[#CEFFBC] text-black' : 'bg-[#FFECA0] text-black hover:bg-black hover:text-white'
                                        }`}
                                >
                                    {copiedId === index ? (
                                        <><CheckCircle2 size={18} /> Copied</>
                                    ) : (
                                        <><Key size={18} /> API Key</>
                                    )}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="p-16 border-4 border-black bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] text-center">
                    <Monitor className="mx-auto mb-4 opacity-10 text-black" size={64} />
                    <p className="font-black uppercase text-2xl text-gray-300 italic">No nodes match your search.</p>
                </div>
            )}
        </div>
    );
}

export default ListAgents;