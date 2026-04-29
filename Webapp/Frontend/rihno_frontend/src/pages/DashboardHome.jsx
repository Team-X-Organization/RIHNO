import React, { Suspense, useState, useEffect } from 'react';
import { Environment, ScrollControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Model from "../components/Model.jsx";
import { Link } from 'react-router-dom';
import { Terminal } from 'lucide-react';
import axios from 'axios';
import { backendConfig } from "../authConfig.js";

function DashboardHome() {
    // Check backend (node.js) is ready
    const [data, setData] = useState("");
    
    // Call the backend API and update the status
    useEffect(() => {
        axios.get(`${backendConfig.backendURL}api/backend_check`)
            .then(response => {setData(response.data.message);})
            .catch(error => {console.error("There was an error fetching the data!", error);})
    }, []);

    return (

        <div className="min-h-screen bg-white text-black font-sans">
            {/* --- 1. UI LAYER --- */}
            <div className="relative z-10 flex flex-col min-h-screen">

                <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 flex flex-col justify-center pointer-events-none">
                    <div className="w-full max-w-xl xl:max-w-2xl pointer-events-auto">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black text-white text-[10px] md:text-xs font-bold tracking-wider mb-4 md:mb-6 border border-gray-800 shadow-md">
                            <span className={`w-2 h-2 rounded-full animate-pulse ${data ? 'bg-green-400' : 'bg-red-400'}`}></span>
                            {data ? `SYSTEM ONLINE: ${data}` : "SYSTEM OFFLINE"}
                        </div>

                        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black uppercase leading-none mb-4 sm:mb-6">
                            RIHNO <br />
                            <span className="bg-[#CEFFBC] border-[3px] border-black px-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] inline-block">
                                Security
                            </span>
                        </h1>

                        <p className="text-base sm:text-lg xl:text-xl font-mono mb-6 sm:mb-8 max-w-sm xl:max-w-md">
                            Next-generation AI Intrusion Detection for modern infrastructure.
                        </p>

                        <div className="flex flex-wrap gap-3 sm:gap-4">
                            <Link
                                to="/dashboard"
                                className="flex items-center gap-2 bg-[#CEFFBC] text-black border-[3px] border-black px-4 sm:px-6 py-2.5 sm:py-3 font-bold uppercase text-sm sm:text-base shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                            >
                                Get Started
                            </Link>
                            <Link
                                to="/documentation#cli"
                                className="flex items-center gap-2 bg-[#FFA0A2] text-black border-[3px] border-black px-4 sm:px-6 py-2.5 sm:py-3 font-bold uppercase text-sm sm:text-base shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                            >
                                Install Tool <Terminal size={16} className="sm:w-[18px] sm:h-[18px]" />
                            </Link>
                            <Link
                                to="/documentation"
                                className="flex items-center gap-2 bg-[#7EA0FD] text-black border-[3px] border-black px-4 sm:px-6 py-2.5 sm:py-3 font-bold uppercase text-sm sm:text-base shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                            >
                                Docs
                            </Link>
                        </div>
                    </div>
                </main>

                {/* Bottom Bar Stats */}
                <footer className="grid grid-cols-1 sm:grid-cols-3 border-t-[3px] border-black bg-white">
                    <div className="p-3 sm:p-4 border-b-[3px] sm:border-b-0 sm:border-r-[3px] border-black font-bold">
                        <span className="text-gray-500 text-xs uppercase block">Uptime</span>
                        99.99% Reliable
                    </div>
                    <div className="p-3 sm:p-4 border-b-[3px] sm:border-b-0 sm:border-r-[3px] border-black font-bold">
                        <span className="text-gray-500 text-xs uppercase block">Latency</span>
                        &lt; 10ms Response
                    </div>
                    <div className="p-3 sm:p-4 font-bold">
                        <span className="text-gray-500 text-xs uppercase block">Engine</span>
                        RHINO v1.0 AI
                    </div>
                </footer>
            </div>

            {/* --- 2. 3D SCENE (Background) --- */}
            <div className="absolute inset-0 z-0 mt-50">
                <Canvas camera={{ position: [0, 0, 5], fov: 40 }}>
                    <ambientLight intensity={0.8} />
                    <Suspense fallback={null}>
                        <ScrollControls pages={2} damping={0.1}>
                            <Model />
                        </ScrollControls>
                    </Suspense>
                    <Environment preset="city" />
                </Canvas>
            </div>
        </div>
    );
}

export default DashboardHome;