import React from 'react';

import { List, Plus, Edit3Icon, Trash, ArrowLeft, ChevronRight } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';

function Config() {
    const location = useLocation();
    const navigate = useNavigate();

    // Checks if the user is on the main config menu page
    const isRootConfig = location.pathname === "/dashboard/config" || location.pathname === "/dashboard/config/";

    const menuItems = [
        {
            label: "List All Agents",
            description: "View and scan active network nodes.",
            icon: <List size={32} />,
            path: "listdevices",
            color: "bg-[#CEFFBC]" // Green
        },
        {
            label: "Add New Agent",
            description: "Register a new asset to the grid.",
            icon: <Plus size={32} />,
            path: "newdevice",
            color: "bg-[#FFECA0]" // Yellow
        },
        {
            label: "Edit Agent",
            description: "Modify status and location metadata.",
            icon: <Edit3Icon size={32} />,
            path: "editdevice",
            color: "bg-[#7EA0FD]" // Blue
        },
        {
            label: "Delete Agent",
            description: "Permanently decommission an asset.",
            icon: <Trash size={32} />,
            path: "deletedevice",
            color: "bg-[#FF6B6B]" // Red
        },
    ];

    return (
        <div className="flex flex-col pt-6 sm:pt-8 md:pt-10 px-3 sm:px-4 md:px-6 max-w-5xl xl:max-w-6xl mx-auto min-h-screen bg-white animate-fade-in">

            {/* Header Section */}
            <div className="mb-12 sm:mb-16 md:mb-20">
                <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black uppercase leading-none text-center">
                    AGENT
                    <span className="block md:inline-block bg-[#7EA0FD] border-[3px] sm:border-[4px] border-black px-3 sm:px-4 ml-0 md:ml-4 mt-2 md:mt-0 shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] sm:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                        CONFIG
                    </span>
                </h1>
            </div>

            {isRootConfig ? (
                /* --- MAIN MENU GRID --- */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8 mb-12 sm:mb-16 md:mb-20">
                    {menuItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className="group flex flex-col justify-between p-5 sm:p-6 md:p-8 border-[3px] sm:border-4 border-black bg-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] md:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                        >
                            <div className="flex justify-between items-start mb-6 sm:mb-8 md:mb-10">
                                <div className={`p-3 sm:p-4 border-[3px] sm:border-4 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] group-hover:bg-black group-hover:text-white transition-colors ${item.color}`}>
                                    {item.icon}
                                </div>
                                <ChevronRight className="opacity-0 group-hover:opacity-100 transition-opacity" size={28} />
                            </div>

                            <div>
                                <h2 className="text-xl sm:text-2xl md:text-3xl font-black uppercase mb-2 tracking-tighter">
                                    {item.label}
                                </h2>
                                <p className="font-mono text-xs font-bold text-gray-500 uppercase italic">
                                    // {item.description}
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            ) : (
                /* --- SUB-PAGE VIEW --- */
                <div className="flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <button
                        onClick={() => navigate("/dashboard/config")}
                        className="flex items-center gap-2 sm:gap-3 mb-8 sm:mb-10 md:mb-12 w-fit font-black uppercase px-5 sm:px-6 md:px-8 py-3 sm:py-4 bg-white border-[3px] sm:border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] md:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:bg-black hover:text-white active:shadow-none active:translate-x-1 active:translate-y-1 transition-all text-sm sm:text-base"
                    >
                        <ArrowLeft size={20} className="sm:w-6 sm:h-6" strokeWidth={3} /> Back to Control Panel
                    </button>

                    <div className="bg-white">
                        <Outlet />
                    </div>
                </div>
            )}

        </div>
    );
}

export default Config;