import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    Server, Database, Activity, LineChart,
    Bell, Settings, Sparkles, NetworkIcon, Home
} from 'lucide-react';

function NavDashboardBottom() {
    return (
        <nav
            className="fixed bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 z-50 w-max max-w-[95vw] sm:max-w-none"
            aria-label="Dashboard Navigation"
        >
            <div className="flex items-center gap-1 md:gap-2 px-1 py-1 md:px-3 md:py-2 bg-white border-[3px] md:border-[4px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-x-auto" style={{scrollbarWidth: 'none'}}>

                {/* Core Section */}
                <DockIcon to="/dashboard/servers" icon={<Server size={24} />} label="Agents" />
                {/* <DockIcon to="/dashboard/data" icon={<Database size={24} />} label="Data" />
                <DockIcon to="/dashboard/activity" icon={<Activity size={24} />} label="Activity" /> */}

                <Separator />

                {/* Analysis Section */}
                {/*<DockIcon to="/dashboard/analytics" icon={<LineChart size={24} />} label="Analytics" />*/}
                <DockIcon to="/dashboard/networkmap" icon={<NetworkIcon size={24} />} label="Network" />
                <DockIcon to="/dashboard/ai" icon={<Sparkles size={24} />} label="A.I." />

                <Separator />

                {/* System Section */}
                <DockIcon to="/dashboard/notification" icon={<Bell size={24} />} label="Notify" />
                <DockIcon to="/dashboard/config" icon={<Settings size={24} />} label="Config" />

                <Separator />

                {/* Home Link */}
                <DockIcon to="/" icon={<Home size={24} />} label="Home" />
            </div>
        </nav>
    );
}

const Separator = () => (
    <div className="w-[2px] h-8 bg-black/20 mx-1 hidden sm:block" aria-hidden="true" />
);

const DockIcon = ({ icon, label, to }) => {
    return (
        <div className="group relative flex flex-col items-center">

            {/* --- HOVER LABEL --- */}
            <div className="absolute -top-14 scale-0 group-hover:scale-100 group-hover:-translate-y-1 transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-bottom pointer-events-none z-[60]">
                <div className="bg-black text-white text-[10px] font-black uppercase tracking-[0.15em] px-3 py-1.5 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] whitespace-nowrap">
                    {label}
                    {/* Tooltip Arrow */}
                    <div className="absolute -bottom-[10px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-black"></div>
                </div>
            </div>

            {/* --- MAIN NAVLINK --- */}
            <NavLink
                to={to}
                className={({ isActive }) => `
                    relative p-3 transition-all duration-200 ease-in-out
                    flex items-center justify-center
                    border-2
                    ${isActive
                    ? "bg-black text-white border-black shadow-none -translate-y-1"
                    : "bg-transparent text-black border-transparent hover:bg-[#FFECA0] hover:border-black hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                }
                    active:translate-y-0 active:shadow-none
                `}
            >
                {({ isActive }) => (
                    <>
                        {/* The Icon */}
                        {React.cloneElement(icon, {
                            strokeWidth: isActive ? 3 : 2.5,
                            className: "relative z-10"
                        })}

                        {/* Active Indicator (Clean fix for the nested NavLink error) */}
                        {isActive && (
                            <div className="absolute -bottom-1.5 w-1.5 h-1.5 bg-white rounded-full border border-black animate-pulse" />
                        )}
                    </>
                )}
            </NavLink>
        </div>
    );
};

export default NavDashboardBottom;