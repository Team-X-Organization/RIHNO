import React, { Suspense, useEffect, useState } from 'react';
import { Environment, ScrollControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Model from "../components/Model.jsx";
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { backendConfig } from "../authConfig.js";
import axios from 'axios';

function Home() {
    // Check backend (node.js) is ready
    const [data, setData] = useState("");
    // Call the backend API and update the status
    useEffect(() => {
        // call express js api using axios
        axios.get(`${backendConfig.backendURL}api/backend_check`)
            .then(response => { setData(response.data.message); })
            .catch(error => { console.error("There was an error fetching the data!", error); })
    }, []);

    // Return the Home page
    return (
        <div className="relative w-full min-h-screen bg-white overflow-hidden flex flex-col">
            <div className="relative lg:absolute inset-0 z-10 w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 flex items-center pt-16 sm:pt-20 md:pt-24 pb-8 sm:pb-12 lg:pb-32 pointer-events-none">
                <div className="w-full max-w-2xl xl:max-w-3xl pointer-events-auto">

                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black text-white text-[10px] md:text-xs font-bold tracking-wider mb-4 md:mb-6 border border-gray-800 shadow-md">
                        <span className={`w-2 h-2 rounded-full animate-pulse ${data ? 'bg-green-400' : 'bg-red-400'}`}></span>
                        {data ? `SYSTEM ONLINE: ${data}` : "SYSTEM OFFLINE"}
                    </div>

                    <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl 2xl:text-8xl font-black text-black leading-tight mb-4 sm:mb-6 drop-shadow-sm">
                        <span className={"bg-black text-[#FFA0A2] box-border border-[#FFA0A2] border-4 sm:border-6 px-2"}>SECURE YOUR</span> <br />
                        <span className="bg-clip-text text-black">
                            INFRASTRUCTURE
                        </span>
                    </h1>

                    <p className="text-sm sm:text-base md:text-lg xl:text-xl text-gray-600 mb-6 sm:mb-8 font-mono leading-relaxed max-w-md md:max-w-lg xl:max-w-xl">
                        Next-generation AI Intrusion Detection System.
                        Real-time monitoring, intelligent threat analysis.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 flex-wrap">
                        <Link
                            to="/dashboard"
                            className="flex justify-center flex-1 sm:flex-none items-center gap-2 bg-[#CEFFBC] text-black border-[3px] border-black px-4 sm:px-6 md:px-8 py-3 md:py-4 font-black uppercase text-sm sm:text-base shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                        >
                            Get Started <ArrowRight size={18} className="sm:w-5 sm:h-5" />
                        </Link>

                        <Link
                            to="/documentation#cli"
                            className="flex justify-center flex-1 sm:flex-none items-center gap-2 bg-black text-white border-[3px] border-black px-4 sm:px-6 md:px-8 py-3 md:py-4 font-black uppercase text-sm sm:text-base shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                        >
                            Install CLI
                        </Link>

                        <Link
                            to="/documentation"
                            className="flex justify-center flex-1 sm:flex-none items-center gap-2 bg-[#7EA0FD] text-black border-[3px] border-black px-4 sm:px-6 md:px-8 py-3 md:py-4 font-black uppercase text-sm sm:text-base shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
                        >
                            Documentation
                        </Link>
                    </div>

                    <div className="mt-6 sm:mt-8 md:mt-12 flex flex-wrap gap-3 sm:gap-4 md:gap-8 text-xs sm:text-sm font-bold text-gray-500">
                        <div className="flex items-center gap-2">
                            <ShieldCheck size={16} className="text-black sm:w-[18px] sm:h-[18px]" /> 99.9% Uptime
                        </div>
                        <div className="flex items-center gap-2">
                            <Zap size={16} className="text-black sm:w-[18px] sm:h-[18px]" /> &lt; 10ms Latency
                        </div>
                    </div>
                </div>
            </div>

            {/* --- 3D SCENE --- */}
            <div className="absolute inset-0 z-0 h-full">
                <Canvas camera={{ position: [0, 0, 5], fov: 40 }}>
                    <ambientLight intensity={0.7} />
                    <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1.5} castShadow />
                    <directionalLight position={[-5, 5, -5]} intensity={0.5} color="white" />

                    <Suspense fallback={null}>
                        {/* pages={3}: Defines the scrollable height.
                            damping={0.2}: Makes the movement feel smooth and heavy.
                        */}
                        <ScrollControls pages={2} damping={0.15}>
                            <Model />
                        </ScrollControls>
                    </Suspense>

                    <Environment preset="city" />
                </Canvas>
            </div>
        </div>
    );
}

export default Home;