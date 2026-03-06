import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from "react-oidc-context";
import { backendConfig } from "../authConfig.js";
import { Loader2, AlertTriangle, AlertOctagon, Info, Clock, AlertCircle } from 'lucide-react';

function Notification() {
    const auth = useAuth();
    const email = auth.user?.profile?.email || '';

    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!email) return;

        const fetchAlerts = async () => {
            try {
                const { data } = await axios.get(`${backendConfig.dealerURL}/alerts/recent`, {
                    params: { email, limit: 50 }
                });
                setAlerts(data || []);
                setError(null);
            } catch (err) {
                console.error("Error fetching alerts:", err);
                setError("Failed to locate alert queue.");
            } finally {
                setLoading(false);
            }
        };

        fetchAlerts();
        const id = setInterval(fetchAlerts, 10000); // Poll every 10s
        return () => clearInterval(id);
    }, [email]);

    return (
        <div className="flex flex-col items-center animate-fade-in w-full p-6 min-h-screen bg-white">
            {/* Header Section */}
            <div className="mb-14">
                <h1 className="text-6xl md:text-8xl font-black uppercase leading-none text-center">
                    SYSTEM
                    <span className="block md:inline-block bg-[#FF6B6B] text-white border-[4px] border-black px-4 ml-0 md:ml-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                        ALERTS
                    </span>
                </h1>
            </div>

            {/* Content Feed */}
            <div className="w-full max-w-5xl">
                {loading ? (
                    <div className="flex items-center justify-center gap-4 p-12 border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                        <Loader2 className="animate-spin text-black" size={32} />
                        <p className="font-mono text-xl font-black uppercase tracking-widest">Compiling Threat Intelligence…</p>
                    </div>
                ) : error ? (
                    <div className="p-12 border-4 border-black bg-[#FF6B6B] text-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center">
                        <AlertTriangle size={48} className="mb-4" />
                        <p className="font-mono text-2xl font-black uppercase text-center">{error}</p>
                    </div>
                ) : alerts.length === 0 ? (
                    <div className="p-16 border-4 border-black bg-[#CEFFBC] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center">
                        <p className="font-black uppercase text-2xl text-black flex items-center justify-center gap-3">
                            <Info size={32} /> NO CRITICAL ALERTS DETECTED.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {alerts.map((alert, idx) => {
                            // Define visual theme per severity
                            const isCritical = alert.severity === "critical";
                            const isHigh = alert.severity === "high";

                            const bgClass = isCritical ? "bg-[#FF6B6B]" : isHigh ? "bg-[#fb923c]" : "bg-[#FFECA0]";
                            const txClass = isCritical || isHigh ? "text-white" : "text-black";
                            const icColor = isCritical || isHigh ? "text-white" : "text-black";

                            return (
                                <div key={idx} className={`flex flex-col md:flex-row border-4 border-black ${bgClass} ${txClass} shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[10px_10px_0_rgba(0,0,0,1)] transition-all overflow-hidden`}>

                                    {/* Indicator Column */}
                                    <div className="px-6 py-4 border-b-4 md:border-b-0 md:border-r-4 border-black flex items-center justify-center bg-black/10">
                                        {isCritical ? <AlertOctagon size={48} className={icColor} /> :
                                            isHigh ? <AlertTriangle size={48} className={icColor} /> :
                                                <AlertCircle size={48} className={icColor} />}
                                    </div>

                                    {/* Details */}
                                    <div className="flex-grow p-5 md:p-6 flex flex-col justify-between">
                                        <div>
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                                                <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight leading-none">
                                                    {alert.alert_type.replace(/_/g, ' ')}
                                                </h3>
                                                <span className={`inline-block px-3 py-1 border-2 border-black font-mono text-xs font-bold uppercase shadow-[3px_3px_0_rgba(0,0,0,1)] ${isCritical ? 'bg-black text-[#FF6B6B]' : 'bg-black text-[#FFECA0]'}`}>
                                                    Severity: {alert.severity}
                                                </span>
                                            </div>
                                            <p className="font-mono text-sm sm:text-base font-bold underline decoration-2 underline-offset-4 mb-4">
                                                {alert.description}
                                            </p>
                                        </div>

                                        <div className="flex flex-col sm:flex-row gap-4 sm:items-center mt-4 pt-4 border-t-2 border-black/20 font-mono text-xs font-black uppercase">
                                            <div className="flex items-center gap-2">
                                                <span className="bg-black/20 px-2 py-1">AGENT</span>
                                                {alert.agent_name}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="bg-black/20 px-2 py-1 flex items-center gap-1"><Clock size={12} /> TIME</span>
                                                {new Date(alert.time).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Data Visual Component (Optional context pane) */}
                                    <div className="hidden md:flex flex-col items-center justify-center p-6 border-l-4 border-black bg-black/5 min-w-[180px]">
                                        <p className="font-mono text-[10px] font-black uppercase mb-1 opacity-70">METRIC // THRESHOLD</p>
                                        <p className="text-4xl font-black leading-none">{alert.metric_value > 1000 ? (alert.metric_value / 1000).toFixed(1) + 'k' : alert.metric_value.toFixed(1)}</p>
                                        <p className="text-lg font-black mt-1 opacity-75">{'>'} {alert.threshold}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Notification;