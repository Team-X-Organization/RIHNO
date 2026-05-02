import React, { useEffect, useState } from 'react';
import { useAuth } from "react-oidc-context";
import axios from "axios";
import { Loader2, Trash2, Search, Filter, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { backendConfig } from "../../authConfig.js";

function DeleteAgent() {
    const auth = useAuth();
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmingDevice, setConfirmingDevice] = useState(null);
    const [processingDevice, setProcessingDevice] = useState(null);
    const [statusMsg, setStatusMsg] = useState(null); // { kind: 'ok' | 'err', text }

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    const email = auth.user?.profile?.email;

    const showMsg = (kind, text) => {
        setStatusMsg({ kind, text });
        setTimeout(() => setStatusMsg(null), 3500);
    };

    const fetchDevices = async () => {
        if (!email) return;
        try {
            setLoading(true);
            const response = await axios.get(`${backendConfig.backendURL}api/list_all_devices`, {
                params: { email }
            });
            setDevices(response.data);
        } catch (error) {
            console.error('Error fetching agents:', error);
            showMsg('err', 'Failed to load agents.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDevices();
    }, [email]);

    const filteredDevices = devices.filter(dev => {
        const matchesSearch = dev.DeviceName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'All' || dev.Status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const handleDelete = async (deviceName) => {
        setProcessingDevice(deviceName);
        try {
            await axios.delete(`${backendConfig.backendURL}api/delete`, {
                params: { email, device: deviceName }
            });
            setDevices(prev => prev.filter(d => d.DeviceName !== deviceName));
            showMsg('ok', `${deviceName} deleted — database and AI engine data cleared.`);
        } catch (error) {
            console.error('Deletion failed:', error);
            const msg = error.response?.data?.message || error.response?.data?.details || error.message;
            showMsg('err', `Delete failed: ${msg}`);
        } finally {
            setProcessingDevice(null);
            setConfirmingDevice(null);
        }
    };

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            <h2 className="text-3xl font-black uppercase mb-2 border-b-4 border-black pb-2 text-black">Delete Agent</h2>
            <p className="font-mono text-xs text-gray-500 uppercase font-bold mb-6">
                Deletes agent from database, Redis streams, AI models, and alert history.
            </p>

            {/* Status banner */}
            {statusMsg && (
                <div className={`mb-6 flex items-center gap-3 px-4 py-3 border-4 border-black font-mono font-black uppercase shadow-[4px_4px_0_#000] ${statusMsg.kind === 'ok' ? 'bg-[#CEFFBC] text-black' : 'bg-[#FF6B6B] text-white'}`}>
                    {statusMsg.kind === 'ok' ? <CheckCircle size={18} /> : <XCircle size={18} />}
                    {statusMsg.text}
                </div>
            )}

            {/* Filter bar */}
            <div className="flex flex-col md:flex-row gap-4 mb-8">
                <div className="relative flex-grow">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2" size={18} />
                    <input
                        type="text"
                        placeholder="SEARCH AGENT..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 border-4 border-black font-mono font-bold uppercase outline-none focus:bg-red-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                    />
                </div>
                <div className="relative">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" size={18} />
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="appearance-none pl-12 pr-10 py-3 border-4 border-black font-mono font-black uppercase outline-none bg-white cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                    >
                        <option value="All">All Status</option>
                        <option value="Online">Online</option>
                        <option value="Maintenance">Maintenance</option>
                        <option value="Offline">Offline</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center p-20 border-4 border-dashed border-black">
                    <Loader2 className="animate-spin mb-4" size={40} />
                    <p className="font-mono font-black uppercase tracking-widest">Loading Agents...</p>
                </div>
            ) : filteredDevices.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                    {filteredDevices.map((device, index) => {
                        const isConfirming = confirmingDevice === device.DeviceName;
                        const isProcessing = processingDevice === device.DeviceName;
                        return (
                            <div
                                key={index}
                                className={`flex flex-col md:flex-row items-center justify-between p-6 border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all ${isConfirming ? 'border-[#FF6B6B]' : 'hover:translate-x-[-2px] hover:translate-y-[-2px]'}`}
                            >
                                <div className="mb-4 md:mb-0">
                                    <p className="font-mono text-xs uppercase font-bold text-gray-500 tracking-tighter">Identity</p>
                                    <p className="text-xl font-black uppercase">{device.DeviceName}</p>
                                    <div className="flex gap-2 mt-2">
                                        <span className={`text-[10px] font-bold px-2 border-2 border-black ${device.Status === 'Online' ? 'bg-[#CEFFBC]' : device.Status === 'Maintenance' ? 'bg-[#7EA0FD] text-white' : 'bg-[#FF6B6B] text-white'}`}>
                                            {device.Status}
                                        </span>
                                        <span className="text-[10px] font-bold px-2 border-2 border-black bg-gray-100">{device.Location}</span>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row items-center gap-3">
                                    {isConfirming ? (
                                        <>
                                            <div className="flex items-center gap-2 font-mono text-sm font-black uppercase text-[#FF6B6B]">
                                                <AlertTriangle size={16} /> Permanently delete all data?
                                            </div>
                                            <button
                                                onClick={() => handleDelete(device.DeviceName)}
                                                disabled={isProcessing}
                                                className="flex items-center gap-2 bg-[#FF6B6B] text-white px-5 py-2.5 border-4 border-black font-black uppercase shadow-[4px_4px_0_#000] hover:bg-black active:shadow-none active:translate-x-1 active:translate-y-1 disabled:opacity-50 transition-all"
                                            >
                                                {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <><Trash2 size={16} /> Confirm</>}
                                            </button>
                                            <button
                                                onClick={() => setConfirmingDevice(null)}
                                                disabled={isProcessing}
                                                className="px-5 py-2.5 border-4 border-black bg-white font-black uppercase shadow-[4px_4px_0_#000] hover:-translate-y-0.5 transition-all disabled:opacity-50"
                                            >
                                                Cancel
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={() => setConfirmingDevice(device.DeviceName)}
                                            disabled={!!processingDevice}
                                            className="flex items-center gap-2 bg-[#FF6B6B] text-white px-6 py-3 border-4 border-black font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-black active:shadow-none active:translate-x-1 active:translate-y-1 disabled:opacity-50 transition-all"
                                        >
                                            <Trash2 size={20} /> Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="p-10 border-4 border-black bg-gray-50 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center">
                    <p className="font-black uppercase text-xl">No matching agent found.</p>
                </div>
            )}
        </div>
    );
}

export default DeleteAgent;
