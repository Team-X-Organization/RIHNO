import React, { useState, useEffect } from 'react';
import { useAuth } from "react-oidc-context";
import axios from 'axios';
import { Loader2, MapPin, Cpu, Calendar, Search, Filter, Activity, LineChart } from 'lucide-react';
import { backendConfig } from "../authConfig.js";
import { PieChart, Pie, Tooltip, Cell } from 'recharts';
import { useNavigate } from "react-router-dom";

const Agent_List = () => {
    const auth = useAuth();
    const [servers, setServers] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filter States
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");

    // State to hold CPU metrics mapped by DeviceName
    const [cpuMetrics, setCpuMetrics] = useState({});

    // 1. Fetch the list of servers
    useEffect(() => {
        const fetchAgents = async () => {
            const email = auth.user?.profile?.email;
            if (!email) return;

            try {
                setLoading(true);
                const response = await axios.get(`${backendConfig.backendURL}api/list_all_devices`, {
                    params: { email: email }
                });
                setServers(response.data);
            } catch (error) {
                console.error("Error fetching agents:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchAgents();
    }, [auth.user?.profile?.email]);

    // 2. Fetch CPU metrics for each server INDEPENDENTLY, auto-refresh every 10 seconds
    useEffect(() => {
        const email = auth.user?.profile?.email;
        if (!email || servers.length === 0) return;

        const fetchAllCPU = () => {
            // Loop through each server and fetch its data without blocking the others
            servers.forEach(async (server) => {
                try {
                    // Matches your exact curl format
                    const response = await axios.get(`http://localhost:8000/metrics/cpu`, {
                        params: {
                            email: email,
                            device_name: server.DeviceName
                        }
                    });

                    const rawCpu = response.data.system_cpu || 0;

                    // Round to 2 decimal places for a cleaner UI
                    const usedCpu = parseFloat(Number(rawCpu).toFixed(2));
                    const availableCpu = parseFloat((100 - usedCpu).toFixed(2));

                    // Update the state for THIS specific server immediately
                    setCpuMetrics(prevMetrics => ({
                        ...prevMetrics,
                        [server.DeviceName]: {
                            used: usedCpu,
                            available: availableCpu
                        }
                    }));

                } catch (error) {
                    console.error(`Error fetching CPU for ${server.DeviceName}:`, error);

                    // If it fails, set it to 0 so the chart handles it gracefully
                    setCpuMetrics(prevMetrics => ({
                        ...prevMetrics,
                        [server.DeviceName]: { used: 0, available: 100 }
                    }));
                }
            });
        };

        // Fetch immediately on load
        fetchAllCPU();

        // Then auto-refresh every 10 seconds
        const intervalId = setInterval(fetchAllCPU, 10000);

        // Cleanup on unmount or when servers/email changes
        return () => clearInterval(intervalId);

    }, [servers, auth.user?.profile?.email]);


    // Filtering Logic
    const filteredServers = servers.filter(server => {
        const matchesSearch = server.DeviceName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === "All" || server.Status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    // Pie chart Colors
    const COLORS_01 = ["#F7B980", "#5A7ACD"];
    const COLORS_02 = ["#94A378", "#2D3C59"];
    const COLORS_03 = ["#ACBAC4", "#E1D9BC"];

    // Analytics dashboard route
    const navigator = useNavigate();
    function handleNavigate() {
        navigator('/dashboard/analytics');
        window.scrollTo(0, 0);
    }

    return (
        <div className="flex flex-col items-center animate-fade-in w-full p-6 min-h-screen bg-white">

            {/* Header Section */}
            <div className="mb-25">
                <h1 className="text-6xl md:text-8xl font-black uppercase leading-none text-center">
                    AGENT
                    <span className="block md:inline-block bg-[#FFECA0] border-[4px] border-black px-4 ml-0 md:ml-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                        LIST
                    </span>
                </h1>
            </div>

            {/* --- FILTER BAR --- */}
            <div className="w-full max-w-4xl mb-10 flex flex-col md:flex-row gap-4">
                <div className="relative flex-grow">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black" size={20} />
                    <input
                        type="text"
                        placeholder="SEARCH BY AGENT NAME..."
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

            {/* Main Content Area */}
            <div className="w-full max-w-4xl">
                {loading ? (
                    <div className="flex items-center justify-center gap-4 p-12 border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                        <Loader2 className="animate-spin" size={32} />
                        <p className="font-mono text-xl font-black uppercase tracking-widest text-black">Scanning Frequency...</p>
                    </div>
                ) : filteredServers.length > 0 ? (
                    <div className="space-y-6">
                        {filteredServers.map((server, index) => {

                            // Grab the specific CPU data for this server
                            const currentCpu = cpuMetrics[server.DeviceName] || { used: 0, available: 100 };

                            const data_01 = [
                                { name: "CPU Available (%)", value: currentCpu.available },
                                { name: "CPU Used (%)", value: currentCpu.used }
                            ];
                            const data_02 = [
                                { name: "Memory Available", value: 25 },
                                { name: "Memory Used", value: 75 }
                            ];
                            const data_03 = [
                                { name: "Network Available", value: 40 },
                                { name: "Network Used", value: 60 }
                            ];

                            return (
                                <div
                                    key={index}
                                    className="p-6 border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                                        <h3 className="text-3xl font-black leading-none text-black">
                                            {server.DeviceName}
                                        </h3>
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                                            <span className={'bg-white p-1 text-center font-mono text-[11px] font-bold text-gray-500 uppercase tracking-tight'}>Agent Status: </span>
                                            <span className={`inline-block px-3 py-1 border-2 border-black text-[10px] font-black uppercase shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-center w-fit ${
                                                server.Status === 'Online' ? 'bg-[#CEFFBC] text-black' :
                                                    server.Status === 'Maintenance' ? 'bg-[#7EA0FD] text-white' : 'bg-[#FF6B6B] text-white'
                                            }`}>
                                            {server.Status}
                                        </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 font-mono text-[11px] font-bold text-gray-500 uppercase tracking-tight mb-5">
                                        <div className="flex items-center gap-2 border-l-4 border-black pl-3 text-black">
                                            <MapPin size={16} />
                                            <span>Location: {server.Location || 'N/A'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 border-l-4 border-black pl-3 text-black">
                                            <Cpu size={16} />
                                            <span>Device Type: {server.DeviceType || 'N/A'}</span>
                                        </div>
                                        <div className="flex items-center gap-2  pt-2 mt-2 border-t border-gray-100 text-black">
                                            <Calendar size={16} />
                                            <span>Date Created: {server.DateCreated || 'N/A'}</span>
                                        </div>
                                    </div>

                                    <hr></hr>

                                    <div className={"flex flex-col justify-evenly sm:items-center sm:flex-row"}>
                                        <div className={"flex flex-col items-center pb-3 justify-between"}>
                                            <PieChart width={250} height={250}>
                                                <Pie
                                                    data={data_01}
                                                    dataKey="value"
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={50}
                                                    outerRadius="65%"
                                                    label
                                                >
                                                    {data_01.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS_01[index % COLORS_01.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip/>
                                            </PieChart>
                                            <h4 className={"font-mono"}>CPU Usage</h4>
                                        </div>

                                        <div className={"flex flex-col items-center pb-3 justify-between"}>
                                            <PieChart width={250} height={250}>
                                                <Pie
                                                    data={data_02}
                                                    dataKey="value"
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={50}
                                                    outerRadius="65%"
                                                    label
                                                >
                                                    {data_02.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS_02[index % COLORS_02.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip/>
                                            </PieChart>
                                            <h4 className={"font-mono"}>Memory Usage</h4>
                                        </div>

                                        <div className={"flex flex-col items-center pb-3 justify-between"}>
                                            <PieChart width={250} height={250}>
                                                <Pie
                                                    data={data_03}
                                                    dataKey="value"
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={50}
                                                    outerRadius="65%"
                                                    label
                                                >
                                                    {data_03.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS_03[index % COLORS_03.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip/>
                                            </PieChart>
                                            <h4 className={"font-mono"}>Network Usage</h4>
                                        </div>
                                    </div>

                                    <hr></hr>

                                    {/* View More Analytics Button */}
                                    <div className={"flex flex-col mt-5 bg-white font-mono border-1 hover:border-0 rounded-4xl"}>
                                        <button
                                            className={"flex flex-row justify-center border-2 p-1 uppercase duration-200 ease-in-out bg-transparent text-black border-transparent hover:bg-[#EA7B7B] hover:text-white hover:border-black hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:rounded-4xl"}
                                            onClick={() => {
                                                handleNavigate()
                                            }}
                                        >
                                            <LineChart size={24} />
                                            <span className={"mx-3"}></span>
                                            View More Analytics
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="p-16 border-4 border-black bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] text-center">
                        <Activity className="mx-auto mb-4 opacity-10 text-black" size={80} />
                        <p className="font-black uppercase text-2xl text-gray-300 italic">No Matching Nodes Found</p>
                        <button
                            onClick={() => {setSearchTerm(""); setStatusFilter("All");}}
                            className="mt-4 font-mono text-xs font-black underline uppercase hover:text-[#7EA0FD]"
                        >
                            Reset Filters
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Agent_List;