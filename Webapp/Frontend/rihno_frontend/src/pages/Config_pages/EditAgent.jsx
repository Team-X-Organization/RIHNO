import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from "react-oidc-context";
import {
    Loader2,
    CheckCircle2,
    AlertCircle,
    Save,
    ArrowLeft,
    Search,
    Filter,
    Edit3
} from 'lucide-react';
import { backendConfig } from "../../authConfig.js";

function EditAgent() {
    const auth = useAuth();
    const userEmail = auth.user?.profile?.email || '';

    // State Management
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [isFetching, setIsFetching] = useState(true);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });

    // Filter States
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");

    const [formData, setFormData] = useState({
        Status: 'Online',
        Location: ''
    });

    // 1. Fetch devices
    useEffect(() => {
        const fetchDevices = async () => {
            if (!userEmail) {
                setIsFetching(false);
                return;
            }
            try {
                setIsFetching(true);
                const response = await axios.get(`${backendConfig.backendURL}api/list_all_devices`, {
                    params: { email: userEmail }
                });
                setDevices(response.data);
            } catch (error) {
                console.error("Error fetching devices:", error);
            } finally {
                setIsFetching(false);
            }
        };
        fetchDevices();
    }, [userEmail]);

    // Filtering Logic
    const filteredDevices = devices.filter(dev => {
        const matchesSearch = dev.DeviceName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === "All" || dev.Status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const handleSelectDevice = (device) => {
        setSelectedDevice(device);
        setFormData({
            Status: device.Status || 'Online',
            Location: device.Location || ''
        });
        setStatus({ type: '', message: '' });
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setStatus({ type: '', message: '' });

        try {
            await axios.patch(`${backendConfig.backendURL}api/update`, {
                UserEmail: userEmail,
                DeviceName: selectedDevice.DeviceName,
                Status: formData.Status,
                Location: formData.Location
            });
            setStatus({ type: 'success', message: 'Agent Updated Successfully!' });

            // Refresh local list
            const updated = devices.map(d =>
                d.DeviceName === selectedDevice.DeviceName
                    ? { ...d, Status: formData.Status, Location: formData.Location }
                    : d
            );
            setDevices(updated);
        } catch (error) {
            setStatus({
                type: 'error',
                message: error.response?.data?.message || 'Update Failed'
            });
        } finally {
            setLoading(false);
        }
    };

    if (auth.isLoading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin" size={48} /></div>;

    return (
        <div className="max-w-4xl mx-auto animate-fade-in p-4 bg-white min-h-screen">
            <h2 className="text-3xl font-black uppercase mb-8 border-b-4 border-black pb-2 text-black">Edit Agent</h2>


            {!selectedDevice ? (
                /* --- STEP 1: Select a Device with Filters --- */
                <div className="space-y-8">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-grow">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black" size={20} />
                            <input
                                type="text"
                                placeholder="SEARCH AGENTS..."
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

                    {isFetching ? (
                        <div className="flex flex-col items-center justify-center p-20 border-4 border-black">
                            <Loader2 className="animate-spin mb-4" size={40} />
                            <p className="font-mono font-black uppercase">Scanning Network...</p>
                        </div>
                    ) : filteredDevices.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {filteredDevices.map((dev, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleSelectDevice(dev)}
                                    className="text-left p-6 border-4 border-black bg-white hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] group"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <p className="font-mono text-[10px] uppercase font-bold text-gray-400">Identity</p>
                                            <p className="text-xl font-black uppercase truncate max-w-[180px]">{dev.DeviceName}</p>
                                        </div>
                                        <span className={`px-2 py-1 border-2 border-black text-[10px] font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${dev.Status === 'Online' ? 'bg-[#CEFFBC]' :
                                                dev.Status === 'Maintenance' ? 'bg-[#7EA0FD] text-white' : 'bg-[#FF6B6B] text-white'
                                            }`}>
                                            {dev.Status}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between mt-6 border-t-2 border-black pt-4">
                                        <span className="font-mono text-[10px] font-bold text-gray-500 uppercase">{dev.Location || 'Global'}</span>
                                        <span className="font-black text-xs uppercase flex items-center gap-1 group-hover:text-[#7EA0FD]">
                                            Configure <Edit3 size={14} />
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="p-16 border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center">
                            <p className="font-black uppercase text-xl text-gray-400 italic">No nodes match criteria.</p>
                        </div>
                    )}
                </div>
            ) : (
                /* --- STEP 2: Edit Form --- */
                <div className="space-y-6 max-w-2xl mx-auto">
                    <button
                        onClick={() => setSelectedDevice(null)}
                        className="flex items-center gap-2 font-black uppercase text-sm hover:text-[#7EA0FD] transition-colors"
                    >
                        <ArrowLeft size={18} /> Exit Configuration
                    </button>

                    <div className="p-8 border-4 border-black bg-white shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
                        <div className="mb-8 border-b-4 border-black pb-4">
                            <h3 className="text-3xl font-black uppercase">{selectedDevice.DeviceName}</h3>
                            <p className="font-mono text-xs text-gray-500 font-bold mt-1 uppercase tracking-tighter">
                                Target Node // {selectedDevice.DeviceType || 'Generic'}
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="flex flex-col gap-2">
                                <label className="font-mono uppercase text-sm font-black">Current Location</label>
                                <input
                                    required
                                    type="text"
                                    name="Location"
                                    value={formData.Location}
                                    onChange={handleChange}
                                    className="p-4 border-4 border-black focus:bg-yellow-50 outline-none font-bold uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="font-mono uppercase text-sm font-black">Operation Status</label>
                                <select
                                    name="Status"
                                    value={formData.Status}
                                    onChange={handleChange}
                                    className="p-4 border-4 border-black bg-white focus:bg-[#7EA0FD] focus:text-white outline-none font-black uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] cursor-pointer"
                                >
                                    <option value="Online">Online</option>
                                    <option value="Offline">Offline</option>
                                    <option value="Maintenance">Maintenance</option>
                                </select>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-black text-white p-5 font-black uppercase text-2xl hover:bg-[#CEFFBC] hover:text-black transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1 flex items-center justify-center gap-3 mt-8"
                            >
                                {loading ? <Loader2 className="animate-spin" size={28} /> : <><Save size={28} /> Save Changes</>}
                            </button>
                        </form>

                        {status.message && (
                            <div className={`mt-8 p-6 border-4 border-black font-black uppercase flex items-center gap-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] ${status.type === 'success' ? 'bg-[#CEFFBC] text-black' : 'bg-[#FF6B6B] text-white'
                                }`}>
                                {status.type === 'success' ? <CheckCircle2 size={32} /> : <AlertCircle size={32} />}
                                <span className="text-lg">{status.message}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default EditAgent;