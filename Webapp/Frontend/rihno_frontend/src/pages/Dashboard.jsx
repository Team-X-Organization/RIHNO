import React from 'react';
import { Outlet } from "react-router-dom";
import NavDashboardTop from "../components/NavDashboardTop.jsx";
import NavDashboardBottom from "../components/NavDashboardBottom.jsx";

function Dashboard() {
    return (
        <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white pb-24 sm:pb-28 md:pb-32">

            {/* TOP NAVBAR */}
            <NavDashboardTop />

            {/* DYNAMIC CONTENT AREA (Agent_List, Home, etc. load here) */}
            <main className="w-full max-w-[1600px] mx-auto mt-4 sm:mt-5 md:mt-6 px-0">
                <Outlet />
            </main>

            {/* BOTTOM DOCK */}
            <NavDashboardBottom />
        </div>
    );
}

export default Dashboard;